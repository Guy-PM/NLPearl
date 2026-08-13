# =============================================================================
# Frontend - Multi-stage Docker build
# =============================================================================
# Not using Next's `output: standalone` tracing — it requires filesystem
# symlink privileges that aren't available in every dev environment (see
# next.config.js). Instead this mirrors the backend's deps/builder/deps-prod
# pattern: a full prod node_modules tree + the plain `next build` output.
#
# NEXT_PUBLIC_API_BASE_URL is baked in at build time (Next.js inlines
# NEXT_PUBLIC_* vars into the client bundle).
# =============================================================================

FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
FROM deps AS builder

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

COPY packages/shared-types/ packages/shared-types/
COPY apps/frontend/ apps/frontend/
COPY tsconfig.base.json ./

RUN cd packages/shared-types && ../../node_modules/.bin/tsc -p tsconfig.json
RUN cd apps/frontend && ../../node_modules/.bin/next build

# -----------------------------------------------------------------------------
FROM node:20-slim AS deps-prod

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --prod --frozen-lockfile

# -----------------------------------------------------------------------------
FROM node:20-slim AS runtime

RUN groupadd -g 1001 nlpearl && useradd -m -u 1001 -g nlpearl nlpearl
WORKDIR /app

COPY --from=deps-prod /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/.npmrc ./
COPY --from=deps-prod /app/node_modules                        ./node_modules
COPY --from=deps-prod /app/apps/frontend/node_modules           apps/frontend/node_modules
COPY --from=deps-prod /app/packages/shared-types/node_modules  packages/shared-types/node_modules

COPY --from=builder /app/packages/shared-types/package.json packages/shared-types/package.json
COPY --from=builder /app/packages/shared-types/dist          packages/shared-types/dist

COPY --from=builder /app/apps/frontend/package.json     apps/frontend/package.json
COPY --from=builder /app/apps/frontend/next.config.js   apps/frontend/next.config.js
COPY --from=builder /app/apps/frontend/.next            apps/frontend/.next
COPY --from=builder /app/apps/frontend/public           apps/frontend/public

RUN chown -R nlpearl:nlpearl /app
USER nlpearl

ENV NODE_ENV=production
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

WORKDIR /app/apps/frontend
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3010/ || exit 1

CMD ["node", "../../node_modules/.bin/next", "start"]
