// Package api holds black-box, end-to-end HTTP tests for the Gym Assistant API.
// They exercise the assembled application (apps/api/app) over a real HTTP
// transport, asserting the full request→response round-trip.
//
// DB-backed tests require a throwaway PostgreSQL reachable via TEST_DATABASE_URL
// and are skipped (not failed) when it is unset, so the suite stays green in
// environments without a database while running fully in CI/local-with-DB.
package api

import (
	"context"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/app"
)

const testJWTSecret = "test-secret-do-not-use-in-production"

// harness is a running API test server plus its (optional) database pool.
type harness struct {
	server *httptest.Server
	pool   *pgxpool.Pool
}

// newHarnessNoDB builds an API server with no database — suitable for routes
// that do not touch the database (e.g. liveness). Runs in any environment.
func newHarnessNoDB(t *testing.T) *harness {
	t.Helper()
	srv := httptest.NewServer(app.New(nil, app.Config{JWTSecret: testJWTSecret}))
	t.Cleanup(srv.Close)
	return &harness{server: srv}
}

// newHarnessWithDB connects to TEST_DATABASE_URL, applies migrations onto a
// clean schema, and builds an API server against it. It skips the test when no
// database URL is configured.
func newHarnessWithDB(t *testing.T) *harness {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB-backed e2e test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pool, err := app.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect test db: %v", err)
	}
	resetSchema(t, ctx, pool)
	if err := app.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}

	srv := httptest.NewServer(app.New(pool, app.Config{JWTSecret: testJWTSecret}))
	t.Cleanup(func() {
		srv.Close()
		pool.Close()
	})
	return &harness{server: srv, pool: pool}
}

// resetSchema drops and recreates the public schema so each DB-backed test run
// starts from a clean slate.
func resetSchema(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatalf("reset schema: %v", err)
	}
}
