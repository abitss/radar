# RADAR Architecture

## Application
Next.js 16 App Router, React 19, Node 22, PostgreSQL.

## Intelligence pipeline
1. Founder registers → user/session timestamps stored.
2. Founder enters website → workspace/company/scan records created.
3. Safe crawler reads first-party strategic pages and feeds.
4. AI builds structured company profile.
5. Live-web research discovers competitors and evidence.
6. RADAR scores/classifies candidates.
7. Approved competitors receive source discovery.
8. Snapshots become baselines.
9. Worker/cron fetches due sources.
10. Hash comparison finds candidate changes.
11. AI semantic filter removes noise and classifies meaningful changes.
12. Signals + evidence are stored.
13. Alert rules route important signals.
14. Briefings and Ask RADAR synthesize stored intelligence; Ask RADAR can also use current web research.

## Portability
The product does not require Vercel-specific persistence. Next.js can run on Vercel or as a Node/Docker server. The monitor is exposed both as a protected HTTP cron route and a long-running Node worker.

## Storage model
Canonical entities live in PostgreSQL: users, sessions, workspaces, companies, profiles, relationships, sources, snapshots, signals, evidence, scans, briefings, feedback, rules, integrations, notifications.
