package handler

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/middleware"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/service"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

type exerciseService interface {
	Create(ctx context.Context, userID, routineID string, in repository.ExerciseInput) (*domain.Exercise, error)
	Update(ctx context.Context, userID, id string, in repository.ExerciseInput) (*domain.Exercise, error)
	Delete(ctx context.Context, userID, id string) error
	Reorder(ctx context.Context, userID, routineID string, orderedIDs []string) error
	History(ctx context.Context, userID, exerciseID string) (*service.ExerciseHistory, error)
}

// ExerciseHandler handles exercise endpoints.
type ExerciseHandler struct {
	svc exerciseService
}

// NewExerciseHandler builds an ExerciseHandler.
func NewExerciseHandler(svc exerciseService) *ExerciseHandler {
	return &ExerciseHandler{svc: svc}
}

// exerciseRequest is the JSON body for create/update. All fields are optional on
// update; name is required on create (enforced by the service).
type exerciseRequest struct {
	Name                  *string        `json:"name"`
	MeasurementType       *string        `json:"measurement_type"`
	TargetSets            *int           `json:"target_sets"`
	TargetReps            *int           `json:"target_reps"`
	TargetWeight          *float64       `json:"target_weight"`
	TargetDurationSeconds *int           `json:"target_duration_seconds"`
	TargetDistance        *float64       `json:"target_distance"`
	DistanceUnit          *string        `json:"distance_unit"`
	PrimaryMuscleGroup    *string        `json:"primary_muscle_group"`
	SecondaryMuscleGroups []string       `json:"secondary_muscle_groups"`
	DefaultMetadata       domain.JSONMap `json:"default_metadata"`
	Notes                 *string        `json:"notes"`
}

func (req exerciseRequest) toInput() repository.ExerciseInput {
	return repository.ExerciseInput{
		Name:                  req.Name,
		MeasurementType:       req.MeasurementType,
		TargetSets:            req.TargetSets,
		TargetReps:            req.TargetReps,
		TargetWeight:          req.TargetWeight,
		TargetDurationSeconds: req.TargetDurationSeconds,
		TargetDistance:        req.TargetDistance,
		DistanceUnit:          req.DistanceUnit,
		PrimaryMuscleGroup:    req.PrimaryMuscleGroup,
		SecondaryMuscleGroups: req.SecondaryMuscleGroups,
		DefaultMetadata:       req.DefaultMetadata,
		Notes:                 req.Notes,
	}
}

// Create adds an exercise to a routine.
func (h *ExerciseHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req exerciseRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	ex, err := h.svc.Create(r.Context(), userID, chi.URLParam(r, "routineId"), req.toInput())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, ex)
}

// Update updates an exercise.
func (h *ExerciseHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req exerciseRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	ex, err := h.svc.Update(r.Context(), userID, chi.URLParam(r, "id"), req.toInput())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, ex)
}

// Delete removes an exercise.
func (h *ExerciseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if err := h.svc.Delete(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Reorder applies a new exercise ordering within a routine.
func (h *ExerciseHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req reorderRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Reorder(r.Context(), userID, chi.URLParam(r, "routineId"), req.IDs); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// History returns the exercise's derived progressive-overload view.
func (h *ExerciseHandler) History(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	hist, err := h.svc.History(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, hist)
}
