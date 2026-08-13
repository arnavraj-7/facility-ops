import { env, isProd } from '../config/env.js';
import logger from './logger.js';

/**
 * IP geolocation, used by the risk engine to spot logins from a new country
 * and to compute impossible travel.
 *
 * Two deliberate properties:
 *  - Private/loopback addresses short-circuit to a "local" result, so a laptop
 *    demo never makes a network call and never blocks a login.
 *  - The provider is pluggable and every failure is swallowed. Geolocation is
 *    a risk *signal*; if the lookup is down, authentication must still work.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // an IP's location doesn't move hourly
const cache = new Map(); // ip -> { at, value }

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
];

export const isPrivateIp = (ip = '') => {
  const clean = ip.replace(/^::ffff:/, '');
  return clean === '' || PRIVATE_RANGES.some((r) => r.test(clean));
};

const LOCAL = Object.freeze({
  ip: 'local',
  country: 'local',
  city: 'local',
  lat: null,
  lon: null,
  isPrivate: true,
});

const UNKNOWN = Object.freeze({
  country: 'unknown',
  city: 'unknown',
  lat: null,
  lon: null,
  isPrivate: false,
});

/**
 * Resolve an IP to a coarse location. Always resolves — never throws, never
 * blocks a login for longer than the timeout.
 */
export const lookupGeo = async (ip) => {
  if (isPrivateIp(ip)) return { ...LOCAL, ip };
  if (!env.GEO_LOOKUP_ENABLED) return { ...UNKNOWN, ip };

  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.GEO_TIMEOUT_MS);

    const url = env.GEO_PROVIDER_URL.replace('{ip}', encodeURIComponent(ip));
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`provider returned ${res.status}`);
    const data = await res.json();

    const value = {
      ip,
      country: data.countryCode || data.country || 'unknown',
      city: data.city || 'unknown',
      lat: typeof data.lat === 'number' ? data.lat : null,
      lon: typeof data.lon === 'number' ? data.lon : null,
      isPrivate: false,
    };

    cache.set(ip, { at: Date.now(), value });
    return value;
  } catch (err) {
    logger.warn(`Geo lookup failed for ${ip}: ${err.message}`);
    return { ...UNKNOWN, ip };
  }
};

/**
 * Great-circle distance in kilometres. Returns null when either point is
 * unknown, so callers can distinguish "didn't move" from "can't tell".
 */
export const haversineKm = (a, b) => {
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null;

  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * The client IP for risk purposes. In non-production a request may override it
 * with X-Demo-IP so impossible travel can actually be demonstrated from a
 * laptop — where every real request arrives from 127.0.0.1.
 */
export const clientIp = (req) => {
  if (!isProd) {
    const demo = req.get('x-demo-ip');
    if (demo) return demo;
  }
  return req.ip || '';
};
