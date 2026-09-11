# Deploying Gym Assistant on Dokploy

This guide covers building and deploying the **API** (Go + PostgreSQL) and the
**web** frontend (React + Vite) with Docker, on a self-hosted
[Dokploy](https://dokploy.com) instance.

## What ships in Docker

| Service | Image | Base | Port | Notes |
|---------|-------|------|------|-------|
| API | [`apps/api/Dockerfile`](../apps/api/Dockerfile) | `alpine` (static Go binary) | `8080` | Applies DB migrations on startup |
| Web | [`apps/web/Dockerfile`](../apps/web/Dockerfile) | `nginx:alpine` | `80` | Static SPA; API URL baked at build time |
| DB | `postgres:16-alpine` (compose) or a Dokploy-managed Postgres | — | `5432` | — |

Key facts that shape the deployment:

- **The API auto-migrates.** On boot the server connects to `DATABASE_URL` and
  applies the embedded SQL migrations (idempotent). No separate migrate job.
- **The web app bakes its API URL at build time.** Vite inlines
  `VITE_API_BASE_URL` into the JS bundle. It is a **build argument**, not a
  runtime env var — changing it means rebuilding the web image.
- **Build context is the repository root** for both Dockerfiles (the web app is
  an npm workspace whose lockfile lives at the repo root).

---

## Option A — Deploy each service separately (recommended)

This maps cleanly onto Dokploy's per-application model and lets you point a
domain at each service.

### 1. Create the database

Either use Dokploy's **Databases → PostgreSQL** to provision one (copy the
connection string it gives you), or run your own Postgres. You'll need a
`postgres://user:pass@host:5432/dbname` URL reachable from the API container.

### 2. Deploy the API

1. **Create Application** → source = this Git repo, branch = `main`.
2. **Build Type: Dockerfile.**
   - **Dockerfile Path:** `apps/api/Dockerfile`
   - **Docker Context Path:** `.` (repository root)
3. **Environment** (see [`.env.docker.example`](../.env.docker.example)):

   ```env
   APP_ENV=production
   PORT=8080
   DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/gym_assistant?sslmode=require
   JWT_SECRET=<openssl rand -hex 32>
   ACCESS_TOKEN_TTL_MINUTES=60
   CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
   ```

   - Use `sslmode=require` (or `verify-full`) for a managed/remote Postgres;
     `sslmode=disable` only for an in-network DB.
   - `CORS_ALLOWED_ORIGINS` **must** list the web app's public origin(s),
     comma-separated — otherwise the browser blocks API calls.
4. **Domains / Ports:** expose container port `8080`, attach a domain such as
   `api.yourdomain.com`, and enable HTTPS (Let's Encrypt).
5. Deploy. Check the logs for `applying migrations` then `listening`.

### 3. Deploy the web app

1. **Create Application** → same repo/branch.
2. **Build Type: Dockerfile.**
   - **Dockerfile Path:** `apps/web/Dockerfile`
   - **Docker Context Path:** `.` (repository root)
3. **Build Arguments** (Dokploy → Build → Args):

   ```
   VITE_API_BASE_URL=https://api.yourdomain.com
   ```

   This is the origin the **browser** hits — your public API domain from step 2,
   not an internal hostname.
4. **Domains / Ports:** expose container port `80`, attach `app.yourdomain.com`,
   enable HTTPS. A health check on `/healthz` is available.
5. Deploy.

> Because the API URL is baked in, whenever it changes you must **redeploy the
> web app** (a rebuild), not just restart it.

---

## Option B — Deploy the whole stack with Docker Compose

Dokploy also supports a **Docker Compose** application. Point it at
[`docker-compose.yml`](../docker-compose.yml) at the repo root, which defines
`db` + `api` + `web`.

1. **Create Application → Compose.** Repo = this repo, Compose file =
   `docker-compose.yml`.
2. Set the environment variables from
   [`.env.docker.example`](../.env.docker.example) in Dokploy's Environment tab
   (at minimum `POSTGRES_PASSWORD`, `JWT_SECRET`, `VITE_API_BASE_URL`,
   `CORS_ALLOWED_ORIGINS`).
3. Attach domains to the `web` (`:80`) and `api` (`:8080`) services and enable
   HTTPS. Dokploy fronts them with Traefik.
4. Deploy.

Notes for compose deployments:

- `DATABASE_URL` uses the compose-internal hostname `db` and stays inside the
  Docker network — keep `sslmode=disable` there.
- `VITE_API_BASE_URL` is still a **build arg** (wired through in the compose
  `build.args`); set it to the public API origin the browser will use.
- Postgres data persists in the named volume `db-data`.

---

## Running the full stack locally (parity check)

Verify the exact production images before deploying:

```bash
cp .env.docker.example .env
# edit .env: set POSTGRES_PASSWORD and JWT_SECRET at minimum
docker compose up --build
```

- Web → http://localhost:8081
- API → http://localhost:8080

The default local `.env` sets `VITE_API_BASE_URL=http://localhost:8080` and
`CORS_ALLOWED_ORIGINS=http://localhost:8081` so the two talk to each other.

Build the images individually (matches what Dokploy does):

```bash
# API
docker build -f apps/api/Dockerfile -t gym-assistant-api .

# Web — API URL is a build arg
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com \
  -t gym-assistant-web .
```

---

## Environment variable reference

### API (runtime env)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `APP_ENV` | no | `development` | `development` / `test` / `production` |
| `PORT` | no | `8080` | HTTP listen port |
| `DATABASE_URL` | **yes** | — | Postgres connection string (pgx/libpq) |
| `JWT_SECRET` | **yes** | — | Signs JWT access tokens — long random value |
| `ACCESS_TOKEN_TTL_MINUTES` | no | `60` | Access-token lifetime |
| `CORS_ALLOWED_ORIGINS` | no | `http://localhost:5173` | Comma-separated allowed browser origins |

### Web (build arg only)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_API_BASE_URL` | build-time | `http://localhost:8080` | API origin baked into the bundle |

---

## Troubleshooting

- **Web loads but every API call fails / CORS errors** — `CORS_ALLOWED_ORIGINS`
  on the API doesn't include the web app's exact origin (scheme + host, no
  trailing slash), or `VITE_API_BASE_URL` was built pointing at the wrong host.
- **Calls go to `localhost:8080` in production** — the web image was built
  without `VITE_API_BASE_URL`. Rebuild the web app with the build arg set.
- **API exits immediately with `invalid configuration`** — `DATABASE_URL` or
  `JWT_SECRET` is missing. The error lists every missing variable.
- **`applying migrations` then a connection error** — the API can't reach
  Postgres: check the host/credentials and whether `sslmode` matches what the
  DB requires.
- **Deep links 404 on refresh** — should not happen; the bundled
  [`nginx.conf`](../apps/web/nginx.conf) does SPA history fallback to
  `index.html`. Confirm the web image was built from this Dockerfile.
