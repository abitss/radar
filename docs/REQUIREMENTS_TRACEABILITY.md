# Blueprint → Build Traceability

| Blueprint capability | Implementation |
|---|---|
| Signup/workspace + stored registration dates | users/workspaces/members with `created_at`, Settings visibility |
| Website-based company profiling | SSRF-safe `crawl.js` + AI structured profile + live-web fallback |
| Editable structured profile | Settings `ProfileEditor` + `/api/profile` |
| AI competitor suggestions | live-web discovery with evidence-backed candidates |
| Manual competitor add/remove | Companies UI + `/api/companies` |
| Approve/reject/reclassify candidates | Discover controls + `/api/competitors/action` |
| Continuous unknown-competitor discovery | `refreshDiscovery()` from worker/cron + manual Discover refresh |
| Pricing/product/blog/careers tracking | strategic link discovery + typed sources |
| News/RSS monitoring | RSS/Atom sources + recurring live-web market research |
| Source-dependent near-real-time updates | continuously running worker / protected cron + source frequencies |
| Snapshot/change detection | snapshots + hashes + semantic comparison |
| Noise filtering | semantic detector explicitly excludes trivial churn |
| Cross-source deduplication | recent-event similarity matching + multi-source evidence attachment |
| Signal taxonomy | structured signal categories and fields |
| Importance/confidence | scores stored, surfaced in Today/Signals/company profiles |
| Why this matters / what to review | `impact`, `explanation`, `suggested_action` |
| Fact vs inference | explicit signal field + prompt rules + UI badge |
| Evidence/source view | Evidence Vault + company evidence history |
| Today dashboard | `/dashboard` |
| Discover | `/dashboard/discover` + live discovery refresh |
| Companies | list + `/dashboard/companies/[id]` intelligence profile |
| Searchable Signals | company/category/importance/text filters |
| Market Map | interactive/filterable relationship map |
| Briefings | stored daily/weekly/monthly generation + automatic daily/weekly jobs |
| Ask RADAR | stored workspace graph + optional current live-web grounding |
| Sources & Alerts | coverage, health, check frequency, alert rules, integrations |
| In-app/email/Slack/Teams/webhook/WhatsApp paths | encrypted delivery adapters; external credentials required |
| Feedback loop | useful/not useful/too noisy/wrong interpretation/wrong fact |
| Source health | health/error/last success/next check |
| Async infrastructure | always-on worker + serverless cron endpoint |
| Workspace isolation | membership-scoped private queries and APIs |
| Data retention | configurable snapshot retention in maintenance |
| Security | password hashing, DB sessions, SSRF/redirect checks, rate limits, encrypted integrations, headers |
