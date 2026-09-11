package handler

import (
	"context"
	"net/http"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

type catalogService interface {
	List(ctx context.Context, search, muscleGroup string) ([]domain.CatalogExercise, error)
}

// CatalogHandler serves the read-only shared exercise catalog (PRD 0006).
type CatalogHandler struct {
	svc catalogService
}

// NewCatalogHandler builds a CatalogHandler.
func NewCatalogHandler(svc catalogService) *CatalogHandler {
	return &CatalogHandler{svc: svc}
}

// List returns catalog entries, honoring optional ?search= and ?muscle_group=
// query filters.
func (h *CatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	muscleGroup := r.URL.Query().Get("muscle_group")
	entries, err := h.svc.List(r.Context(), search, muscleGroup)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"exercises": entries})
}
