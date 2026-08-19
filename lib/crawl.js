import crypto from 'node:crypto';
import { safeFetch, normalizeUrl } from './security.js';
import { htmlToText, extractLinks, extractTitle, strategicLinkScore, extractFeeds } from './html.js';

async function fetchPage(url) {
  const response = await safeFetch(url, { timeoutMs: 12000 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text') && !type.includes('html') && !type.includes('xml')) throw new Error(`Unsupported content type: ${type}`);
  const raw = await response.text();
  return { url: response.url || url, title: extractTitle(raw), raw, text: htmlToText(raw).slice(0, 30000) };
}

export async function crawlStartup(inputUrl, pageLimit = Number(process.env.SCAN_PAGE_LIMIT || 6)) {
  const base = normalizeUrl(inputUrl);
  const home = await fetchPage(base.toString());
  const canonical = normalizeUrl(home.url || base.toString());
  const feeds = extractFeeds(home.raw, canonical.toString());
  const links = extractLinks(home.raw, canonical.toString())
    .map(link => ({ ...link, score: strategicLinkScore(link, canonical.hostname) }))
    .filter(link => link.score > 0)
    .sort((a,b) => b.score - a.score);
  const unique = [];
  const seen = new Set([base.toString().replace(/\/$/, '')]);
  for (const link of links) {
    const clean = link.url.split('#')[0].replace(/\/$/, '');
    if (!seen.has(clean)) { seen.add(clean); unique.push(link.url); }
    if (unique.length >= Math.max(0, pageLimit - 1)) break;
  }
  const pages = [home];
  const results = await Promise.allSettled(unique.map(fetchPage));
  for (const result of results) if (result.status === 'fulfilled') pages.push(result.value);
  return {
    homepage: canonical.toString(),
    domain: canonical.hostname.replace(/^www\./, ''),
    pages: pages.map(p => ({ url: p.url, title: p.title, text: p.text })),
    feeds,
    combinedText: pages.map(p => `SOURCE: ${p.url}\nTITLE: ${p.title}\n${p.text}`).join('\n\n').slice(0, 110000)
  };
}

export async function fetchSnapshot(url) {
  const response = await safeFetch(url, { timeoutMs: 12000 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text') && !type.includes('html') && !type.includes('xml') && !type.includes('json')) throw new Error(`Unsupported content type: ${type}`);
  const raw = await response.text();
  const text = htmlToText(raw).slice(0, 60000);
  return { text, hash: crypto.createHash('sha256').update(text).digest('hex'), title: extractTitle(raw) };
}
