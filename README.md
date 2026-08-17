# NLPearl Orchestrator

Backend + frontend service that sits between N8N and NLPearl to drive
AI-voice-call flows: receives a record from N8N, sends a preliminary
SMS, waits, triggers an NLPearl call, reacts to in-call consent and
call-ended webhooks, and exposes a dashboard + flow config UI.

Core flow: flow ingestion → delayed call trigger → consent webhook →
call-ended webhook → dashboard. On top of that:

- **Identity & dedup** — a record is identified by `(phone, flowType, mpl)`;
  an exact match is a no-op duplicate or an "another attempt" update,
  anything else is a new record.
- **CTA completion** — a separate N8N webhook confirms when a client
  actually completed the requested action; once confirmed, all further
  automated outreach for that record stops.
- **Scheduled sending** — per-flow cron schedule (`FlowConfig.sendSchedule`)
  for batching sends instead of firing immediately on ingest.
- **Auto-retry** — configurable per flow (`maxRetryAttempts`,
  `retryDelayMinutes`, call/conversation status codes, min call duration),
  covering both a bad call outcome and a call that failed to trigger at all.
- **Manual controls** — Resend (bypasses retry caps and the CTA guard)
  and Delete, both from the record detail page.

See `docs/support-guide.md` for a non-technical walkthrough of what all
of this means in the dashboard.

## Structure

```
apps/backend/     NestJS API + webhooks
apps/frontend/    Next.js dashboard + flow config UI
packages/database/ Prisma schema + client
packages/shared-types/ Shared TS types/enums used by both apps
docs/             Support guide (non-technical)
deploy/           Deploy docs + configs
```

## Local development

Requires PostgreSQL running locally (see `.env.example` for
`DATABASE_URL`).

```bash
pnpm install
cp .env.example .env            # then fill in real secrets
pnpm --filter database migrate:dev
pnpm dev:backend                # http://localhost:3001
pnpm dev:frontend               # http://localhost:3000
```

## Deployment

Docker + single VPS per environment, same pattern as PayMe's other
internal tools. See `deploy/README.md`.
