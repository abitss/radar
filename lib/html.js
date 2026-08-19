export function decodeEntities(text) {
  return String(text || '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

export function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 180) : '';
}

export function extractLinks(html, baseUrl) {
  const links = [];
  const regex = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html || '')))) {
    try {
      const url = new URL(match[1], baseUrl);
      if (['http:', 'https:'].includes(url.protocol)) links.push({ url: url.toString(), text: htmlToText(match[2]).slice(0, 120) });
    } catch {}
  }
  return links;
}

export function strategicLinkScore(link, primaryHost) {
  try {
    const url = new URL(link.url);
    if (url.hostname !== primaryHost) return -100;
    const hay = `${url.pathname} ${link.text}`.toLowerCase();
    const weights = [
      ['pricing', 20], ['product', 18], ['feature', 16], ['solution', 14], ['career', 13], ['jobs', 13],
      ['about', 11], ['news', 10], ['press', 10], ['blog', 8], ['changelog', 16], ['customer', 8], ['industry', 7]
    ];
    let score = 0;
    for (const [term, weight] of weights) if (hay.includes(term)) score += weight;
    if (url.pathname.split('/').filter(Boolean).length > 3) score -= 5;
    return score;
  } catch { return -100; }
}

export function extractFeeds(html, baseUrl) {
  const feeds = [];
  const regex = /<link\s[^>]*rel=["']alternate["'][^>]*>/gi;
  for (const tag of String(html || '').match(regex) || []) {
    const type = tag.match(/type=["']([^"']+)["']/i)?.[1] || '';
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || !/(rss|atom|xml)/i.test(type)) continue;
    try { feeds.push(new URL(href, baseUrl).toString()); } catch {}
  }
  return [...new Set(feeds)];
}
