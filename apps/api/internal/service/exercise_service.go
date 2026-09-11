package service

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/overload"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/validate"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/vocab"
)

type exerciseRepo interface {
	Create(ctx context.Context, userID, routineID string, in repository.ExerciseInput) (*domain.Exercise, error)
	GetByID(ctx context.Context, userID, id string) (*domain.Exercise, error)
	Update(ctx context.Context, userID, id string, in repository.ExerciseInput) (*domain.Exercise, error)
	Delete(ctx context.Context, userID, id string) error
	Reorder(ctx context.Context, userID, routineID string, orderedIDs []string) error
	History(ctx context.Context, userID, exerciseID string) ([]repository.HistoryRow, error)
}

// catalogReader reads shared catalog entries so create/update can resolve a
// link's defaults (name, measurement type) and validate its existence.
type catalogReader interface {
	GetByID(ctx context.Context, id string) (*domain.CatalogExercise, error)
}

// ExerciseService implements exercise CRUD + reorder + derived history.
type ExerciseService struct {
	exercises exerciseRepo
	catalog   catalogReader
}

// NewExerciseService builds an ExerciseService.
func NewExerciseService(exercises exerciseRepo, catalog catalogReader) *ExerciseService {
	return &ExerciseService{exercises: exercises, catalog: catalog}
}

// Create validates input and adds an exercise to a routine the user owns. When
// the input links a catalog entry, muscle-group fields are ignored (resolved
// from the catalog) and name/measurement default from the catalog (PRD §4.3).
func (s *ExerciseService) Create(ctx context.Context, userID, routineID string, in repository.ExerciseInput) (*domain.Exercise, error) {
	if in.CatalogExerciseID != nil {
		cat, err := s.catalog.GetByID(ctx, *in.CatalogExerciseID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, validationErr(map[string]any{"catalog_exercise_id": "unknown catalog exercise"})
			}
			return nil, err
		}
		// A catalog-linked exercise ignores any request muscle fields — the
		// catalog is the source of truth.
		in.PrimaryMuscleGroup = nil
		in.SecondaryMuscleGroups = nil
		if in.Name == nil || validate.Required("name", *in.Name) != "" {
			in.Name = &cat.Name
		}
		if in.MeasurementType == nil {
			mt := cat.DefaultMeasurementType
			in.MeasurementType = &mt
		}
		if details := validateExercise(in); len(details) > 0 {
			return nil, validationErr(details)
		}
		ex, err := s.exercises.Create(ctx, userID, routineID, in)
		if err != nil {
			return nil, notFoundOr(err, "routine not found")
		}
		return ex, nil
	}

	if in.Name == nil || validate.Required("name", *in.Name) != "" {
		return nil, validationErr(map[string]any{"name": "name is required"})
	}
	if details := validateExercise(in); len(details) > 0 {
		return nil, validationErr(details)
	}
	ex, err := s.exercises.Create(ctx, userID, routineID, in)
	if err != nil {
		return nil, notFoundOr(err, "routine not found")
	}
	return ex, nil
}

// Update validates and applies changes to an exercise the user owns. It may set
// a catalog link or clear one (unlink → custom); clearing requires a
// primary_muscle_group so the resolvable-muscle-group CHECK still holds.
func (s *ExerciseService) Update(ctx context.Context, userID, id string, in repository.ExerciseInput) (*domain.Exercise, error) {
	if in.Name != nil && validate.Required("name", *in.Name) != "" {
		return nil, validationErr(map[string]any{"name": "name cannot be empty"})
	}
	if in.ClearCatalog {
		if in.PrimaryMuscleGroup == nil || validate.Required("primary_muscle_group", *in.PrimaryMuscleGroup) != "" {
			return nil, validationErr(map[string]any{
				"primary_muscle_group": "a primary muscle group is required to unlink from the catalog",
			})
		}
	}
	if in.CatalogExerciseID != nil {
		if _, err := s.catalog.GetByID(ctx, *in.CatalogExerciseID); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, validationErr(map[string]any{"catalog_exercise_id": "unknown catalog exercise"})
			}
			return nil, err
		}
		// Linking ignores request muscle fields (resolved from the catalog).
		in.PrimaryMuscleGroup = nil
		in.SecondaryMuscleGroups = nil
	}
	if details := validateExercise(in); len(details) > 0 {
		return nil, validationErr(details)
	}
	ex, err := s.exercises.Update(ctx, userID, id, in)
	if err != nil {
		return nil, notFoundOr(err, "exercise not found")
	}
	return ex, nil
}

// Delete removes an exercise the user owns.
func (s *ExerciseService) Delete(ctx context.Context, userID, id string) error {
	if err := s.exercises.Delete(ctx, userID, id); err != nil {
		return notFoundOr(err, "exercise not found")
	}
	return nil
}

// Reorder applies a new ordering within a routine.
func (s *ExerciseService) Reorder(ctx context.Context, userID, routineID string, orderedIDs []string) error {
	if len(orderedIDs) == 0 {
		return validationErr(map[string]any{"exercise_ids": "at least one id is required"})
	}
	if err := s.exercises.Reorder(ctx, userID, routineID, orderedIDs); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return httpx.NewAPIError(http.StatusUnprocessableEntity, httpx.CodeValidation,
				"one or more exercises do not exist in this routine")
		}
		return err
	}
	return nil
}

// validateExercise checks the controlled-vocabulary and unit fields. It returns
// a field->message map (empty when valid).
func validateExercise(in repository.ExerciseInput) map[string]any {
	details := map[string]any{}
	if in.MeasurementType != nil && !vocab.IsMeasurementType(*in.MeasurementType) {
		details["measurement_type"] = "unknown measurement type"
	}
	if in.PrimaryMuscleGroup != nil && !vocab.IsMuscleGroup(*in.PrimaryMuscleGroup) {
		details["primary_muscle_group"] = "unknown muscle group"
	}
	for _, g := range in.SecondaryMuscleGroups {
		if !vocab.IsMuscleGroup(g) {
			details["secondary_muscle_groups"] = "unknown muscle group: " + g
			break
		}
	}
	if in.DistanceUnit != nil && !vocab.IsDistanceUnit(*in.DistanceUnit) {
		details["distance_unit"] = "unknown distance unit"
	}
	return details
}

// ---- Exercise history (derived progressive overload) ----

// HistorySet is one set in a session's history.
type HistorySet struct {
	SetNumber int      `json:"set_number"`
	Weight    *float64 `json:"weight"`
	Reps      *int     `json:"reps"`
}

// HistorySession is one session's contribution to an exercise's history.
type HistorySession struct {
	SessionID   string       `json:"session_id"`
	PerformedAt time.Time    `json:"performed_at"`
	TopSet      *TopSet      `json:"top_set"`
	TotalVolume float64      `json:"total_volume"`
	Sets        []HistorySet `json:"sets"`
}

// TopSet is the heaviest set of a session.
type TopSet struct {
	Weight     float64 `json:"weight"`
	WeightUnit string  `json:"weight_unit"`
	Reps       int     `json:"reps"`
}

// ExerciseHistory is the derived progressive-overload view of an exercise.
type ExerciseHistory struct {
	Exercise *domain.Exercise `json:"exercise"`
	Sessions []HistorySession `json:"sessions"`
	Trend    overload.Trend   `json:"trend"`
}

// History returns the exercise plus its per-session top sets, volume, and a
// simple trend — all computed on read from set_entries (never stored).
func (s *ExerciseService) History(ctx context.Context, userID, exerciseID string) (*ExerciseHistory, error) {
	ex, err := s.exercises.GetByID(ctx, userID, exerciseID)
	if err != nil {
		return nil, notFoundOr(err, "exercise not found")
	}
	rows, err := s.exercises.History(ctx, userID, exerciseID)
	if err != nil {
		return nil, err
	}
	return buildHistory(ex, rows), nil
}

// buildHistory groups rows (oldest first) by session and derives metrics.
func buildHistory(ex *domain.Exercise, rows []repository.HistoryRow) *ExerciseHistory {
	sessions := []HistorySession{}
	index := map[string]int{} // session_id -> position in sessions

	for _, row := range rows {
		pos, ok := index[row.SessionID]
		if !ok {
			pos = len(sessions)
			index[row.SessionID] = pos
			sessions = append(sessions, HistorySession{
				SessionID:   row.SessionID,
				PerformedAt: row.PerformedAt,
				Sets:        []HistorySet{},
			})
		}
		sessions[pos].Sets = append(sessions[pos].Sets, HistorySet{
			SetNumber: row.EntryNumber,
			Weight:    row.Weight,
			Reps:      row.Reps,
		})
	}

	topWeights := make([]float64, 0, len(sessions))
	for i := range sessions {
		sets := toOverloadSets(sessions[i].Sets)
		sessions[i].TotalVolume = overload.TotalVolume(sets)
		if best, ok := overload.BestSet(sets); ok {
			unit := "kg"
			if u := firstWeightUnit(rows, sessions[i].SessionID); u != "" {
				unit = u
			}
			sessions[i].TopSet = &TopSet{Weight: best.Weight, WeightUnit: unit, Reps: best.Reps}
			topWeights = append(topWeights, best.Weight)
		}
	}

	return &ExerciseHistory{
		Exercise: ex,
		Sessions: sessions,
		Trend:    overload.TrendFromTopWeights(topWeights),
	}
}

func toOverloadSets(sets []HistorySet) []overload.Set {
	out := make([]overload.Set, 0, len(sets))
	for _, s := range sets {
		if s.Weight == nil || s.Reps == nil {
			continue
		}
		out = append(out, overload.Set{SetNumber: s.SetNumber, Weight: *s.Weight, Reps: *s.Reps})
	}
	return out
}

func firstWeightUnit(rows []repository.HistoryRow, sessionID string) string {
	for _, r := range rows {
		if r.SessionID == sessionID && r.WeightUnit != nil && *r.WeightUnit != "" {
			return *r.WeightUnit
		}
	}
	return ""
}
