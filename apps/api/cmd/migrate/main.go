// Command migrate applies the embedded SQL migrations to the configured
// database and exits. It is the standalone counterpart to the server's
// startup migration step, so operators (and CI) can run migrations without
// starting the HTTP server. Applying migrations is idempotent — already-applied
// migrations are skipped.
package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/config"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/database"
	"github.com/irfanmaulana007/gym-assistant/apps/api/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("migrate failed", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	logger.Info("applying migrations")
	if err := database.Migrate(ctx, pool, migrations.FS); err != nil {
		return err
	}
	logger.Info("migrations applied")
	return nil
}
