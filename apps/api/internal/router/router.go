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
	Routine  *handler.RoutineHandler
	Exercise *handler.ExerciseHandler
	Session  *handler.SessionHandler
	Verifier middleware.TokenVerifier
	// AllowedOrigins are the browser origins permitted by CORS.
	AllowedOrigins []string
}

// New builds the top-level HTTP router.
func New(deps Deps) http.Handler {
	r := chi.NewRouter()

	// CORS runs first so even 404/405 and preflight responses carry the headers
	// browsers require.
	r.Use(middleware.CORS(deps.AllowedOrigins))
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)

	// Health/readiness probes live outside the versioned API surface.
	r.Get("/healthz", deps.Health.Live)
	r.Get("/readyz", deps.Health.Ready)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", deps.Health.Live)

		if deps.Auth != nil {
			r.Post("/auth/register", deps.Auth.Register)
			r.Post("/auth/login", deps.Auth.Login)
		}

		// Everything below requires a valid bearer token.
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth(deps.Verifier))

			if deps.Auth != nil {
				r.Get("/auth/me", deps.Auth.Me)
			}

			if deps.Routine != nil {
				r.Get("/routines", deps.Routine.List)
				r.Post("/routines", deps.Routine.Create)
				r.Patch("/routines/reorder", deps.Routine.Reorder)
				r.Get("/routines/{id}", deps.Routine.Get)
				r.Patch("/routines/{id}", deps.Routine.Update)
				r.Delete("/routines/{id}", deps.Routine.Delete)
			}

			if deps.Exercise != nil {
				r.Post("/routines/{routineId}/exercises", deps.Exercise.Create)
				r.Patch("/routines/{routineId}/exercises/reorder", deps.Exercise.Reorder)
				r.Patch("/exercises/{id}", deps.Exercise.Update)
				r.Delete("/exercises/{id}", deps.Exercise.Delete)
				r.Get("/exercises/{id}/history", deps.Exercise.History)
			}

			if deps.Session != nil {
				// Lifecycle.
				r.Post("/routines/{routineId}/sessions", deps.Session.Start)
				r.Get("/sessions", deps.Session.List)
				r.Get("/sessions/{id}", deps.Session.Get)
				r.Post("/sessions/{id}/pause", deps.Session.Pause)
				r.Post("/sessions/{id}/resume", deps.Session.Resume)
				r.Post("/sessions/{id}/complete", deps.Session.Complete)
				r.Post("/sessions/{id}/abandon", deps.Session.Abandon)
				// Checklist & ad-hoc.
				r.Post("/sessions/{id}/exercises", deps.Session.AddExercise)
				r.Patch("/session-exercises/{id}", deps.Session.UpdateSessionExercise)
				r.Delete("/session-exercises/{id}", deps.Session.DeleteSessionExercise)
				// Set entries.
				r.Post("/session-exercises/{id}/entries", deps.Session.CreateEntry)
				r.Patch("/entries/{id}", deps.Session.UpdateEntry)
				r.Delete("/entries/{id}", deps.Session.DeleteEntry)
			}
		})
	})

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		httpx.Error(w, http.StatusNotFound, httpx.CodeNotFound, "resource not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		httpx.Error(w, http.StatusMethodNotAllowed, httpx.CodeBadRequest, "method not allowed", nil)
	})

	return r
}
