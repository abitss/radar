import assert from 'node:assert/strict';
import { normalizeUrl, assertSafePublicUrl, clampScore } from '../lib/security.js';
import { htmlToText, extractFeeds, extractLinks } from '../lib/html.js';
import { seal, unseal } from '../lib/cryptoBox.js';

process.env.APP_SECRET = 'radar-smoke-test-secret-that-is-long-enough-123456';
assert.equal(normalizeUrl('example.com').toString(), 'https://example.com/');
assert.equal(clampScore(130), 100);
assert.equal(clampScore(-4), 0);
assert.equal(htmlToText('<h1>Hello</h1><script>bad()</script><p>World</p>'), 'Hello World');
assert.deepEqual(extractFeeds('<link rel="alternate" type="application/rss+xml" href="/feed.xml">','https://example.com'), ['https://example.com/feed.xml']);
assert.equal(extractLinks('<a href="/pricing">Pricing</a>','https://example.com')[0].url,'https://example.com/pricing');
const boxed=seal('https://hooks.example.com/abc');
assert.equal(unseal(boxed),'https://hooks.example.com/abc');
for (const unsafe of ['http://127.0.0.1:3000','http://10.0.0.1','http://169.254.169.254','http://[::1]','http://[::ffff:10.0.0.1]']) {
  let blocked=false;try{await assertSafePublicUrl(unsafe)}catch{blocked=true}assert.equal(blocked,true,`Expected SSRF target to be blocked: ${unsafe}`);
}
console.log('RADAR smoke tests passed: URL normalization, IPv4/IPv6 SSRF literal blocking, HTML cleanup, feed/link extraction, score clamping, integration encryption.');
