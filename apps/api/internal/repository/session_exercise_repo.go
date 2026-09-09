package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

const sessionExerciseSelect = `
	id, session_id, exercise_id, position, name_snapshot, measurement_type,
	target_sets, target_reps, target_weight, target_duration_seconds,
	primary_muscle_group, COALESCE(secondary_muscle_groups, '{}')::text[],
	status, completed_at, sets_completed, total_reps, total_volume,
	total_duration_seconds, top_set_weight, metadata, created_at, updated_at`

func scanSessionExercise(row pgx.Row) (*domain.SessionExercise, error) {
	var sx domain.SessionExercise
	var meta []byte
	err := row.Scan(
		&sx.ID, &sx.SessionID, &sx.ExerciseID, &sx.Position, &sx.NameSnapshot, &sx.MeasurementType,
		&sx.TargetSets, &sx.TargetReps, &sx.TargetWeight, &sx.TargetDurationSeconds,
		&sx.PrimaryMuscleGroup, &sx.SecondaryMuscleGroups,
		&sx.Status, &sx.CompletedAt, &sx.SetsCompleted, &sx.TotalReps, &sx.TotalVolume,
		&sx.TotalDurationSeconds, &sx.TopSetWeight, &meta, &sx.CreatedAt, &sx.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	sx.Metadata = decodeMeta(meta)
	if sx.SecondaryMuscleGroups == nil {
		sx.SecondaryMuscleGroups = []string{}
	}
	return &sx, nil
}

// ListSessionExercises returns a session's checklist ordered by position.
func (r *SessionRepository) ListSessionExercises(ctx context.Context, sessionID string) ([]domain.SessionExercise, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+sessionExerciseSelect+` FROM session_exercises WHERE session_id = $1 ORDER BY position, created_at`,
		sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.SessionExercise{}
	for rows.Next() {
		sx, err := scanSessionExercise(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sx)
	}
	return out, rows.Err()
}

// GetSessionExercise returns a checklist item owned by the user (via its
// session) together with the parent session's status.
func (r *SessionRepository) GetSessionExercise(ctx context.Context, userID, id string) (*domain.SessionExercise, string, error) {
	const q = `
		SELECT ` + sessionExerciseReturning + `, s.status
		FROM session_exercises sx
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE sx.id = $1 AND s.user_id = $2`
	var sx domain.SessionExercise
	var meta []byte
	var sessionStatus string
	err := r.pool.QueryRow(ctx, q, id, userID).Scan(
		&sx.ID, &sx.SessionID, &sx.ExerciseID, &sx.Position, &sx.NameSnapshot, &sx.MeasurementType,
		&sx.TargetSets, &sx.TargetReps, &sx.TargetWeight, &sx.TargetDurationSeconds,
		&sx.PrimaryMuscleGroup, &sx.SecondaryMuscleGroups,
		&sx.Status, &sx.CompletedAt, &sx.SetsCompleted, &sx.TotalReps, &sx.TotalVolume,
		&sx.TotalDurationSeconds, &sx.TopSetWeight, &meta, &sx.CreatedAt, &sx.UpdatedAt,
		&sessionStatus,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", ErrNotFound
		}
		return nil, "", err
	}
	sx.Metadata = decodeMeta(meta)
	if sx.SecondaryMuscleGroups == nil {
		sx.SecondaryMuscleGroups = []string{}
	}
	return &sx, sessionStatus, nil
}

// UpdateSessionExercise updates a checklist item's status and/or position. When
// status becomes "completed", completed_at is stamped; otherwise it is cleared.
func (r *SessionRepository) UpdateSessionExercise(ctx context.Context, userID, id string, status *string, position *int) (*domain.SessionExercise, error) {
	const q = `
		UPDATE session_exercises sx SET
			status = COALESCE($3::session_exercise_status, sx.status),
			position = COALESCE($4, sx.position),
			completed_at = CASE
				WHEN $3 = 'completed' THEN now()
				WHEN $3 IS NOT NULL THEN NULL
				ELSE sx.completed_at
			END,
			updated_at = now()
		FROM workout_sessions s
		WHERE sx.id = $1 AND s.id = sx.session_id AND s.user_id = $2
		RETURNING ` + sessionExerciseReturning
	return scanSessionExercise(r.pool.QueryRow(ctx, q, id, userID, status, position))
}

// sessionExerciseReturning is sessionExerciseSelect qualified with sx. for use
// in UPDATE ... FROM ... RETURNING (where a bare column would be ambiguous).
const sessionExerciseReturning = `
	sx.id, sx.session_id, sx.exercise_id, sx.position, sx.name_snapshot, sx.measurement_type,
	sx.target_sets, sx.target_reps, sx.target_weight, sx.target_duration_seconds,
	sx.primary_muscle_group, COALESCE(sx.secondary_muscle_groups, '{}')::text[],
	sx.status, sx.completed_at, sx.sets_completed, sx.total_reps, sx.total_volume,
	sx.total_duration_seconds, sx.top_set_weight, sx.metadata, sx.created_at, sx.updated_at`

// AddAdHocExercise inserts an exercise into a live session (no routine template).
func (r *SessionRepository) AddAdHocExercise(ctx context.Context, sessionID string, in AdHocExerciseInput) (*domain.SessionExercise, error) {
	const q = `
		INSERT INTO session_exercises (
			session_id, exercise_id, position, name_snapshot, measurement_type,
			target_sets, target_reps, target_weight, target_duration_seconds,
			primary_muscle_group, secondary_muscle_groups, status)
		VALUES (
			$1, NULL,
			COALESCE((SELECT MAX(position) + 1 FROM session_exercises WHERE session_id = $1), 0),
			$2, $3::measurement_type, $4, $5, $6, $7,
			$8::muscle_group, $9::muscle_group[], 'pending')
		RETURNING ` + sessionExerciseSelect
	return scanSessionExercise(r.pool.QueryRow(ctx, q,
		sessionID, in.Name, deref(in.MeasurementType, "weight_reps"),
		in.TargetSets, in.TargetReps, in.TargetWeight, in.TargetDurationSeconds,
		deref(in.PrimaryMuscleGroup, "other"), enumArrayLiteral(in.SecondaryMuscleGroups)))
}

// DeleteSessionExercise removes a checklist item owned by the user.
func (r *SessionRepository) DeleteSessionExercise(ctx context.Context, userID, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM session_exercises sx
		USING workout_sessions s
		WHERE sx.id = $1 AND s.id = sx.session_id AND s.user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AdHocExerciseInput carries the fields for an on-the-spot session exercise.
type AdHocExerciseInput struct {
	Name                  string
	MeasurementType       *string
	TargetSets            *int
	TargetReps            *int
	TargetWeight          *float64
	TargetDurationSeconds *int
	PrimaryMuscleGroup    *string
	SecondaryMuscleGroups []string
}
