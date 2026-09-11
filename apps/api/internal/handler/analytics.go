package handler

import (
	"context"
	"net/http"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/middleware"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/service"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

type analyticsService interface {
	Dashboard(ctx context.Context, userID, window, tz string) (*service.Dashboard, error)
	Summary(ctx context.Context, userID, window, tz string) (*service.SummaryResult, error)
	Volume(ctx context.Context, userID, window, tz, bucket string) (*service.VolumeResult, error)
	MuscleGroups(ctx context.Context, userID, window, tz string) (*service.MuscleGroupsResult, error)
	Consistency(ctx context.Context, userID, window, tz string) (*service.Consistency, error)
	Records(ctx context.Context, userID, window, tz string) (*service.RecordsResult, error)
	ExerciseTrends(ctx context.Context, userID string) (*service.ExerciseTrendsResult, error)
}

// AnalyticsHandler serves the read-only analytics dashboard endpoints.
type AnalyticsHandler struct {
	svc analyticsService
}

// NewAnalyticsHandler builds an AnalyticsHandler.
func NewAnalyticsHandler(svc analyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{svc: svc}
}

// Dashboard returns the composed default-screen payload.
func (h *AnalyticsHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	q := r.URL.Query()
	res, err := h.svc.Dashboard(r.Context(), userID, q.Get("window"), q.Get("tz"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// Summary returns the overview tiles.
func (h *AnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	q := r.URL.Query()
	res, err := h.svc.Summary(r.Context(), userID, q.Get("window"), q.Get("tz"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// Volume returns the volume/sets time-series.
func (h *AnalyticsHandler) Volume(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	q := r.URL.Query()
	res, err := h.svc.Volume(r.Context(), userID, q.Get("window"), q.Get("tz"), q.Get("bucket"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// MuscleGroups returns the per-muscle-group breakdown.
func (h *AnalyticsHandler) MuscleGroups(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	q := r.URL.Query()
	res, err := h.svc.MuscleGroups(r.Context(), userID, q.Get("window"), q.Get("tz"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// Consistency returns streak + activity calendar.
func (h *AnalyticsHandler) Consistency(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	q := r.URL.Query()
	res, err := h.svc.Consistency(r.Context(), userID, q.Get("window"), q.Get("tz"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// Records returns personal records with an in-window flag.
func (h *AnalyticsHandler) Records(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	q := r.URL.Query()
	res, err := h.svc.Records(r.Context(), userID, q.Get("window"), q.Get("tz"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// ExerciseTrends returns per-exercise direction + stall signals.
func (h *AnalyticsHandler) ExerciseTrends(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	res, err := h.svc.ExerciseTrends(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}
