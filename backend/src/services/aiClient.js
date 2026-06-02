import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../lib/logger.js';

const AI_URL = env.AI_MICROSERVICE_URL;
const TIMEOUT_MS = 12_000;

/**
 * Keyword-based fallback router. Used when AI is disabled or the Python
 * microservice is unreachable, so raising a ticket never hard-fails on an
 * external dependency. Output shape mirrors the AI service's routing object.
 */
export const heuristicRoute = (description = '') => {
  const text = description.toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));

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

/** Normalize whatever the AI returns into our model's enum casing. */
const normalizeRouting = (routing = {}) => ({
  category: routing.category || 'General',
  priority: String(routing.priority || 'medium').toLowerCase(),
  summary: routing.summary || '',
  assigned_team: routing.assigned_team || 'General_Support',
  requires_hardware_dispatch: !!routing.requires_hardware_dispatch,
});

/**
 * Ask the AI engine to triage a ticket.
 * Returns one of:
 *   { status: 'auto_committed',        routing, threadId, source }
 *   { status: 'pending_human_approval', routing, threadId, source }
 * Always resolves — callers can rely on getting a routing decision.
 */
export const dispatchTicket = async ({ ticketId, description }) => {
  if (!env.AI_ENABLED) {
    return { status: 'auto_committed', routing: heuristicRoute(description), threadId: null, source: 'ai_disabled' };
  }

  try {
    const { data } = await axios.post(
      `${AI_URL}/dispatch`,
      { ticketId, description },
      { timeout: TIMEOUT_MS }
    );

    const routing = normalizeRouting(data.final_routing || data.proposed_routing);

    if (data.status === 'pending_human_approval') {
      return { status: 'pending_human_approval', routing, threadId: data.thread_id, source: 'ai' };
    }
    return { status: 'auto_committed', routing, threadId: data.thread_id || null, source: 'ai' };
  } catch (err) {
    logger.warn(`AI dispatch unavailable, using heuristic fallback: ${err.message}`);
    return { status: 'auto_committed', routing: heuristicRoute(description), threadId: null, source: 'heuristic_fallback' };
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
