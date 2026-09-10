// Command e2eserver boots a fully self-contained API stack for the web
// end-to-end tests: an ephemeral embedded PostgreSQL plus the assembled API
// server. It exists so `apps/web`'s Playwright suite can drive a real backend
// WITHOUT touching the developer's local API (:8080) or local database — the
// whole stack lives on its own throwaway ports and is torn down on exit.
//
// Playwright's webServer starts this process, waits for /healthz, runs the
// specs, then signals it to shut down (which stops embedded PostgreSQL).
//
// Configuration (all optional, test-only — never used in production):
//
//	E2E_API_PORT    HTTP port for the API server        (default 8090)
//	E2E_PG_PORT     Port for the embedded PostgreSQL     (default 5434)
//	E2E_WEB_ORIGIN  Browser origin allowed by CORS       (default http://localhost:4173)
//
// The ports deliberately differ from local dev (:8080 API, :5432 Postgres) and
// from the Go e2e suite's embedded Postgres (:5433) so nothing collides.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"

	"github.com/irfanmaulana007/gym-assistant/apps/api/app"
)

// testJWTSecret signs tokens for the e2e stack only. It is not a real secret and
// must never be used outside tests.
const testJWTSecret = "e2e-secret-do-not-use-in-production"

func main() {
	if err := run(); err != nil {
		log.Fatalf("e2eserver: %v", err)
	}
}

func run() error {
	apiPort := envInt("E2E_API_PORT", 8090)
	pgPort := envInt("E2E_PG_PORT", 5434)
	webOrigin := envStr("E2E_WEB_ORIGIN", "http://localhost:4173")

	// Ephemeral PostgreSQL — same pattern as the Go e2e suite's TestMain, on a
	// distinct port so both suites can run without clashing.
	pg := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			Username("postgres").
			Password("postgres").
			Database("gym_e2e").
			Port(uint32(pgPort)),
	)
	if err := pg.Start(); err != nil {
		return fmt.Errorf("start embedded postgres: %w", err)
	}
	// Ensure Postgres is stopped even on an early error path.
	stopped := false
	stopPG := func() {
		if !stopped {
			stopped = true
			_ = pg.Stop()
		}
	}
	defer stopPG()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dsn := fmt.Sprintf("postgres://postgres:postgres@localhost:%d/gym_e2e?sslmode=disable", pgPort)
	pool, err := app.Connect(ctx, dsn)
	if err != nil {
		return fmt.Errorf("connect embedded postgres: %w", err)
	}
	defer pool.Close()

	if err := app.Migrate(ctx, pool); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	handler := app.New(pool, app.Config{
		JWTSecret:      testJWTSecret,
		AllowedOrigins: []string{webOrigin},
	})
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", apiPort),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		log.Printf("e2eserver: API listening on :%d (postgres :%d, origin %s)", apiPort, pgPort, webOrigin)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// Parent-death watchdog: if our launcher (Playwright's webServer) dies
	// without signalling us — the child would otherwise be reparented to init
	// and keep the embedded Postgres alive on its port, breaking the next run —
	// notice the reparent and shut down anyway. Portable to macOS/Linux (no
	// PR_SET_PDEATHSIG needed).
	parentGone := watchParentDeath()

	var reason string
	select {
	case err := <-serverErr:
		return err
	case <-stop:
		reason = "signal"
	case <-parentGone:
		reason = "parent exited"
	}

	log.Printf("e2eserver: shutting down (%s)", reason)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	// Stop Postgres before returning so the throwaway data directory is
	// released promptly rather than at process exit.
	stopPG()
	return nil
}

// watchParentDeath returns a channel that is closed once this process is
// reparented (its parent PID becomes 1), i.e. the launcher exited.
func watchParentDeath() <-chan struct{} {
	done := make(chan struct{})
	initialPPID := os.Getppid()
	go func() {
		for {
			time.Sleep(500 * time.Millisecond)
			ppid := os.Getppid()
			if ppid == 1 || ppid != initialPPID {
				close(done)
				return
			}
		}
	}()
	return done
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Fatalf("e2eserver: %s must be an integer, got %q", key, v)
	}
	return n
}
