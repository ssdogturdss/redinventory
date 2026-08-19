# =============================================================
# RCinventory — Multi-stage Dockerfile
# Builds the API server and the React web frontend.
# The API is served by Node.js; static web assets are served
# by nginx in docker-compose.yml.
# =============================================================

# ---- base -------------------------------------------------------
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ---- deps -------------------------------------------------------
FROM base AS deps
# Copy manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                          lib/db/package.json
COPY lib/api-zod/package.json                     lib/api-zod/package.json
COPY lib/api-spec/package.json                    lib/api-spec/package.json
COPY lib/api-client-react/package.json            lib/api-client-react/package.json
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/package.json
COPY lib/integrations-openai-ai-react/package.json  lib/integrations-openai-ai-react/package.json
COPY artifacts/api-server/package.json            artifacts/api-server/package.json
COPY artifacts/rcinventory/package.json           artifacts/rcinventory/package.json
RUN pnpm install --frozen-lockfile

# ---- build-api --------------------------------------------------
FROM deps AS build-api
COPY tsconfig.json tsconfig.base.json ./
COPY lib/ lib/
COPY artifacts/api-server/ artifacts/api-server/
RUN pnpm --filter @workspace/api-server run build

# ---- build-web --------------------------------------------------
FROM deps AS build-web
COPY tsconfig.json tsconfig.base.json ./
COPY lib/ lib/
COPY artifacts/rcinventory/ artifacts/rcinventory/
ENV NODE_ENV=production
RUN pnpm --filter @workspace/rcinventory run build

# ---- api-runner -------------------------------------------------
FROM node:24-alpine AS api
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install only production deps for api-server
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                          lib/db/package.json
COPY lib/api-zod/package.json                     lib/api-zod/package.json
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/package.json
COPY artifacts/api-server/package.json            artifacts/api-server/package.json
RUN pnpm install --frozen-lockfile --prod

# Copy built API bundle (esbuild produces a self-contained bundle)
COPY --from=build-api /app/artifacts/api-server/dist/ artifacts/api-server/dist/

EXPOSE 5000
ENV PORT=5000 NODE_ENV=production

# Run as non-root
RUN addgroup -S rcapp && adduser -S rcapp -G rcapp
USER rcapp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:$PORT/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]

# ---- web-static -------------------------------------------------
# Exported as a separate stage; used in docker-compose as an nginx image.
FROM nginx:alpine AS web
COPY --from=build-web /app/artifacts/rcinventory/dist/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
