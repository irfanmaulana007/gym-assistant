package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

const sessionExerciseSelect = `
	id, session_id, exercise_id, catalog_exercise_id, position, name_snapshot, measurement_type,
	target_sets, target_reps, target_weight, target_duration_seconds,
	primary_muscle_group, COALESCE(secondary_muscle_groups, '{}')::text[],
	status, completed_at, sets_completed, total_reps, total_volume,
	total_duration_seconds, top_set_weight, metadata, created_at, updated_at`

func scanSessionExercise(row pgx.Row) (*domain.SessionExercise, error) {
	var sx domain.SessionExercise
	var meta []byte
	err := row.Scan(
		&sx.ID, &sx.SessionID, &sx.ExerciseID, &sx.CatalogExerciseID, &sx.Position, &sx.NameSnapshot, &sx.MeasurementType,
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

// LastSetsBeforeSession returns candidate "last set" rows for the exercises
// performed in the given session, drawn from the user's *other* sessions (the
// current session is excluded so an in-progress log never counts as its own
// "weight to beat") and from every routine that contains the *same* movement
// (PRD 0016), so the weight-to-beat is shared across workout groups. Each row is
// tagged with the session's exercise id it seeds, not its source exercise.
// Ad-hoc exercises (no exercise_id) are excluded. The caller reduces these to
// each exercise's most recent top set.
func (r *SessionRepository) LastSetsBeforeSession(ctx context.Context, userID, sessionID string) ([]LastSetRow, error) {
	out := []LastSetRow{}

	// Routine-backed targets: shared across routines by movement identity
	// (PRD 0014/0016), tagged with the routine exercise id.
	ids, err := loadUserExerciseIdentities(ctx, r.pool, userID)
	if err != nil {
		return nil, err
	}
	targetIDs, err := r.sessionExerciseIDs(ctx, userID, sessionID)
	if err != nil {
		return nil, err
	}
	if peerIDs := ids.peerIDsForTargets(targetIDs); len(peerIDs) > 0 {
		const q = `
			SELECT
				sx.exercise_id,
				s.id,
				se.weight,
				COALESCE(se.weight_unit, 'kg'),
				se.reps,
				COALESCE(s.started_at, s.performed_at, s.created_at) AS performed_at
			FROM set_entries se
			JOIN session_exercises sx ON sx.id = se.session_exercise_id
			JOIN workout_sessions s ON s.id = sx.session_id
			WHERE s.user_id = $1
				AND s.id <> $2
				AND se.weight IS NOT NULL AND se.reps IS NOT NULL
				AND sx.exercise_id = ANY($3::uuid[])`
		rows, err := r.pool.Query(ctx, q, userID, sessionID, peerIDs)
		if err != nil {
			return nil, err
		}
		candidates, err := scanLastSetRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ids.retagByIdentity(candidates, targetIDs)...)
	}

	// Catalog-linked ad-hoc targets in this session (PRD 0017 §4.4): give each a
	// "weight to beat" drawn from prior sets of the same catalog movement — both
	// earlier ad-hoc sets and routine sets.
	adHoc, err := r.adHocCatalogLastSets(ctx, userID, sessionID)
	if err != nil {
		return nil, err
	}
	return append(out, adHoc...), nil
}

// adHocCatalogLastSets returns candidate "last set" rows for the current
// session's catalog-linked ad-hoc exercises, each tagged with the ad-hoc
// session_exercise's own id (the token SessionService.load matches on). Candidate
// sets are drawn from the user's *other* sessions where the resolved catalog id
// (the session_exercise's own catalog link, else its routine exercise's) matches
// the ad-hoc target's catalog movement — so an ad-hoc exercise shares the same
// weight-to-beat a registered one would (PRD 0017).
func (r *SessionRepository) adHocCatalogLastSets(ctx context.Context, userID, sessionID string) ([]LastSetRow, error) {
	targetRows, err := r.pool.Query(ctx, `
		SELECT sx.id, sx.catalog_exercise_id
		FROM session_exercises sx
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE sx.session_id = $1 AND s.user_id = $2
			AND sx.exercise_id IS NULL AND sx.catalog_exercise_id IS NOT NULL`,
		sessionID, userID)
	if err != nil {
		return nil, err
	}
	tokensByCatalog := map[string][]string{} // catalog id -> ad-hoc session_exercise ids
	catalogIDs := []string{}
	for targetRows.Next() {
		var sxID, catID string
		if err := targetRows.Scan(&sxID, &catID); err != nil {
			targetRows.Close()
			return nil, err
		}
		if _, seen := tokensByCatalog[catID]; !seen {
			catalogIDs = append(catalogIDs, catID)
		}
		tokensByCatalog[catID] = append(tokensByCatalog[catID], sxID)
	}
	if err := targetRows.Err(); err != nil {
		targetRows.Close()
		return nil, err
	}
	targetRows.Close()
	if len(catalogIDs) == 0 {
		return []LastSetRow{}, nil
	}

	const q = `
		SELECT
			COALESCE(sx.catalog_exercise_id, e.catalog_exercise_id) AS cat_id,
			s.id,
			se.weight,
			COALESCE(se.weight_unit, 'kg'),
			se.reps,
			COALESCE(s.started_at, s.performed_at, s.created_at) AS performed_at
		FROM set_entries se
		JOIN session_exercises sx ON sx.id = se.session_exercise_id
		JOIN workout_sessions s ON s.id = sx.session_id
		LEFT JOIN exercises e ON e.id = sx.exercise_id
		WHERE s.user_id = $1
			AND s.id <> $2
			AND se.weight IS NOT NULL AND se.reps IS NOT NULL
			AND COALESCE(sx.catalog_exercise_id, e.catalog_exercise_id) = ANY($3::uuid[])`
	rows, err := r.pool.Query(ctx, q, userID, sessionID, catalogIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []LastSetRow{}
	for rows.Next() {
		var catID string
		var lr LastSetRow
		if err := rows.Scan(&catID, &lr.SessionID, &lr.Weight, &lr.WeightUnit, &lr.Reps, &lr.PerformedAt); err != nil {
			return nil, err
		}
		for _, token := range tokensByCatalog[catID] {
			rc := lr
			rc.ExerciseID = token
			out = append(out, rc)
		}
	}
	return out, rows.Err()
}

// sessionExerciseIDs returns the distinct live exercise ids performed in a
// session the user owns (ad-hoc entries with no exercise link are excluded).
func (r *SessionRepository) sessionExerciseIDs(ctx context.Context, userID, sessionID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT sx.exercise_id
		FROM session_exercises sx
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE sx.session_id = $1 AND s.user_id = $2 AND sx.exercise_id IS NOT NULL`,
		sessionID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
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
		&sx.ID, &sx.SessionID, &sx.ExerciseID, &sx.CatalogExerciseID, &sx.Position, &sx.NameSnapshot, &sx.MeasurementType,
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
	sx.id, sx.session_id, sx.exercise_id, sx.catalog_exercise_id, sx.position, sx.name_snapshot, sx.measurement_type,
	sx.target_sets, sx.target_reps, sx.target_weight, sx.target_duration_seconds,
	sx.primary_muscle_group, COALESCE(sx.secondary_muscle_groups, '{}')::text[],
	sx.status, sx.completed_at, sx.sets_completed, sx.total_reps, sx.total_volume,
	sx.total_duration_seconds, sx.top_set_weight, sx.metadata, sx.created_at, sx.updated_at`

// AddAdHocExercise inserts an exercise into a live session (no routine template).
func (r *SessionRepository) AddAdHocExercise(ctx context.Context, sessionID string, in AdHocExerciseInput) (*domain.SessionExercise, error) {
	const q = `
		INSERT INTO session_exercises (
			session_id, exercise_id, catalog_exercise_id, position, name_snapshot, measurement_type,
			target_sets, target_reps, target_weight, target_duration_seconds,
			primary_muscle_group, secondary_muscle_groups, status)
		VALUES (
			$1, NULL, $10,
			COALESCE((SELECT MAX(position) + 1 FROM session_exercises WHERE session_id = $1), 0),
			$2, $3::measurement_type, $4, $5, $6, $7,
			$8::muscle_group, $9::muscle_group[], 'pending')
		RETURNING ` + sessionExerciseSelect
	return scanSessionExercise(r.pool.QueryRow(ctx, q,
		sessionID, in.Name, deref(in.MeasurementType, "weight_reps"),
		in.TargetSets, in.TargetReps, in.TargetWeight, in.TargetDurationSeconds,
		deref(in.PrimaryMuscleGroup, "other"), enumArrayLiteral(in.SecondaryMuscleGroups),
		in.CatalogExerciseID))
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
// When CatalogExerciseID is set (PRD 0017) the service resolves name,
// measurement type, and muscle groups from the catalog before inserting.
type AdHocExerciseInput struct {
	Name                  string
	MeasurementType       *string
	TargetSets            *int
	TargetReps            *int
	TargetWeight          *float64
	TargetDurationSeconds *int
	PrimaryMuscleGroup    *string
	SecondaryMuscleGroups []string
	CatalogExerciseID     *string
}
