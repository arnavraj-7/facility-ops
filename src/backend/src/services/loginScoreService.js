import LoginAttempt from '../models/LoginAttempt.js';
import { parseDevice, ipSubnet, geoLookup, distanceKm } from '../lib/deviceFingerprint.js';

const RECENT_HISTORY_LIMIT = 50;
const FAILED_LOOKBACK_MS = 15 * 60_000;
const IP_VELOCITY_LOOKBACK_MS = 60_000;
const IP_VELOCITY_THRESHOLD = 10;
const IMPOSSIBLE_VELOCITY_KMH = 900;

const WEIGHTS = {
  new_device: 25,
  new_subnet: 15,
  new_country: 30,
  impossible_travel: 40,
  unusual_hour: 10,
  recent_failures: 20,
  ip_velocity: 25,
};

export const SUSPICION_THRESHOLD = 50;

export const scoreLogin = async ({ userId, ip, userAgent }) => {
  const device = parseDevice(userAgent);
  const subnet = ipSubnet(ip);
  const geo = geoLookup(ip);

  const reasons = [];
  let score = 0;

  // First login? Skip scoring.
  const everSucceeded = await LoginAttempt.exists({ userId, success: true });
  if (!everSucceeded) {
    return { score: 0, reasons: ['first_login'], device, geo, subnet };
  }

  const history = await LoginAttempt.find({ userId, success: true })
    .sort({ createdAt: -1 })
    .limit(RECENT_HISTORY_LIMIT)
    .lean();

  const seenDevices = new Set(history.map(h => h.uaHash).filter(Boolean));
  if (!seenDevices.has(device.uaHash)) { score += WEIGHTS.new_device; reasons.push('new_device'); }

  const seenSubnets = new Set(history.map(h => h.ipSubnet).filter(Boolean));
  if (!seenSubnets.has(subnet)) { score += WEIGHTS.new_subnet; reasons.push('new_subnet'); }

  const seenCountries = new Set(history.map(h => h.country).filter(Boolean));
  if (geo.country && !seenCountries.has(geo.country)) { score += WEIGHTS.new_country; reasons.push('new_country'); }

  const last = history[0];
  if (last && geo.lat != null && last.lat != null) {
    const km = distanceKm(geo, last);
    const hours = (Date.now() - new Date(last.createdAt).getTime()) / (1000 * 60 * 60);
    if (km != null && hours > 0 && km / hours > IMPOSSIBLE_VELOCITY_KMH) {
      score += WEIGHTS.impossible_travel; reasons.push('impossible_travel');
    }
  }

  const hour = new Date().getUTCHours();
  if (hour >= 2 && hour < 6) { score += WEIGHTS.unusual_hour; reasons.push('unusual_hour'); }

  const since = new Date(Date.now() - FAILED_LOOKBACK_MS);
  const fails = await LoginAttempt.countDocuments({ userId, success: false, createdAt: { $gte: since } });
  if (fails >= 3) { score += WEIGHTS.recent_failures; reasons.push('recent_failures'); }

  const ipSince = new Date(Date.now() - IP_VELOCITY_LOOKBACK_MS);
  const distinctUsers = await LoginAttempt.distinct('userId', { ip, createdAt: { $gte: ipSince } });
  if (distinctUsers.length >= IP_VELOCITY_THRESHOLD) { score += WEIGHTS.ip_velocity; reasons.push('ip_velocity'); }

  return { score, reasons, device, geo, subnet };
};

export const recordAttempt = async ({
  userId, email, success, ip, userAgent, device, geo, subnet, score, reasons, requiredStepUp, requestId
}) => {
  await LoginAttempt.create({
    userId: userId || null, email, success, ip, ipSubnet: subnet, userAgent,
    uaHash: device?.uaHash, deviceLabel: device?.label, country: geo?.country,
    region: geo?.region, city: geo?.city, lat: geo?.lat, lng: geo?.lng,
    score, reasons, requiredStepUp, requestId
  });
};