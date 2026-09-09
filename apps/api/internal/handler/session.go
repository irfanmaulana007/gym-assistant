package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/middleware"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

type sessionService interface {
	Start(ctx context.Context, userID, routineID string) (*domain.WorkoutSession, error)
	Pause(ctx context.Context, userID, id string) (*domain.WorkoutSession, error)
	Resume(ctx context.Context, userID, id string) (*domain.WorkoutSession, error)
	Complete(ctx context.Context, userID, id string) (*domain.WorkoutSession, error)
	Abandon(ctx context.Context, userID, id string) (*domain.WorkoutSession, error)
	Get(ctx context.Context, userID, id string) (*domain.WorkoutSession, error)
	List(ctx context.Context, userID string, limit, offset int) ([]domain.WorkoutSession, error)

	UpdateSessionExercise(ctx context.Context, userID, id string, status *string, position *int) (*domain.SessionExercise, error)
	AddAdHocExercise(ctx context.Context, userID, sessionID string, in repository.AdHocExerciseInput) (*domain.SessionExercise, error)
	DeleteSessionExercise(ctx context.Context, userID, id string) error

	CreateEntry(ctx context.Context, userID, sessionExerciseID string, in repository.SetEntryInput) (*domain.SetEntry, error)
	UpdateEntry(ctx context.Context, userID, id string, in repository.SetEntryInput) (*domain.SetEntry, error)
	DeleteEntry(ctx context.Context, userID, id string) error
}

// SessionHandler handles session lifecycle, checklist, and entry endpoints.
type SessionHandler struct {
	svc sessionService
}

// NewSessionHandler builds a SessionHandler.
func NewSessionHandler(svc sessionService) *SessionHandler {
	return &SessionHandler{svc: svc}
}

// Start begins a session for a routine.
func (h *SessionHandler) Start(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	session, err := h.svc.Start(r.Context(), userID, chi.URLParam(r, "routineId"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, session)
}

func (h *SessionHandler) lifecycle(w http.ResponseWriter, r *http.Request, fn func(ctx context.Context, userID, id string) (*domain.WorkoutSession, error)) {
	userID, _ := middleware.UserID(r.Context())
	session, err := fn(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, session)
}

// Pause pauses a session.
func (h *SessionHandler) Pause(w http.ResponseWriter, r *http.Request) {
	h.lifecycle(w, r, h.svc.Pause)
}

// Resume resumes a session.
func (h *SessionHandler) Resume(w http.ResponseWriter, r *http.Request) {
	h.lifecycle(w, r, h.svc.Resume)
}

// Complete stops and finalizes a session.
func (h *SessionHandler) Complete(w http.ResponseWriter, r *http.Request) {
	h.lifecycle(w, r, h.svc.Complete)
}

// Abandon abandons a session.
func (h *SessionHandler) Abandon(w http.ResponseWriter, r *http.Request) {
	h.lifecycle(w, r, h.svc.Abandon)
}

// Get returns a session with events, checklist, and entries.
func (h *SessionHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	session, err := h.svc.Get(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, session)
}

// List returns the user's sessions (paginated).
func (h *SessionHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	sessions, err := h.svc.List(r.Context(), userID, limit, offset)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

type updateSessionExerciseRequest struct {
	Status   *string `json:"status"`
	Position *int    `json:"position"`
}

// UpdateSessionExercise updates a checklist item.
func (h *SessionHandler) UpdateSessionExercise(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req updateSessionExerciseRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	sx, err := h.svc.UpdateSessionExercise(r.Context(), userID, chi.URLParam(r, "id"), req.Status, req.Position)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, sx)
}

type adHocExerciseRequest struct {
	Name                  string   `json:"name"`
	MeasurementType       *string  `json:"measurement_type"`
	TargetSets            *int     `json:"target_sets"`
	TargetReps            *int     `json:"target_reps"`
	TargetWeight          *float64 `json:"target_weight"`
	TargetDurationSeconds *int     `json:"target_duration_seconds"`
	PrimaryMuscleGroup    *string  `json:"primary_muscle_group"`
	SecondaryMuscleGroups []string `json:"secondary_muscle_groups"`
}

// AddExercise adds an ad-hoc exercise to a live session.
func (h *SessionHandler) AddExercise(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req adHocExerciseRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	in := repository.AdHocExerciseInput{
		Name:                  req.Name,
		MeasurementType:       req.MeasurementType,
		TargetSets:            req.TargetSets,
		TargetReps:            req.TargetReps,
		TargetWeight:          req.TargetWeight,
		TargetDurationSeconds: req.TargetDurationSeconds,
		PrimaryMuscleGroup:    req.PrimaryMuscleGroup,
		SecondaryMuscleGroups: req.SecondaryMuscleGroups,
	}
	sx, err := h.svc.AddAdHocExercise(r.Context(), userID, chi.URLParam(r, "id"), in)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, sx)
}

// DeleteSessionExercise removes a checklist item.
func (h *SessionHandler) DeleteSessionExercise(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if err := h.svc.DeleteSessionExercise(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type entryRequest struct {
	Weight          *float64       `json:"weight"`
	WeightUnit      *string        `json:"weight_unit"`
	Reps            *int           `json:"reps"`
	DurationSeconds *int           `json:"duration_seconds"`
	Distance        *float64       `json:"distance"`
	DistanceUnit    *string        `json:"distance_unit"`
	Incline         *float64       `json:"incline"`
	Speed           *float64       `json:"speed"`
	RPE             *float64       `json:"rpe"`
	IsCompleted     *bool          `json:"is_completed"`
	Metadata        domain.JSONMap `json:"metadata"`
}

func (req entryRequest) toInput() repository.SetEntryInput {
	return repository.SetEntryInput{
		Weight:          req.Weight,
		WeightUnit:      req.WeightUnit,
		Reps:            req.Reps,
		DurationSeconds: req.DurationSeconds,
		Distance:        req.Distance,
		DistanceUnit:    req.DistanceUnit,
		Incline:         req.Incline,
		Speed:           req.Speed,
		RPE:             req.RPE,
		IsCompleted:     req.IsCompleted,
		Metadata:        req.Metadata,
	}
}

// CreateEntry logs a set/bout under a checklist item.
func (h *SessionHandler) CreateEntry(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req entryRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	entry, err := h.svc.CreateEntry(r.Context(), userID, chi.URLParam(r, "id"), req.toInput())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, entry)
}

// UpdateEntry edits a logged entry.
func (h *SessionHandler) UpdateEntry(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var req entryRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	entry, err := h.svc.UpdateEntry(r.Context(), userID, chi.URLParam(r, "id"), req.toInput())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, entry)
}

// DeleteEntry removes a logged entry.
func (h *SessionHandler) DeleteEntry(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if err := h.svc.DeleteEntry(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
