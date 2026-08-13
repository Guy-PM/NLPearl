# Deployment

Single Docker-on-VPS host per environment, same pattern as PayMe's Titan
project (see Titan's `docs/decisions/002-vps-deployment.md`): host-installed
PostgreSQL, two containers on `--network host` bound to `127.0.0.1`, a single
nginx doing path-based routing, TLS terminated at Cloudflare + an AWS Load
Balancer in front of the VPS, deploys via `git push` → bare-repo
`post-receive` hook.

**This VPS is not yet provisioned** — devops needs to stand up a host
following the same bootstrap pattern used for Titan/Form_Builder before any
of this runs for real.

## Layout on the VPS

```
/opt/git/nlpearl.git/           bare repo, post-receive hook installed
/opt/app/nlpearl/               working tree (checked out by the hook)
/opt/app/nlpearl/config/.env.staging   secrets (root-owned, not in git)
```

## One-time setup (once the VPS exists)

1. Create the Postgres role + database on the host:
   ```sql
   CREATE ROLE nlpearl WITH LOGIN PASSWORD '...';
   CREATE DATABASE nlpearl_staging OWNER nlpearl;
   ```
2. `mkdir -p /opt/git/nlpearl.git /opt/app/nlpearl/config`
3. `git init --bare /opt/git/nlpearl.git`
4. Copy `.env.example` to `/opt/app/nlpearl/config/.env.staging` and fill in
   real secrets (`DATABASE_URL`, `NLPEARL_API_KEY`, `N8N_WEBHOOK_API_KEY`,
   `NLPEARL_WEBHOOK_API_KEY`, `NOTIFICATION_GATEWAY_API_KEY`, etc.)
5. Install the hook:
   ```bash
   scp deploy/post-receive.staging ubuntu@<vps>:/opt/git/nlpearl.git/hooks/post-receive
   ssh <vps> 'chmod +x /opt/git/nlpearl.git/hooks/post-receive'
   ```
6. Install `deploy/nginx-staging.conf` as an nginx site and reload nginx.
7. From your machine: `git remote add staging ubuntu@<vps>:/opt/git/nlpearl.git`

## Deploying

```bash
git push staging main
ssh <vps> "tail -100 /opt/app/nlpearl/deploy.log"
ssh <vps> "docker logs nlpearl-backend-staging --tail 50"
ssh <vps> "docker logs nlpearl-frontend-staging --tail 50"
```

## Local Docker verification (not the deploy path)

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
docker compose down
```

Compose is for verifying the containers build and run correctly before
pushing — the actual VPS deploy uses `docker run --network host` directly
(see `post-receive.staging`), not compose.

## NLPearl-side configuration (done in the NLPearl dashboard, not here)

- An **Outbound** campaign per `flow_type` (its id goes into that flow's
  `FlowConfig.nlpearlOutboundId`).
- An **API Node** inside each Pearl's conversation flow, configured to POST
  to `https://<this-service>/api/webhooks/nlpearl/consent` with the
  `X-Api-Key` credential matching `NLPEARL_WEBHOOK_API_KEY`, when the client
  verbally agrees to receive the SMS.
- The native **Call webhook** pointed at
  `https://<this-service>/api/webhooks/nlpearl/call-ended`, with the same
  credential.
