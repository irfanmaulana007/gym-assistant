// Package app assembles the HTTP application from its dependencies. It is the
// single wiring point used by both the server entrypoint (cmd/server) and the
// repository's black-box test suite under tests/ — which, being a separate
// module, can import this exported package but not the internal/ ones.
package app

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/database"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/handler"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/router"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/service"
	"github.com/irfanmaulana007/gym-assistant/apps/api/migrations"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/tokens"
)

// Config carries the runtime values handlers/middleware need. It mirrors the
// subset of internal/config the assembled app depends on, so tests can build an
// app without loading the whole environment.
type Config struct {
	JWTSecret      string
	AccessTokenTTL time.Duration
	// AllowedOrigins are the browser origins permitted by CORS.
	AllowedOrigins []string
}

// New builds the top-level HTTP handler wired to the given database pool.
// pool may be nil for tests that only exercise routes needing no database
// (e.g. liveness); auth and other DB-backed routes are only mounted when a pool
// is provided.
func New(pool *pgxpool.Pool, cfg Config) http.Handler {
	var pinger handler.Pinger
	deps := router.Deps{AllowedOrigins: cfg.AllowedOrigins}

	if pool != nil {
		pinger = pool

		ttl := cfg.AccessTokenTTL
		if ttl <= 0 {
			ttl = time.Hour
		}
		issuer := tokens.NewIssuer(cfg.JWTSecret, ttl)

		userRepo := repository.NewUserRepository(pool)
		routineRepo := repository.NewRoutineRepository(pool)
		exerciseRepo := repository.NewExerciseRepository(pool)
		catalogRepo := repository.NewCatalogRepository(pool)
		sessionRepo := repository.NewSessionRepository(pool)

		authSvc := service.NewAuthService(userRepo, issuer)
		routineSvc := service.NewRoutineService(routineRepo, exerciseRepo)
		exerciseSvc := service.NewExerciseService(exerciseRepo, catalogRepo)
		catalogSvc := service.NewCatalogService(catalogRepo)
		sessionSvc := service.NewSessionService(sessionRepo)

		deps.Auth = handler.NewAuthHandler(authSvc)
		deps.Routine = handler.NewRoutineHandler(routineSvc)
		deps.Exercise = handler.NewExerciseHandler(exerciseSvc)
		deps.Catalog = handler.NewCatalogHandler(catalogSvc)
		deps.Session = handler.NewSessionHandler(sessionSvc)
		deps.Verifier = issuer
	}

	deps.Health = handler.NewHealthHandler(pinger)
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
