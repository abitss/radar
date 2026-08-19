# RADAR Ultimate

**RADAR is an AI-native competitive and market intelligence platform for startup founders.** A founder registers, enters a company website, and RADAR stores the registration/workspace timestamps, profiles the startup from first-party public evidence, performs live-web competitor research, builds a competitive universe, registers strategic sources, stores baselines, monitors changes, filters noise, generates evidence-backed signals, creates briefings, and answers market questions.

## Product loop

**Discover → Understand → Monitor → Interpret → Act**

The build is intentionally evidence-first. A blocked source is marked unhealthy. Weak evidence stays low-confidence. AI output is never a substitute for a source record.

## What works

- Signup/login/logout with scrypt password hashing and revocable DB sessions
- Workspace isolation and stored registration timestamps
- One-URL startup onboarding
- SSRF-safe public website crawling with redirect re-validation
- Website/product/pricing/blog/careers/changelog source discovery
- RSS/Atom feed discovery
- Editable-ready structured company profile data model
- Live-web competitive discovery and recurring market-event research
- OpenAI, Anthropic, Gemini and OpenAI-compatible AI provider modes
- Tavily/Brave/Serper live-web search adapters for non-OpenAI providers
- Direct / adjacent / substitute / emerging threat / incumbent / watchlist classification
- Similarity, threat, confidence and component scoring
- Manual competitor add/remove
- Source baselines and snapshot history
- Continuous semantic change detection
- Noise filtering for non-strategic website churn
- Structured signals with impact/confidence/fact-vs-inference
- Evidence vault with clickable public sources
- Today intelligence home
- Deep company intelligence profiles with score breakdowns, signal history, sources and evidence
- Discover, Companies, searchable Signals, interactive Market Map, Briefings, Ask RADAR, Sources & Alerts, Settings
- Manual "Scan market now" checks monitored sources + fresh live-web market events
- 20-second UI live-status polling
- Background worker for near-real-time self-hosted monitoring
- Protected cron endpoint for serverless schedulers
- Continuous competitor rediscovery every ~12 hours when maintenance runs
- Recurring live-web research for funding, launches, pricing, hiring, partnerships, geography and other strategic events
- Daily/weekly/monthly briefing generation; automated daily/weekly email delivery when configured
- In-app, email, Slack, Teams, generic webhook and WhatsApp delivery paths
- Encrypted integration endpoints at rest
- Founder feedback loop: useful / not useful / too noisy
- DB-backed rate limiting for expensive/auth endpoints
- Docker deployment + Vercel deployment + ordinary Node deployment

## Requirements

- Node.js 22+
- PostgreSQL 14+ (Neon, Supabase Postgres, Railway Postgres, Render Postgres, local Postgres, etc.)
- At least one AI configuration

### Best AI configuration

For the simplest live-web setup use OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
AI_MODEL=gpt-5.6
```

RADAR calls the Responses API with the built-in `web_search` tool for current web research and captures URL citations/source lists.

### Alternative AI providers

Anthropic and Gemini are supported natively. For current-web grounding with those providers, configure Tavily, Brave Search, or Serper.

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
AI_MODEL=your-claude-model
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=...
```

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
AI_MODEL=gemini-3.7-flash
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=...
```

Any OpenAI-compatible chat-completions provider can also be used for analysis:

```env
AI_PROVIDER=compatible
AI_API_KEY=...
AI_BASE_URL=https://provider.example/v1
AI_MODEL=your-model
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=...
```

Search adapters also support `brave` and `serper`.

## Local setup on Windows PowerShell

```powershell
Expand-Archive .\RADAR_Ultimate.zip -DestinationPath .\RADAR_Ultimate -Force
cd .\RADAR_Ultimate
npm install
Copy-Item .env.example .env.local
```

Generate secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run that twice and put different values into `SESSION_SECRET` and `CRON_SECRET`. Generate one more for `APP_SECRET` if using webhooks/WhatsApp.

Edit `.env.local`, then:

```powershell
npm run check
npm run dev
```

Open `http://localhost:3000`.

The PostgreSQL schema is created safely with `CREATE TABLE IF NOT EXISTS` on first DB use. No destructive reset command is used.

## Near-real-time monitoring

"Real time" depends on the source and hosting plan. RADAR supports immediate manual scans and source-specific schedules. For the strongest continuous behavior on Railway/Render/a VM, run the web app and a second worker process:

```bash
npm run worker
```

Default worker interval is 5 minutes. Live-web market research is separately throttled by `MARKET_RESEARCH_INTERVAL_MINUTES` (default 240 minutes) to control cost while source checks can run much more frequently. Change with:

```env
MONITOR_INTERVAL_MS=300000
```

For Vercel or other serverless hosts, schedule:

`GET /api/cron/monitor`

with header:

`Authorization: Bearer <CRON_SECRET>`

The included `vercel.json` uses a once-daily schedule so it also works with restrictive entry-tier scheduling. On a plan that supports more frequent cron, change the expression to the interval you want. You can also use an external scheduler without changing application code.

## Verification

```bash
npm run check
npm run build
```

`npm run check` verifies critical files and syntax-checks server modules. `npm run build` is the final framework/compiler validation after dependencies are installed.

## Deployment

See `docs/DEPLOYMENT.md`.

## Trust model

RADAR only crawls public HTTP(S) targets after DNS/private-network checks, re-checks redirects, limits crawl depth, avoids unrestricted scraping, exposes source health, preserves source URLs, separates facts from inference, and scopes private queries by workspace.
