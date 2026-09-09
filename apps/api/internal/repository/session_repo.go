package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

// SessionRepository persists workout sessions, their lifecycle events, the
// per-session exercise checklist, and set entries. Every method is scoped to a
// user (directly or by joining up the ownership chain
// entry → session_exercise → session.user_id).
type SessionRepository struct {
	pool *pgxpool.Pool
}

// NewSessionRepository builds a SessionRepository.
func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

const sessionSelect = `
	id, user_id, routine_id, status, performed_at, started_at, ended_at,
	total_duration_seconds, active_duration_seconds, paused_duration_seconds,
	COALESCE(muscle_groups, '{}')::text[], notes, metadata, created_at, updated_at`

func scanSession(row pgx.Row) (*domain.WorkoutSession, error) {
	var s domain.WorkoutSession
	var meta []byte
	err := row.Scan(
		&s.ID, &s.UserID, &s.RoutineID, &s.Status, &s.PerformedAt, &s.StartedAt, &s.EndedAt,
		&s.TotalDurationSeconds, &s.ActiveDurationSeconds, &s.PausedDurationSeconds,
		&s.MuscleGroups, &s.Notes, &meta, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	s.Metadata = decodeMeta(meta)
	if s.MuscleGroups == nil {
		s.MuscleGroups = []string{}
	}
	return &s, nil
}

// HasActiveSession reports whether the user already has an active or paused
// session (used to enforce one live session at a time).
func (r *SessionRepository) HasActiveSession(ctx context.Context, userID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM workout_sessions WHERE user_id = $1 AND status IN ('active','paused'))`,
		userID).Scan(&exists)
	return exists, err
}

// Start creates an active session for a routine the user owns, snapshots the
// routine's exercises into the checklist, and emits the initial "start" event —
// all atomically. Returns ErrNotFound if the routine is missing/not owned.
func (r *SessionRepository) Start(ctx context.Context, userID, routineID string) (*domain.WorkoutSession, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var owns bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM routines WHERE id = $1 AND user_id = $2)`,
		routineID, userID).Scan(&owns); err != nil {
		return nil, err
	}
	if !owns {
		return nil, ErrNotFound
	}

	var sessionID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO workout_sessions (user_id, routine_id, status, performed_at, started_at)
		VALUES ($1, $2, 'active', now(), now())
		RETURNING id`, userID, routineID).Scan(&sessionID); err != nil {
		return nil, err
	}

	// Snapshot routine exercises into the checklist.
	if _, err := tx.Exec(ctx, `
		INSERT INTO session_exercises (
			session_id, exercise_id, position, name_snapshot, measurement_type,
			target_sets, target_reps, target_weight, target_duration_seconds,
			primary_muscle_group, secondary_muscle_groups, status)
		SELECT
			$1, e.id, e.position, e.name, e.measurement_type,
			e.target_sets, e.target_reps, e.target_weight, e.target_duration_seconds,
			e.primary_muscle_group, e.secondary_muscle_groups, 'pending'
		FROM exercises e WHERE e.routine_id = $2
		ORDER BY e.position`, sessionID, routineID); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO session_events (session_id, type) VALUES ($1, 'start')`, sessionID); err != nil {
		return nil, err
	}

	session, err := scanSession(tx.QueryRow(ctx, `SELECT `+sessionSelect+` FROM workout_sessions WHERE id = $1`, sessionID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return session, nil
}

// GetByID returns a session owned by the user.
func (r *SessionRepository) GetByID(ctx context.Context, userID, id string) (*domain.WorkoutSession, error) {
	return scanSession(r.pool.QueryRow(ctx,
		`SELECT `+sessionSelect+` FROM workout_sessions WHERE id = $1 AND user_id = $2`, id, userID))
}

// List returns the user's sessions, most recent first, paginated.
func (r *SessionRepository) List(ctx context.Context, userID string, limit, offset int) ([]domain.WorkoutSession, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+sessionSelect+` FROM workout_sessions WHERE user_id = $1
		 ORDER BY COALESCE(started_at, performed_at, created_at) DESC
		 LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.WorkoutSession{}
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

// AddEvent appends a lifecycle event and returns it. The caller is responsible
// for validating the transition.
func (r *SessionRepository) AddEvent(ctx context.Context, sessionID, eventType string) (*domain.SessionEvent, error) {
	var e domain.SessionEvent
	var meta []byte
	err := r.pool.QueryRow(ctx, `
		INSERT INTO session_events (session_id, type) VALUES ($1, $2::session_event_type)
		RETURNING id, session_id, type, occurred_at, metadata`,
		sessionID, eventType).Scan(&e.ID, &e.SessionID, &e.Type, &e.OccurredAt, &meta)
	if err != nil {
		return nil, err
	}
	e.Metadata = decodeMeta(meta)
	return &e, nil
}

// SetStatus updates a session's status (used for pause/resume/abandon).
func (r *SessionRepository) SetStatus(ctx context.Context, id, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workout_sessions SET status = $2::session_status, updated_at = now() WHERE id = $1`,
		id, status)
	return err
}

// Complete persists the terminal state: status, ended_at, durations, and the
// aggregated muscle groups. Per-exercise aggregates are recomputed separately.
func (r *SessionRepository) Complete(ctx context.Context, id string, endedAt time.Time, total, active, paused int) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE workout_sessions SET
			status = 'completed',
			ended_at = $2,
			total_duration_seconds = $3,
			active_duration_seconds = $4,
			paused_duration_seconds = $5,
			muscle_groups = COALESCE((
				SELECT array_agg(DISTINCT mg)::muscle_group[] FROM (
					SELECT primary_muscle_group AS mg FROM session_exercises WHERE session_id = $1
					UNION
					SELECT unnest(secondary_muscle_groups) FROM session_exercises WHERE session_id = $1
				) t WHERE mg IS NOT NULL
			), '{}'::muscle_group[]),
			updated_at = now()
		WHERE id = $1`, id, endedAt, total, active, paused)
	return err
}

// RecomputeAggregates recalculates every session_exercise's derived aggregates
// from its set entries (persisted so the dashboard is a pure read-model).
func (r *SessionRepository) RecomputeAggregates(ctx context.Context, sessionID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE session_exercises sx SET
			sets_completed = COALESCE(agg.cnt, 0),
			total_reps = agg.reps,
			total_volume = agg.vol,
			total_duration_seconds = agg.dur,
			top_set_weight = agg.top,
			updated_at = now()
		FROM (
			SELECT
				se.session_exercise_id,
				COUNT(*) AS cnt,
				SUM(se.reps) AS reps,
				SUM(se.weight * se.reps) AS vol,
				SUM(se.duration_seconds) AS dur,
				MAX(se.weight) AS top
			FROM set_entries se
			JOIN session_exercises s ON s.id = se.session_exercise_id
			WHERE s.session_id = $1
			GROUP BY se.session_exercise_id
		) agg
		WHERE sx.id = agg.session_exercise_id`, sessionID)
	return err
}

// ListEvents returns a session's events in chronological order.
func (r *SessionRepository) ListEvents(ctx context.Context, sessionID string) ([]domain.SessionEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, session_id, type, occurred_at, metadata
		FROM session_events WHERE session_id = $1 ORDER BY occurred_at, id`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.SessionEvent{}
	for rows.Next() {
		var e domain.SessionEvent
		var meta []byte
		if err := rows.Scan(&e.ID, &e.SessionID, &e.Type, &e.OccurredAt, &meta); err != nil {
			return nil, err
		}
		e.Metadata = decodeMeta(meta)
		out = append(out, e)
	}
	return out, rows.Err()
}
