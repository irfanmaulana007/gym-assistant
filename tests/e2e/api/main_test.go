package api

import (
	"fmt"
	"os"
	"testing"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
)

// TestMain provides a database for the DB-backed e2e tests. Resolution order:
//
//  1. If TEST_DATABASE_URL is already set, use it as-is (CI / a real Postgres).
//  2. Otherwise, start an ephemeral embedded PostgreSQL and point
//     TEST_DATABASE_URL at it, so the full suite runs locally without Docker or
//     a system Postgres.
//  3. If embedded Postgres cannot start, leave TEST_DATABASE_URL unset — the
//     DB-backed tests then skip cleanly rather than fail.
func TestMain(m *testing.M) {
	if os.Getenv("TEST_DATABASE_URL") != "" {
		os.Exit(m.Run())
	}

	const port = 5433
	pg := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			Username("postgres").
			Password("postgres").
			Database("gym_test").
			Port(port),
	)
	if err := pg.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "embedded postgres unavailable (%v); DB-backed e2e tests will skip\n", err)
		os.Exit(m.Run())
	}

	os.Setenv("TEST_DATABASE_URL",
		fmt.Sprintf("postgres://postgres:postgres@localhost:%d/gym_test?sslmode=disable", port))

	code := m.Run()
	_ = pg.Stop()
	os.Exit(code)
}
