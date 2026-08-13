# =============================================================================
# Backend - Multi-stage Docker build (mirrors PayMe's Titan project pattern)
# =============================================================================
# 1. deps        — install ALL deps (dev + prod), used by the builder stage.
# 2. builder     — generate Prisma client, compile @nlpearl/database + backend.
# 3. deps-prod   — fresh install of PRODUCTION-only deps.
# 4. runtime     — node:20-slim, compiled artefacts + prod-only node_modules.
# =============================================================================

FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/backend/package.json apps/backend/
COPY packages/database/package.json packages/database/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
FROM deps AS builder

COPY packages/database/ packages/database/
COPY packages/shared-types/ packages/shared-types/
COPY apps/backend/ apps/backend/
COPY tsconfig.base.json ./

RUN cd packages/database && ../../node_modules/.bin/prisma generate
RUN cd packages/database && ../../node_modules/.bin/tsc -p tsconfig.json && node scripts/copy-generated.js
RUN cd packages/shared-types && ../../node_modules/.bin/tsc -p tsconfig.json
RUN cd apps/backend && ../../node_modules/.bin/nest build

# -----------------------------------------------------------------------------
FROM node:20-slim AS deps-prod

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/backend/package.json apps/backend/
COPY packages/database/package.json packages/database/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --prod --frozen-lockfile

# -----------------------------------------------------------------------------
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 nlpearl && useradd -m -u 1001 -g nlpearl nlpearl
WORKDIR /app

COPY --from=deps-prod /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/.npmrc ./
COPY --from=deps-prod /app/node_modules                       ./node_modules
COPY --from=deps-prod /app/apps/backend/node_modules           apps/backend/node_modules
COPY --from=deps-prod /app/packages/database/node_modules     packages/database/node_modules
COPY --from=deps-prod /app/packages/shared-types/node_modules packages/shared-types/node_modules

COPY --from=builder /app/packages/database/package.json packages/database/package.json
COPY --from=builder /app/packages/database/dist         packages/database/dist
COPY --from=builder /app/packages/database/prisma       packages/database/prisma

COPY --from=builder /app/packages/shared-types/package.json packages/shared-types/package.json
COPY --from=builder /app/packages/shared-types/dist          packages/shared-types/dist

COPY --from=builder /app/apps/backend/package.json apps/backend/package.json
COPY --from=builder /app/apps/backend/dist          apps/backend/dist

RUN chown -R nlpearl:nlpearl /app
USER nlpearl

ENV NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "apps/backend/dist/main.js"]
