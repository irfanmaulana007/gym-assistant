package service

import (
	"context"
	"net/http"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/sessiontime"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/validate"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/vocab"
)

// sessionUsers is the subset of the user repository SessionService needs: it
// reads the logging user's preferred weight unit to default set-entry units
// (PRD 0008 §4.4).
type sessionUsers interface {
	GetByID(ctx context.Context, id string) (*domain.User, error)
}

// SessionService orchestrates the workout-session lifecycle, the exercise
// checklist, ad-hoc exercises, and set-entry logging (PRD 0002).
type SessionService struct {
	repo  *repository.SessionRepository
	users sessionUsers
}

// NewSessionService builds a SessionService. users may be nil, in which case a
// missing weight unit falls back to kg (pre-PRD-0008 behavior).
func NewSessionService(repo *repository.SessionRepository, users sessionUsers) *SessionService {
	return &SessionService{repo: repo, users: users}
}

// Start begins a session for a routine the user owns. It enforces a single live
// session at a time: an existing active/paused session yields 409.
func (s *SessionService) Start(ctx context.Context, userID, routineID string) (*domain.WorkoutSession, error) {
	active, err := s.repo.HasActiveSession(ctx, userID)
	if err != nil {
		return nil, err
	}
	if active {
		return nil, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict,
			"you already have an active or paused session; finish it before starting another")
	}
	session, err := s.repo.Start(ctx, userID, routineID)
	if err != nil {
		return nil, notFoundOr(err, "routine not found")
	}
	return s.load(ctx, userID, session.ID)
}

// Pause moves an active session to paused.
func (s *SessionService) Pause(ctx context.Context, userID, id string) (*domain.WorkoutSession, error) {
	return s.transition(ctx, userID, id, "pause", "paused",
		map[string]bool{"active": true}, "session is not active")
}

// Resume moves a paused session back to active.
func (s *SessionService) Resume(ctx context.Context, userID, id string) (*domain.WorkoutSession, error) {
	return s.transition(ctx, userID, id, "resume", "active",
		map[string]bool{"paused": true}, "session is not paused")
}

// Complete stops a session: emits the complete event, computes and persists
// durations, per-exercise aggregates, and the worked muscle groups.
func (s *SessionService) Complete(ctx context.Context, userID, id string) (*domain.WorkoutSession, error) {
	return s.finalize(ctx, userID, id, "complete")
}

// Abandon discards a session but keeps the record; durations/aggregates are
// still computed so the timeline stays truthful.
func (s *SessionService) Abandon(ctx context.Context, userID, id string) (*domain.WorkoutSession, error) {
	return s.finalize(ctx, userID, id, "abandon")
}

// Get returns a session with its events, checklist, and set entries.
func (s *SessionService) Get(ctx context.Context, userID, id string) (*domain.WorkoutSession, error) {
	return s.load(ctx, userID, id)
}

// List returns the user's sessions (summary rows), most recent first.
func (s *SessionService) List(ctx context.Context, userID string, limit, offset int) ([]domain.WorkoutSession, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.List(ctx, userID, limit, offset)
}

// --- checklist & ad-hoc ---

// UpdateSessionExercise updates a checklist item's status/position.
func (s *SessionService) UpdateSessionExercise(ctx context.Context, userID, id string, status *string, position *int) (*domain.SessionExercise, error) {
	if status != nil && !vocab.IsSessionExerciseStatus(*status) {
		return nil, validationErr(map[string]any{"status": "unknown status"})
	}
	if _, _, err := s.repo.GetSessionExercise(ctx, userID, id); err != nil {
		return nil, notFoundOr(err, "session exercise not found")
	}
	sx, err := s.repo.UpdateSessionExercise(ctx, userID, id, status, position)
	if err != nil {
		return nil, notFoundOr(err, "session exercise not found")
	}
	return sx, nil
}

// AddAdHocExercise adds an on-the-spot exercise to a live session.
func (s *SessionService) AddAdHocExercise(ctx context.Context, userID, sessionID string, in repository.AdHocExerciseInput) (*domain.SessionExercise, error) {
	session, err := s.repo.GetByID(ctx, userID, sessionID)
	if err != nil {
		return nil, notFoundOr(err, "session not found")
	}
	if session.Status != "active" && session.Status != "paused" {
		return nil, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict, "session is not live")
	}
	if validate.Required("name", in.Name) != "" {
		return nil, validationErr(map[string]any{"name": "name is required"})
	}
	if details := validateAdHoc(in); len(details) > 0 {
		return nil, validationErr(details)
	}
	return s.repo.AddAdHocExercise(ctx, sessionID, in)
}

// DeleteSessionExercise removes a checklist item.
func (s *SessionService) DeleteSessionExercise(ctx context.Context, userID, id string) error {
	if err := s.repo.DeleteSessionExercise(ctx, userID, id); err != nil {
		return notFoundOr(err, "session exercise not found")
	}
	return nil
}

// --- set entries ---

// CreateEntry logs a set/bout under a checklist item the user owns.
func (s *SessionService) CreateEntry(ctx context.Context, userID, sessionExerciseID string, in repository.SetEntryInput) (*domain.SetEntry, error) {
	if details := validateEntry(in); len(details) > 0 {
		return nil, validationErr(details)
	}
	// Default the weight unit to the user's preferred unit when a weight is
	// provided without one (PRD 0008 §4.4), falling back to kg.
	if in.Weight != nil && in.WeightUnit == nil {
		unit := s.preferredWeightUnit(ctx, userID)
		in.WeightUnit = &unit
	}
	entry, err := s.repo.CreateEntry(ctx, userID, sessionExerciseID, in)
	if err != nil {
		return nil, notFoundOr(err, "session exercise not found")
	}
	return entry, nil
}

// preferredWeightUnit returns the user's preferred weight unit, defaulting to
// kg when it can't be resolved (nil dependency or lookup error) so logging is
// never blocked on the profile read.
func (s *SessionService) preferredWeightUnit(ctx context.Context, userID string) string {
	if s.users != nil {
		if u, err := s.users.GetByID(ctx, userID); err == nil && u.PreferredWeightUnit != "" {
			return u.PreferredWeightUnit
		}
	}
	return "kg"
}

// UpdateEntry edits a logged entry.
func (s *SessionService) UpdateEntry(ctx context.Context, userID, id string, in repository.SetEntryInput) (*domain.SetEntry, error) {
	if details := validateEntry(in); len(details) > 0 {
		return nil, validationErr(details)
	}
	entry, err := s.repo.UpdateEntry(ctx, userID, id, in)
	if err != nil {
		return nil, notFoundOr(err, "entry not found")
	}
	return entry, nil
}

// DeleteEntry removes a logged entry.
func (s *SessionService) DeleteEntry(ctx context.Context, userID, id string) error {
	if err := s.repo.DeleteEntry(ctx, userID, id); err != nil {
		return notFoundOr(err, "entry not found")
	}
	return nil
}

// --- internals ---

func (s *SessionService) transition(ctx context.Context, userID, id, eventType, newStatus string, allowed map[string]bool, wrongStateMsg string) (*domain.WorkoutSession, error) {
	session, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, notFoundOr(err, "session not found")
	}
	if !allowed[session.Status] {
		return nil, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict, wrongStateMsg)
	}
	if _, err := s.repo.AddEvent(ctx, id, eventType); err != nil {
		return nil, err
	}
	if err := s.repo.SetStatus(ctx, id, newStatus); err != nil {
		return nil, err
	}
	return s.load(ctx, userID, id)
}

func (s *SessionService) finalize(ctx context.Context, userID, id, eventType string) (*domain.WorkoutSession, error) {
	session, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, notFoundOr(err, "session not found")
	}
	if session.Status != "active" && session.Status != "paused" {
		return nil, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict, "session is already finished")
	}

	event, err := s.repo.AddEvent(ctx, id, eventType)
	if err != nil {
		return nil, err
	}

	events, err := s.repo.ListEvents(ctx, id)
	if err != nil {
		return nil, err
	}
	durations := sessiontime.Compute(toTimeEvents(events))

	if err := s.repo.RecomputeAggregates(ctx, id); err != nil {
		return nil, err
	}

	if eventType == "complete" {
		if err := s.repo.Complete(ctx, id, event.OccurredAt,
			sessiontime.Seconds(durations.Total),
			sessiontime.Seconds(durations.Active),
			sessiontime.Seconds(durations.Paused)); err != nil {
			return nil, err
		}
	} else {
		// Abandon: keep the record, mark abandoned, still persist durations.
		if err := s.repo.SetStatus(ctx, id, "abandoned"); err != nil {
			return nil, err
		}
	}
	return s.load(ctx, userID, id)
}

// load assembles the full session detail (events, checklist, entries).
func (s *SessionService) load(ctx context.Context, userID, id string) (*domain.WorkoutSession, error) {
	session, err := s.repo.GetByID(ctx, userID, id)
	if err != nil {
		return nil, notFoundOr(err, "session not found")
	}
	events, err := s.repo.ListEvents(ctx, id)
	if err != nil {
		return nil, err
	}
	exercises, err := s.repo.ListSessionExercises(ctx, id)
	if err != nil {
		return nil, err
	}
	entries, err := s.repo.ListEntriesForSession(ctx, id)
	if err != nil {
		return nil, err
	}

	byExercise := map[string][]domain.SetEntry{}
	for _, e := range entries {
		byExercise[e.SessionExerciseID] = append(byExercise[e.SessionExerciseID], e)
	}
	for i := range exercises {
		exercises[i].Entries = byExercise[exercises[i].ID]
		if exercises[i].Entries == nil {
			exercises[i].Entries = []domain.SetEntry{}
		}
	}

	// Attach each exercise's "weight to beat" from its most recent prior session.
	lastRows, err := s.repo.LastSetsBeforeSession(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	lastByExercise := indexLastSets(lastRows)
	for i := range exercises {
		if exercises[i].ExerciseID == nil {
			continue
		}
		if ls, ok := lastByExercise[*exercises[i].ExerciseID]; ok {
			last := ls
			exercises[i].LastSet = &last
		}
	}

	session.Events = events
	session.Exercises = exercises
	return session, nil
}

func toTimeEvents(events []domain.SessionEvent) []sessiontime.Event {
	out := make([]sessiontime.Event, 0, len(events))
	for _, e := range events {
		out = append(out, sessiontime.Event{Type: e.Type, At: e.OccurredAt})
	}
	return out
}

func validateAdHoc(in repository.AdHocExerciseInput) map[string]any {
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
	return details
}

func validateEntry(in repository.SetEntryInput) map[string]any {
	details := map[string]any{}
	if in.WeightUnit != nil && !vocab.IsWeightUnit(*in.WeightUnit) {
		details["weight_unit"] = "unknown weight unit"
	}
	if in.DistanceUnit != nil && !vocab.IsDistanceUnit(*in.DistanceUnit) {
		details["distance_unit"] = "unknown distance unit"
	}
	if in.Reps != nil && *in.Reps < 0 {
		details["reps"] = "reps cannot be negative"
	}
	if in.Weight != nil && *in.Weight < 0 {
		details["weight"] = "weight cannot be negative"
	}
	if in.DurationSeconds != nil && *in.DurationSeconds < 0 {
		details["duration_seconds"] = "duration cannot be negative"
	}
	return details
}
