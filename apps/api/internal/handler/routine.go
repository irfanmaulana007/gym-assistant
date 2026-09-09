package handler

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/middleware"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

type routineService interface {
	List(ctx context.Context, userID string) ([]domain.Routine, error)
	Create(ctx context.Context, userID, name, notes string) (*domain.Routine, error)
	Get(ctx context.Context, userID, id string) (*domain.Routine, error)
	Update(ctx context.Context, userID, id string, name, notes *string, position *int) (*domain.Routine, error)
	Delete(ctx context.Context, userID, id string) error
	Reorder(ctx context.Context, userID string, orderedIDs []string) error
}

// RoutineHandler handles routine endpoints.
type RoutineHandler struct {
	svc routineService
}

// NewRoutineHandler builds a RoutineHandler.
func NewRoutineHandler(svc routineService) *RoutineHandler {
	return &RoutineHandler{svc: svc}
}

type createRoutineRequest struct {
	Name  string `json:"name"`
	Notes string `json:"notes"`
}

type updateRoutineRequest struct {
	Name     *string `json:"name"`
	Notes    *string `json:"notes"`
	Position *int    `json:"position"`
}

type reorderRequest struct {
	IDs []string `json:"ids"`
}

// List returns the user's routines.
func (h *RoutineHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	routines, err := h.svc.List(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"routines": routines})
}

// Create creates a routine.
func (h *RoutineHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req createRoutineRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	routine, err := h.svc.Create(r.Context(), userID, req.Name, req.Notes)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, routine)
}

// Get returns a routine with its exercises.
func (h *RoutineHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	routine, err := h.svc.Get(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, routine)
}

// Update updates a routine.
func (h *RoutineHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req updateRoutineRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	routine, err := h.svc.Update(r.Context(), userID, chi.URLParam(r, "id"), req.Name, req.Notes, req.Position)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, routine)
}

// Delete deletes a routine.
func (h *RoutineHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if err := h.svc.Delete(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Reorder applies a new routine ordering.
func (h *RoutineHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req reorderRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Reorder(r.Context(), userID, req.IDs); err != nil {
		httpx.WriteError(w, err)
		return
	}
	routines, err := h.svc.List(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"routines": routines})
}
