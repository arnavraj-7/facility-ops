import crypto from 'node:crypto';
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

export const parseDevice = (userAgent = '') => {
  const ua = new UAParser(userAgent);
  const browser = ua.getBrowser();
  const os = ua.getOS();
  const device = ua.getDevice();
  
  const label = [
    browser.name || 'Unknown',
    os.name || 'Unknown',
    device.type || 'desktop',
  ].join(' / ');
  
  return { label, uaHash: sha256(userAgent) };
};

export const ipSubnet = (ip) => {
  if (!ip) return null;
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 4).join(':') + '::/64';
  }
  return ip.split('.').slice(0, 3).join('.') + '.0/24';
};

export const geoLookup = (ip) => {
  const r = geoip.lookup(ip) || {};
  return {
    country: r.country || null,
    region: r.region || null,
    city: r.city || null,
    lat: r.ll?.[0] ?? null,
    lng: r.ll?.[1] ?? null,
  };
};

export const distanceKm = (a, b) => {
  if (a.lat == null || b.lat == null) return null;
  const R = 6371; // Earth's radius
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};