# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Gym Assistant API — Go + PostgreSQL backend.
#
# Multi-stage build:
#   1. builder — compiles a static Linux binary with the Go toolchain.
#   2. runtime — a minimal Alpine image that runs the binary as a non-root user.
#
# The server applies the embedded SQL migrations on startup (see
# apps/api/cmd/server/main.go), so no separate migrate step is required.
#
# Build context is the REPOSITORY ROOT (so paths below are apps/api/...).
#   docker build -f apps/api/Dockerfile -t gym-assistant-api .
# ---------------------------------------------------------------------------

FROM golang:1.25-alpine AS builder

WORKDIR /src

# Cache module downloads: copy manifests first, then the source.
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ ./

# CGO is off — pgx is pure Go, so the binary is fully static and needs no libc
# in the runtime image. Trim symbols/DWARF to shrink the binary.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/server ./cmd/server

# ---------------------------------------------------------------------------

FROM alpine:3.20 AS runtime

# ca-certificates is needed for TLS connections to a managed Postgres
# (e.g. sslmode=require). tzdata gives the container real timezones.
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 appuser

COPY --from=builder /out/server /usr/local/bin/server

USER appuser

# APP listens on $PORT (default 8080). Overridable at runtime.
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/server"]
