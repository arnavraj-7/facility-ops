import { haversineKm } from './geo.js';
import { env } from '../config/env.js';

/**
 * Risk-Based Authentication engine.
 *
 * Scores a login attempt against what we know about the account's history and
 * decides whether the password alone is enough, or whether the user must clear
 * a step-up challenge (email OTP).
 *
 * The signals are additive, and each one is individually weak — a new device
 * is normal when someone buys a laptop. It is the *combination* (new device
 * AND a new country) or a single physically impossible signal (travel faster
 * than a plane) that pushes a login over the threshold.
 */

// Commercial aircraft cruise ~900 km/h. Anything faster than this between two
// consecutive logins means the same credentials are in two places at once.
const MAX_PLAUSIBLE_KMH = 900;

// Ignore tiny hops: consecutive logins minutes apart in the same city can
// resolve to slightly different coordinates and produce absurd speeds.
const MIN_TRAVEL_KM = 100;

export const RISK_REASONS = {
  NEW_DEVICE: 'new_device',
  NEW_COUNTRY: 'new_country',
  IMPOSSIBLE_TRAVEL: 'impossible_travel',
  DORMANT_ACCOUNT: 'dormant_account',
};

const WEIGHTS = {
  [RISK_REASONS.NEW_DEVICE]: 40,
  [RISK_REASONS.NEW_COUNTRY]: 35,
  [RISK_REASONS.IMPOSSIBLE_TRAVEL]: 100, // on its own, always a challenge
  [RISK_REASONS.DORMANT_ACCOUNT]: 15,
};

const DORMANT_DAYS = 60;

/**
 * @param {object}   input
 * @param {string}   input.fingerprint  fingerprint of the device logging in now
 * @param {object}   input.geo          resolved location of this attempt
 * @param {object[]} input.knownSessions previous sessions for this account
 * @param {Date|null} input.lastLoginAt
 * @returns {{score:number, reasons:string[], requiresStepUp:boolean, detail:object}}
 */
export const assessRisk = ({ fingerprint, geo, knownSessions = [], lastLoginAt = null }) => {
  const reasons = [];
  const detail = {};

  // A brand-new account with no history is not "risky" — there is nothing to
  // deviate from, and challenging a first login is just friction.
  if (knownSessions.length === 0) {
    return { score: 0, reasons: [], requiresStepUp: false, detail: { firstLogin: true } };
  }

  // ── Signal 1: have we seen this device before? ──────────────────────────
  const knownDevice = knownSessions.some((s) => s.fingerprint === fingerprint);
  if (!knownDevice) reasons.push(RISK_REASONS.NEW_DEVICE);

  // ── Signal 2: a country this account has never logged in from ───────────
  // "local" and "unknown" are not countries — a loopback login carries no
  // location information, so counting it would make the first real-IP login
  // look like a country change for every user.
  const isRealCountry = (c) => !!c && c !== 'unknown' && c !== 'local';

  const knownCountries = new Set(
    knownSessions.map((s) => s.geo?.country).filter(isRealCountry)
  );
  if (isRealCountry(geo?.country) && knownCountries.size > 0 && !knownCountries.has(geo.country)) {
    reasons.push(RISK_REASONS.NEW_COUNTRY);
    detail.newCountry = geo.country;
  }

  // ── Signal 3: impossible travel ─────────────────────────────────────────
  const mostRecent = [...knownSessions]
    .filter((s) => s.geo?.lat != null && s.lastSeenAt)
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))[0];

  if (mostRecent && geo?.lat != null) {
    const km = haversineKm(mostRecent.geo, geo);
    const hours = (Date.now() - new Date(mostRecent.lastSeenAt).getTime()) / 3_600_000;

    if (km != null && km >= MIN_TRAVEL_KM && hours > 0) {
      const kmh = km / hours;
      if (kmh > MAX_PLAUSIBLE_KMH) {
        reasons.push(RISK_REASONS.IMPOSSIBLE_TRAVEL);
        detail.travel = {
          fromCity: mostRecent.geo.city,
          toCity: geo.city,
          km: Math.round(km),
          hours: Number(hours.toFixed(2)),
          impliedKmh: Math.round(kmh),
        };
      }
    }
  }

  // ── Signal 4: account dormant for a long time ───────────────────────────
  if (lastLoginAt) {
    const days = (Date.now() - new Date(lastLoginAt).getTime()) / 86_400_000;
    if (days > DORMANT_DAYS) {
      reasons.push(RISK_REASONS.DORMANT_ACCOUNT);
      detail.dormantDays = Math.round(days);
    }
  }

  const score = reasons.reduce((sum, r) => sum + (WEIGHTS[r] || 0), 0);

  return {
    score,
    reasons,
    requiresStepUp: score >= env.RBA_STEP_UP_THRESHOLD,
    detail,
  };
};

/** Human-readable explanation, shown to the user on the challenge screen. */
export const explainRisk = (reasons = []) => {
  const text = {
    [RISK_REASONS.NEW_DEVICE]: 'a device we have not seen before',
    [RISK_REASONS.NEW_COUNTRY]: 'a new country',
    [RISK_REASONS.IMPOSSIBLE_TRAVEL]: 'a location too far from your last sign-in to be plausible',
    [RISK_REASONS.DORMANT_ACCOUNT]: 'an account that has been inactive for a while',
  };
  const parts = reasons.map((r) => text[r]).filter(Boolean);
  if (parts.length === 0) return 'an unusual sign-in';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};
