// Package router registers all HTTP routes under /api/v1 and wires handlers.
package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/handler"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/middleware"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

// Deps holds the dependencies routes are built from. Fields are added as later
// feature PRs introduce their handlers.
type Deps struct {
	Health   *handler.HealthHandler
	Auth     *handler.AuthHandler
	Verifier middleware.TokenVerifier
}

// New builds the top-level HTTP router.
func New(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)

	// Health/readiness probes live outside the versioned API surface.
	r.Get("/healthz", deps.Health.Live)
	r.Get("/readyz", deps.Health.Ready)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", deps.Health.Live)

		if deps.Auth != nil {
			r.Route("/auth", func(r chi.Router) {
				r.Post("/register", deps.Auth.Register)
				r.Post("/login", deps.Auth.Login)
				// Authenticated profile.
				r.Group(func(r chi.Router) {
					r.Use(middleware.RequireAuth(deps.Verifier))
					r.Get("/me", deps.Auth.Me)
				})
			})
		}
	})

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		httpx.Error(w, http.StatusNotFound, httpx.CodeNotFound, "resource not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		httpx.Error(w, http.StatusMethodNotAllowed, httpx.CodeBadRequest, "method not allowed", nil)
	})

	return r
}
