package api

import (
	"context"
	"testing"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/app"
)

// TestMigrateIdempotent_E2E guards the behaviour behind `make migrate`
// (cmd/migrate): applying the embedded migrations against a real database
// populates schema_migrations and creates the schema, and re-applying is a
// no-op rather than an error. newHarnessWithDB already resets the schema and
// runs migrations once, so this asserts the recorded state and a second run.
func TestMigrateIdempotent_E2E(t *testing.T) {
	h := newHarnessWithDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	var applied int
	if err := h.pool.QueryRow(ctx,
		`SELECT count(*) FROM schema_migrations`).Scan(&applied); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if applied == 0 {
		t.Fatal("expected at least one recorded migration after first run")
	}

	// A known table from the initial schema must exist.
	var routinesExists bool
	if err := h.pool.QueryRow(ctx,
		`SELECT to_regclass('public.routines') IS NOT NULL`).Scan(&routinesExists); err != nil {
		t.Fatalf("check routines table: %v", err)
	}
	if !routinesExists {
		t.Fatal("routines table missing after migrations applied")
	}

	// Re-running migrations must be idempotent: no error, no new rows.
	if err := app.Migrate(ctx, h.pool); err != nil {
		t.Fatalf("re-apply migrations: %v", err)
	}
	var afterRerun int
	if err := h.pool.QueryRow(ctx,
		`SELECT count(*) FROM schema_migrations`).Scan(&afterRerun); err != nil {
		t.Fatalf("count schema_migrations after rerun: %v", err)
	}
	if afterRerun != applied {
		t.Errorf("schema_migrations count changed on rerun: got %d, want %d", afterRerun, applied)
	}
}
