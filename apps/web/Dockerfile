# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Gym Assistant Web — React + Vite + TypeScript frontend.
#
# Multi-stage build:
#   1. builder — installs workspace deps with npm and produces the static
#      production bundle (dist/) with `vite build`.
#   2. runtime — nginx serving the static files with SPA history fallback.
#
# IMPORTANT — every VITE_* value is baked in at BUILD time. Vite inlines
# `import.meta.env.VITE_*` into the bundle, so each must be provided as a build
# ARG, not a runtime env var:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://api.example.com \
#     --build-arg VITE_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project> \
#     --build-arg VITE_SENTRY_ENVIRONMENT=production \
#     --build-arg VITE_ANATOME_BASE_URL=https://api.anatome.dev \
#     -t gym-assistant-web .
# A VITE_* ARG left unset bakes an empty value (e.g. no SENTRY_DSN -> Sentry off).
#
# Build context is the REPOSITORY ROOT — apps/web is an npm workspace and its
# lockfile (package-lock.json) lives at the repo root.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS builder

WORKDIR /repo

# Install dependencies against the committed lockfile for reproducible builds.
# Copy the workspace manifests first so this layer caches until deps change.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# Bring in the web source and build.
COPY apps/web/ apps/web/

# Compiled into the bundle by Vite at build time. Each VITE_* value must be an
# ARG+ENV pair here or Vite inlines an empty string:
#   - VITE_API_BASE_URL        the API origin        (apps/web/src/api/client.ts)
#   - VITE_SENTRY_DSN          Sentry DSN; empty = Sentry disabled (apps/web/src/sentry.ts)
#   - VITE_SENTRY_ENVIRONMENT  Sentry environment label (optional)
#   - VITE_ANATOME_BASE_URL    anatome service URL   (apps/web/src/lib/muscleDiagram.ts)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ARG VITE_SENTRY_ENVIRONMENT
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
ARG VITE_ANATOME_BASE_URL
ENV VITE_ANATOME_BASE_URL=${VITE_ANATOME_BASE_URL}

RUN npm run build --workspace apps/web

# ---------------------------------------------------------------------------

FROM nginx:1.27-alpine AS runtime

# SPA-aware config: unknown routes fall back to index.html so react-router
# client-side routes (e.g. /profile) load on hard refresh / deep link.
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine already runs the correct CMD; keep it explicit for clarity.
CMD ["nginx", "-g", "daemon off;"]
