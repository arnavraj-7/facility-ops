import { createHash } from 'node:crypto';

/**
 * Server-side device fingerprint.
 *
 * Derived from the stable, passively-supplied characteristics of the client:
 * the user-agent, the accept-language list and the client-hint headers a
 * browser sends on every request. Hashing them gives a compact, non-reversible
 * id that identifies "this browser on this machine" without storing raw
 * headers, and without any client-side JS that a user could spoof trivially.
 *
 * This is deliberately NOT a security boundary — a determined attacker can
 * replay headers. It is a *risk signal*: a login from a fingerprint we have
 * never seen for this account is worth an extra check.
 */
const FINGERPRINT_HEADERS = [
  'user-agent',
  'accept-language',
  'sec-ch-ua',
  'sec-ch-ua-platform',
  'sec-ch-ua-mobile',
];

export const deviceFingerprint = (req) => {
  const parts = FINGERPRINT_HEADERS.map((h) => req.get(h) || '');
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
};

/** A short human label for the device list UI, e.g. "Chrome on Windows". */
export const describeDevice = (req) => {
  const ua = req.get('user-agent') || '';

  const browser =
    /edg\//i.test(ua) ? 'Edge'
    : /opr\/|opera/i.test(ua) ? 'Opera'
    : /chrome\//i.test(ua) ? 'Chrome'
    : /safari\//i.test(ua) ? 'Safari'
    : /firefox\//i.test(ua) ? 'Firefox'
    : /curl\//i.test(ua) ? 'curl'
    : 'Unknown browser';

  const os =
    /windows nt/i.test(ua) ? 'Windows'
    : /android/i.test(ua) ? 'Android'
    : /iphone|ipad|ipod/i.test(ua) ? 'iOS'
    : /mac os x/i.test(ua) ? 'macOS'
    : /linux/i.test(ua) ? 'Linux'
    : 'Unknown OS';

  return `${browser} on ${os}`;
};
