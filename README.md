# NLPearl Orchestrator

Backend + frontend service that sits between N8N and NLPearl to drive
AI-voice-call flows: receives a record from N8N, sends a preliminary
SMS, waits, triggers an NLPearl call, reacts to in-call consent and
call-ended webhooks, and exposes a dashboard + flow config UI.

See `docs/system_design.md` (once added) for full architecture, or the
plan this was built from: flow ingestion → delayed call trigger →
consent webhook → call-ended webhook → dashboard.

## Structure

```
apps/backend/     NestJS API + webhooks
apps/frontend/    Next.js dashboard + flow config UI
packages/database/ Prisma schema + client
packages/shared-types/ Shared TS types/enums used by both apps
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
