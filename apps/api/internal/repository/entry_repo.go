package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

// SetEntryInput carries the mutable fields of a set entry. All are optional so
// one shape serves both strength sets and timed/distance bouts; on update, nil
// means "leave unchanged".
type SetEntryInput struct {
	Weight          *float64
	WeightUnit      *string
	Reps            *int
	DurationSeconds *int
	Distance        *float64
	DistanceUnit    *string
	Incline         *float64
	Speed           *float64
	RPE             *float64
	IsCompleted     *bool
	Metadata        domain.JSONMap
}

const entrySelect = `
	id, session_exercise_id, entry_number, weight, weight_unit, reps,
	duration_seconds, distance, distance_unit, incline, speed, rpe,
	is_completed, performed_at, metadata, created_at`

func scanEntry(row pgx.Row) (*domain.SetEntry, error) {
	var e domain.SetEntry
	var meta []byte
	err := row.Scan(
		&e.ID, &e.SessionExerciseID, &e.EntryNumber, &e.Weight, &e.WeightUnit, &e.Reps,
		&e.DurationSeconds, &e.Distance, &e.DistanceUnit, &e.Incline, &e.Speed, &e.RPE,
		&e.IsCompleted, &e.PerformedAt, &meta, &e.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	e.Metadata = decodeMeta(meta)
	return &e, nil
}

// CreateEntry logs a set/bout under a session_exercise the user owns. The
// entry_number is assigned as the next in sequence. Returns ErrNotFound if the
// session_exercise is missing or not owned.
func (r *SessionRepository) CreateEntry(ctx context.Context, userID, sessionExerciseID string, in SetEntryInput) (*domain.SetEntry, error) {
	const q = `
		INSERT INTO set_entries (
			session_exercise_id, entry_number, weight, weight_unit, reps,
			duration_seconds, distance, distance_unit, incline, speed, rpe,
			is_completed, metadata)
		SELECT
			sx.id,
			COALESCE((SELECT MAX(entry_number) + 1 FROM set_entries WHERE session_exercise_id = sx.id), 1),
			$3, $4::weight_unit, $5, $6, $7, $8::distance_unit, $9, $10, $11,
			COALESCE($12, true), COALESCE($13::jsonb, '{}'::jsonb)
		FROM session_exercises sx
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE sx.id = $1 AND s.user_id = $2
		RETURNING ` + entrySelect
	entry, err := scanEntry(r.pool.QueryRow(ctx, q,
		sessionExerciseID, userID,
		in.Weight, in.WeightUnit, in.Reps,
		in.DurationSeconds, in.Distance, in.DistanceUnit, in.Incline, in.Speed, in.RPE,
		in.IsCompleted, metaPtr(in.Metadata)))
	if err != nil {
		return nil, err
	}
	return entry, nil
}

// UpdateEntry applies non-nil fields to an entry the user owns.
func (r *SessionRepository) UpdateEntry(ctx context.Context, userID, id string, in SetEntryInput) (*domain.SetEntry, error) {
	const q = `
		UPDATE set_entries e SET
			weight = COALESCE($3, e.weight),
			weight_unit = COALESCE($4::weight_unit, e.weight_unit),
			reps = COALESCE($5, e.reps),
			duration_seconds = COALESCE($6, e.duration_seconds),
			distance = COALESCE($7, e.distance),
			distance_unit = COALESCE($8::distance_unit, e.distance_unit),
			incline = COALESCE($9, e.incline),
			speed = COALESCE($10, e.speed),
			rpe = COALESCE($11, e.rpe),
			is_completed = COALESCE($12, e.is_completed),
			metadata = COALESCE($13::jsonb, e.metadata)
		FROM session_exercises sx
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE e.id = $1 AND sx.id = e.session_exercise_id AND s.user_id = $2
		RETURNING
			e.id, e.session_exercise_id, e.entry_number, e.weight, e.weight_unit, e.reps,
			e.duration_seconds, e.distance, e.distance_unit, e.incline, e.speed, e.rpe,
			e.is_completed, e.performed_at, e.metadata, e.created_at`
	return scanEntry(r.pool.QueryRow(ctx, q,
		id, userID,
		in.Weight, in.WeightUnit, in.Reps,
		in.DurationSeconds, in.Distance, in.DistanceUnit, in.Incline, in.Speed, in.RPE,
		in.IsCompleted, metaPtr(in.Metadata)))
}

// DeleteEntry removes an entry the user owns.
func (r *SessionRepository) DeleteEntry(ctx context.Context, userID, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM set_entries e
		USING session_exercises sx, workout_sessions s
		WHERE e.id = $1 AND sx.id = e.session_exercise_id
		  AND s.id = sx.session_id AND s.user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListEntriesForSession returns all entries under a session, ordered by
// session_exercise and entry number, for assembling the detail view.
func (r *SessionRepository) ListEntriesForSession(ctx context.Context, sessionID string) ([]domain.SetEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			e.id, e.session_exercise_id, e.entry_number, e.weight, e.weight_unit, e.reps,
			e.duration_seconds, e.distance, e.distance_unit, e.incline, e.speed, e.rpe,
			e.is_completed, e.performed_at, e.metadata, e.created_at
		FROM set_entries e
		JOIN session_exercises sx ON sx.id = e.session_exercise_id
		WHERE sx.session_id = $1
		ORDER BY e.session_exercise_id, e.entry_number`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.SetEntry{}
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

// metaPtr returns a *string JSON encoding of m, or nil when m is nil (so an
// omitted metadata field leaves the column unchanged on update).
func metaPtr(m domain.JSONMap) *string {
	if m == nil {
		return nil
	}
	s := encodeMeta(m)
	return &s
}
