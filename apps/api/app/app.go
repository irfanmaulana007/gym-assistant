// Package app assembles the HTTP application from its dependencies. It is the
// single wiring point used by both the server entrypoint (cmd/server) and the
// repository's black-box test suite under tests/ — which, being a separate
// module, can import this exported package but not the internal/ ones.
package app

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/database"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/handler"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/router"
	"github.com/irfanmaulana007/gym-assistant/apps/api/migrations"
)

// Config carries the runtime values handlers/middleware need. It mirrors the
// subset of internal/config the assembled app depends on, so tests can build an
// app without loading the whole environment.
type Config struct {
	JWTSecret string
}

// New builds the top-level HTTP handler wired to the given database pool.
// pool may be nil for tests that only exercise routes needing no database
// (e.g. liveness).
func New(pool *pgxpool.Pool, _ Config) http.Handler {
	var pinger handler.Pinger
	if pool != nil {
		pinger = pool
	}
	deps := router.Deps{
		Health: handler.NewHealthHandler(pinger),
	}
	return router.New(deps)
}

// Connect opens a database pool. It is a thin re-export of the internal database
// package so the separate tests module (which cannot import internal/) can build
// a pool for black-box e2e tests.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	return database.Connect(ctx, databaseURL)
}

// Migrate applies all embedded migrations to pool. Re-exported for the tests
// module (see Connect).
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	return database.Migrate(ctx, pool, migrations.FS)
}
