# Deployment

## Vercel
1. Push this folder to GitHub.
2. Import repository in Vercel.
3. Attach any PostgreSQL provider and set `DATABASE_URL`.
4. Add `DATABASE_SSL=true`, `CRON_SECRET`, `SESSION_SECRET`, `APP_SECRET`.
5. Add AI variables. OpenAI works with native live-web search; Anthropic, Gemini and OpenAI-compatible providers use a configured Tavily/Brave/Serper search adapter for current-web grounding.
6. Optional: add Resend and WhatsApp variables.
7. Deploy.
8. Visit `/api/health` and confirm database + AI state.
9. Create a real test account and complete onboarding.
10. Trigger `/api/cron/monitor` with the cron secret once to validate scheduled maintenance.

The checked-in Vercel schedule is daily for broad plan compatibility. Increase frequency when your plan supports it.

## Netlify
Import the repository as a Next.js project and configure the same environment variables. For frequent monitoring, use an external scheduler against `/api/cron/monitor` or run RADAR's worker on a separate always-on service. Heavy competitive research can exceed short serverless execution windows, so split/queue workloads or use a background-capable runtime for high-volume production.

## Railway / Render / Fly / VPS

`railway.toml`, `render.yaml`, `Procfile`, and `Dockerfile` are included for fast platform setup. For Railway/Render, create the web service and a second worker service from the same repository.

Deploy the Dockerfile or run:

```bash
npm install
npm run build
npm start
```

Create a second service from the same codebase:

```bash
npm run worker
```

This is the recommended architecture for source-dependent near-real-time monitoring because the worker can run continuously.

## Docker

```bash
docker build -t radar .
docker run --env-file .env -p 3000:3000 radar
```

Use managed PostgreSQL. Do not persist production state on container disk.
