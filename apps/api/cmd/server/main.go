// Command server is the Gym Assistant API entrypoint. It loads config, connects
// to PostgreSQL, applies migrations, builds the router, and serves HTTP with
// graceful shutdown.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/app"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/config"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/database"
	"github.com/irfanmaulana007/gym-assistant/apps/api/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx := context.Background()
	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	logger.Info("applying migrations")
	if err := database.Migrate(ctx, pool, migrations.FS); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           app.New(pool, app.Config{JWTSecret: cfg.JWTSecret, AccessTokenTTL: cfg.AccessTokenTTL, AllowedOrigins: cfg.AllowedOrigins}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Serve until an interrupt, then drain in-flight requests.
	serverErr := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		return err
	case <-stop:
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}
