package service

import (
	"context"
	"strings"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/vocab"
)

type catalogRepo interface {
	List(ctx context.Context, params repository.CatalogListParams) ([]domain.CatalogExercise, error)
	GetByID(ctx context.Context, id string) (*domain.CatalogExercise, error)
}

// CatalogService reads the shared exercise catalog (PRD 0006). The catalog is
// global read-only master data; this service only lists and reads it.
type CatalogService struct {
	catalog catalogRepo
}

// NewCatalogService builds a CatalogService.
func NewCatalogService(catalog catalogRepo) *CatalogService {
	return &CatalogService{catalog: catalog}
}

// List returns catalog entries filtered by an optional name search and an
// optional primary-muscle-group filter. An unknown muscle_group filter is a
// validation error.
func (s *CatalogService) List(ctx context.Context, search, muscleGroup string) ([]domain.CatalogExercise, error) {
	search = strings.TrimSpace(search)
	muscleGroup = strings.TrimSpace(muscleGroup)
	if muscleGroup != "" && !vocab.IsMuscleGroup(muscleGroup) {
		return nil, validationErr(map[string]any{"muscle_group": "unknown muscle group"})
	}
	return s.catalog.List(ctx, repository.CatalogListParams{Search: search, MuscleGroup: muscleGroup})
}
