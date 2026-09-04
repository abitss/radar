# RADAR Ultimate in-place upgrade

This branch upgrades the existing RADAR deployment without replacing its configured production secrets.

Launch architecture:

- Existing Render `radar-web` service remains the deployment target.
- Existing PostgreSQL `DATABASE_URL` is preserved.
- Existing `GEMINI_API_KEY` is preserved.
- `npm start` supervises both the Next.js web process and the durable intelligence worker.
- The schema upgrade is additive and preserves legacy users, sessions, workspaces, companies, signals and evidence.
- New intelligence loop: Company Brain → Watch Graph → Signals → RADAR Moves → Decisions → Actions → Outcomes → Learning.
