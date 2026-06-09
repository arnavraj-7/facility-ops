import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TEAMS,
} from '../config/constants.js';

const AI_URL = env.AI_MICROSERVICE_URL;
// Short enough that a hung AI service can never make "raise issue" feel broken.
const TIMEOUT_MS = 6_000;

/**
 * Keyword-based triage engine. This is the default router (AI_ENABLED=false)
 * and also the fallback whenever the Python microservice is unreachable, so
 * raising a ticket never hard-fails on an external dependency. Output shape
 * mirrors the AI service's routing object.
 */
export const heuristicRoute = (description = '') => {
  const text = description.toLowerCase();

  // Match whole words (with common suffixes) rather than raw substrings.
  // Plain `includes` produces bad triage: "misfires" contains "fire" and
  // "shutdown" contains "down", so half the tickets came out critical.
  const has = (...words) =>
    words.some((w) => new RegExp(`\\b${w}(s|es|ed|ing)?\\b`).test(text));

  let category = 'General';
  let assigned_team = 'Core_Platform_Engineers';
  let requires_hardware_dispatch = false;

  if (has('teleport', 'pad', 'transporter')) {
    category = 'Teleportation';
    assigned_team = 'Field_Hardware_Technicians';
    requires_hardware_dispatch = true;
  } else if (has('coolant', 'leak', 'cable', 'server', 'door', 'sensor', 'physical', 'hardware', 'engine')) {
    category = 'Hardware';
    assigned_team = 'Field_Hardware_Technicians';
    requires_hardware_dispatch = true;
  } else if (has('sql', 'database', 'deadlock', 'query', 'postgres', 'mongo', 'data loss')) {
    category = 'Database';
    assigned_team = 'Database_Admin_Squad';
  } else if (has('network', 'dns', 'connectivity', 'packet', 'latency', 'vpn', 'bgp', 'offline')) {
    category = 'Network';
    assigned_team = 'Network_Infrastructure_Team';
  }

  let priority = 'medium';
  if (has('critical', 'outage', 'down', 'fire', 'urgent', 'emergency', 'leak')) priority = 'critical';
  else if (has('fail', 'broken', 'glitch', 'misfire', 'crash', 'high')) priority = 'high';
  else if (has('minor', 'cosmetic', 'typo', 'whenever')) priority = 'low';

  return {
    category,
    priority,
    summary: description.slice(0, 140),
    assigned_team,
    requires_hardware_dispatch,
    source: 'heuristic',
  };
};

/**
 * Normalize whatever the AI returns into our model's enums. An LLM can always
 * hallucinate a label outside the schema; clamping here means a bad completion
 * degrades to a sensible default instead of a Mongoose validation error that
 * would surface to the user as "could not raise ticket".
 */
const oneOf = (allowed, value, fallback) =>
  allowed.includes(value) ? value : fallback;

const normalizeRouting = (routing = {}) => ({
  category: oneOf(TICKET_CATEGORIES, routing.category, 'General'),
  priority: oneOf(
    TICKET_PRIORITIES,
    String(routing.priority || '').toLowerCase(),
    'medium'
  ),
  summary: String(routing.summary || '').slice(0, 500),
  assigned_team: oneOf(TEAMS, routing.assigned_team, 'General_Support'),
  requires_hardware_dispatch: !!routing.requires_hardware_dispatch,
});

/**
 * Ask the AI engine to triage a ticket.
 * Returns one of:
 *   { status: 'auto_committed',        routing, threadId, source }
 *   { status: 'pending_human_approval', routing, threadId, source }
 * Always resolves — callers can rely on getting a routing decision.
 */
export const dispatchTicket = async ({ ticketId, description, title = '' }) => {
  // Title carries a lot of signal ("coolant leak", "DNS") — triage on both.
  const text = `${title} ${description}`.trim();

  if (!env.AI_ENABLED) {
    return {
      status: 'auto_committed',
      routing: normalizeRouting(heuristicRoute(text)),
      threadId: null,
      source: 'heuristic',
    };
  }

  try {
    const { data } = await axios.post(
      `${AI_URL}/dispatch`,
      { ticketId, description: text },
      { timeout: TIMEOUT_MS }
    );

    const routing = normalizeRouting(data.final_routing || data.proposed_routing);

    if (data.status === 'pending_human_approval') {
      return { status: 'pending_human_approval', routing, threadId: data.thread_id, source: 'ai' };
    }
    return { status: 'auto_committed', routing, threadId: data.thread_id || null, source: 'ai' };
  } catch (err) {
    logger.warn(`AI dispatch unavailable, using the built-in triage engine: ${err.message}`);
    return {
      status: 'auto_committed',
      routing: normalizeRouting(heuristicRoute(text)),
      threadId: null,
      source: 'heuristic_fallback',
    };
  }
};

/**
 * Resume a paused AI thread with a manager's decision. Falls back to applying
 * the manager's choice locally if the AI service is unreachable.
 */
export const resumeTicket = async (threadId, { isApproved, correctedTeam }) => {
  if (!threadId || !env.AI_ENABLED) {
    return { finalTeam: correctedTeam || null, wasHumanModified: !!correctedTeam, source: 'local' };
  }

  try {
    const { data } = await axios.post(
      `${AI_URL}/resume/${threadId}`,
      { is_approved: isApproved, corrected_team: correctedTeam || null },
      { timeout: TIMEOUT_MS }
    );
    return { finalTeam: data.final_team, wasHumanModified: data.was_human_modified, source: 'ai' };
  } catch (err) {
    logger.warn(`AI resume unavailable, applying decision locally: ${err.message}`);
    return { finalTeam: correctedTeam || null, wasHumanModified: !!correctedTeam, source: 'local_fallback' };
  }
};
