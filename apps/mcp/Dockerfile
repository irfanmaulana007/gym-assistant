# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Gym Assistant MCP server — remote mode (Streamable HTTP + OAuth, PRD 0023).
#
# Build context is the REPOSITORY ROOT — apps/mcp is an npm workspace and its
# lockfile (package-lock.json) lives at the repo root:
#   docker build -f apps/mcp/Dockerfile -t gym-assistant-mcp .
#
# Runtime config (env): MCP_PUBLIC_URL, MCP_OAUTH_SECRET (required),
# GYM_API_BASE_URL, PORT (default 3000), MCP_TRUST_PROXY, GYM_API_TIMEOUT_MS.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS builder

WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/mcp/package.json apps/mcp/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/mcp --include-workspace-root=false

COPY apps/mcp/ apps/mcp/
RUN npm run build --workspace apps/mcp \
 && npm prune --omit=dev --workspace apps/mcp

# ---------------------------------------------------------------------------

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/mcp/package.json ./package.json
COPY --from=builder /repo/apps/mcp/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/healthz >/dev/null || exit 1

# --import preloads the Sentry instrumentation before app modules so OpenTelemetry
# auto-instrumentation can hook ESM (import-in-the-middle) — required for tracing
# in a "type": "module" package. No-op when SENTRY_DSN is unset.
CMD ["node", "--import", "./dist/instrument.js", "dist/http-main.js"]
