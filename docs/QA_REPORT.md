# RADAR Ultimate QA Report

## Validation executed in the build environment

The final package was validated with the checks that do not require third-party credentials or npm-registry connectivity:

- `npm run check` passed
  - required architecture invariants present
  - 36 server/API modules syntax-checked by Node
- `npm run smoke` passed
  - URL normalization
  - IPv4 and IPv6 literal SSRF blocking
  - HTML cleanup
  - RSS/feed extraction
  - strategic link extraction
  - score clamping
  - AES-256-GCM integration-secret round trip
- Every `.js` / `.mjs` / JSX file was parsed with the TypeScript parser: passed
- Local `@/` and relative import resolution: passed
- `package.json`, `vercel.json`, and `jsconfig.json` JSON validation: passed
- No real production secrets are included

## Runtime build limitation in this sandbox

`npm install` could not complete in the artifact sandbox because outbound npm-registry/DNS access is unavailable. Therefore the Next.js compiler build and credential-dependent end-to-end flows could not be executed here. Run these on the deployment machine or CI runner with normal internet access:

```bash
npm install
npm run check
npm run smoke
npm run build
```

The package pins explicit Node/Next/React/Postgres client versions and contains no generated `node_modules` directory.

## Required credential-backed acceptance test

Before opening production access, validate this sequence against your real Postgres and chosen AI provider:

1. `/api/health` reports database connected and AI configured.
2. User A signs up and creates a workspace.
3. User A enters a real public startup URL.
4. Company profile is created from direct or live-web fallback evidence.
5. Competitors are discovered with evidence and scores.
6. Approve at least five competitors; source coverage is registered.
7. Run **Scan market now** and confirm monitored-source + live-web research completes.
8. Produce at least one controlled meaningful source change and verify signal/evidence creation.
9. Verify trivial/cosmetic change does not create a signal.
10. Ask RADAR a current-market question and inspect returned source links.
11. Generate a weekly briefing.
12. Configure one alert channel and verify delivery.
13. Create User B and verify User B cannot access User A workspace/company/signal/evidence IDs.
14. Trigger `/api/cron/monitor` with the Bearer `CRON_SECRET` and verify maintenance output.
15. Run the always-on worker on a worker-capable host and verify repeated monitoring cycles.

## Quality position

No non-trivial internet-connected system can truthfully be guaranteed to have zero bugs or zero third-party failures. RADAR is designed to expose uncertainty, blocked sources, provider errors and source health instead of fabricating successful intelligence.
