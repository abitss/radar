import dns from 'node:dns/promises';
import net from 'node:net';

export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Website URL is required');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are allowed');
  url.hash = '';
  return url;
}

function ipv4Private(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4) return false;
  return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
    p[0] === 0 || (p[0] >= 224);
}

function ipBlocked(ip) {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:')) return true;
    if (v.startsWith('::ffff:')) {
      const mapped = v.slice('::ffff:'.length);
      if (net.isIPv4(mapped)) return ipv4Private(mapped);
    }
    return false;
  }
  return true;
}

export async function assertSafePublicUrl(input) {
  const url = normalizeUrl(input);
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') {
    throw new Error('Private or local network targets are not allowed');
  }
  const records = await dns.lookup(host, { all: true });
  if (!records.length || records.some((record) => ipBlocked(record.address))) {
    throw new Error('URL resolves to a private or unsafe network address');
  }
  return url;
}


const robotsCache = globalThis.__radarRobotsCache || (globalThis.__radarRobotsCache = new Map());

async function robotsAllows(url) {
  const origin = url.origin;
  const cached = robotsCache.get(origin);
  if (cached && cached.expires > Date.now()) return checkRobotsRules(cached.text, url.pathname);
  try {
    const robotsUrl = new URL('/robots.txt', origin);
    await assertSafePublicUrl(robotsUrl.toString());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(robotsUrl, { headers: { 'user-agent': 'RADAR-Competitive-Intelligence/1.0' }, redirect: 'error', signal: controller.signal });
    clearTimeout(timeout);
    const text = response.ok ? await response.text() : '';
    robotsCache.set(origin, { text, expires: Date.now() + 30 * 60 * 1000 });
    return checkRobotsRules(text, url.pathname);
  } catch {
    robotsCache.set(origin, { text: '', expires: Date.now() + 10 * 60 * 1000 });
    return true;
  }
}

function checkRobotsRules(text, pathname) {
  if (!text) return true;
  const lines = String(text).split(/\r?\n/).map(line => line.split('#')[0].trim()).filter(Boolean);
  let applies = false;
  const disallow = [];
  for (const line of lines) {
    const idx = line.indexOf(':'); if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase(); const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') applies = value === '*' || /radar/i.test(value);
    else if (applies && key === 'disallow' && value) disallow.push(value);
  }
  return !disallow.some(rule => pathname.startsWith(rule));
}

export async function safeFetch(input, options = {}) {
  const initial = await assertSafePublicUrl(input);
  if (!options.skipRobots && !(await robotsAllows(initial))) throw new Error('Blocked by robots.txt');
  let current = initial;
  for (let hop = 0; hop < 4; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
    try {
      const response = await fetch(current, {
        method: options.method || 'GET',
        headers: {
          'user-agent': 'RADAR-Competitive-Intelligence/1.0 (+public-market-research)',
          accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(options.headers || {})
        },
        redirect: 'manual',
        signal: controller.signal
      });
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect without location');
        current = await assertSafePublicUrl(new URL(location, current).toString());
        if (!options.skipRobots && !(await robotsAllows(current))) throw new Error('Redirect target blocked by robots.txt');
        continue;
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Too many redirects');
}

export function clampScore(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}
