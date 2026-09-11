# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Gym Assistant Web — React + Vite + TypeScript frontend.
#
# Multi-stage build:
#   1. builder — installs workspace deps with npm and produces the static
#      production bundle (dist/) with `vite build`.
#   2. runtime — nginx serving the static files with SPA history fallback.
#
# IMPORTANT — the API URL is baked in at BUILD time. Vite inlines
# `import.meta.env.VITE_API_BASE_URL` into the bundle, so it must be provided
# as a build ARG, not a runtime env var. Set it to your deployed API origin:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://api.example.com \
#     -t gym-assistant-web .
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

# Compiled into the bundle by Vite (see apps/web/src/api/client.ts).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

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
