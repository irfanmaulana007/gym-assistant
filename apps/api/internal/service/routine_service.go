package service

import (
	"context"
	"errors"
	"net/http"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/validate"
)

type routineRepo interface {
	ListByUser(ctx context.Context, userID string) ([]domain.Routine, error)
	Create(ctx context.Context, userID, name, notes string) (*domain.Routine, error)
	GetByID(ctx context.Context, userID, id string) (*domain.Routine, error)
	Update(ctx context.Context, userID, id string, name, notes *string, position *int) (*domain.Routine, error)
	Delete(ctx context.Context, userID, id string) error
	Reorder(ctx context.Context, userID string, orderedIDs []string) error
}

type routineExerciseLister interface {
	ListByRoutine(ctx context.Context, routineID string) ([]domain.Exercise, error)
}

// RoutineService implements routine CRUD + reorder, scoped to a user.
type RoutineService struct {
	routines  routineRepo
	exercises routineExerciseLister
}

// NewRoutineService builds a RoutineService.
func NewRoutineService(routines routineRepo, exercises routineExerciseLister) *RoutineService {
	return &RoutineService{routines: routines, exercises: exercises}
}

// List returns the user's routines ordered by position.
func (s *RoutineService) List(ctx context.Context, userID string) ([]domain.Routine, error) {
	return s.routines.ListByUser(ctx, userID)
}

// Create validates and creates a routine.
func (s *RoutineService) Create(ctx context.Context, userID, name, notes string) (*domain.Routine, error) {
	if msg := validate.Required("name", name); msg != "" {
		return nil, validationErr(map[string]any{"name": msg})
	}
	if msg := validate.MaxLen("name", name, 100); msg != "" {
		return nil, validationErr(map[string]any{"name": msg})
	}
	return s.routines.Create(ctx, userID, name, notes)
}

// Get returns a routine with its exercises.
func (s *RoutineService) Get(ctx context.Context, userID, id string) (*domain.Routine, error) {
	routine, err := s.routines.GetByID(ctx, userID, id)
	if err != nil {
		return nil, notFoundOr(err, "routine not found")
	}
	exercises, err := s.exercises.ListByRoutine(ctx, id)
	if err != nil {
		return nil, err
	}
	routine.Exercises = exercises
	return routine, nil
}

// Update applies name/notes/position changes.
func (s *RoutineService) Update(ctx context.Context, userID, id string, name, notes *string, position *int) (*domain.Routine, error) {
	if name != nil {
		if msg := validate.Required("name", *name); msg != "" {
			return nil, validationErr(map[string]any{"name": msg})
		}
	}
	routine, err := s.routines.Update(ctx, userID, id, name, notes, position)
	if err != nil {
		return nil, notFoundOr(err, "routine not found")
	}
	return routine, nil
}

// Delete removes a routine (cascading to its exercises).
func (s *RoutineService) Delete(ctx context.Context, userID, id string) error {
	if err := s.routines.Delete(ctx, userID, id); err != nil {
		return notFoundOr(err, "routine not found")
	}
	return nil
}

// Reorder applies a new ordering. Every id must belong to the user.
func (s *RoutineService) Reorder(ctx context.Context, userID string, orderedIDs []string) error {
	if len(orderedIDs) == 0 {
		return validationErr(map[string]any{"routine_ids": "at least one id is required"})
	}
	if err := s.routines.Reorder(ctx, userID, orderedIDs); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return httpx.NewAPIError(http.StatusUnprocessableEntity, httpx.CodeValidation,
				"one or more routines do not exist or are not yours")
		}
		return err
	}
	return nil
}

// --- shared helpers for services ---

func validationErr(details map[string]any) error {
	return httpx.NewAPIError(http.StatusUnprocessableEntity, httpx.CodeValidation, "validation failed").WithDetails(details)
}

func notFoundOr(err error, msg string) error {
	if errors.Is(err, repository.ErrNotFound) {
		return httpx.NewAPIError(http.StatusNotFound, httpx.CodeNotFound, msg)
	}
	return err
}
