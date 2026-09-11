package repository

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/catalog"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/ordering"
)

// ExerciseRepository persists exercises. Ownership is enforced by joining to the
// parent routine's user_id — an exercise is only reachable through a routine the
// user owns.
type ExerciseRepository struct {
	pool *pgxpool.Pool
}

// NewExerciseRepository builds an ExerciseRepository.
func NewExerciseRepository(pool *pgxpool.Pool) *ExerciseRepository {
	return &ExerciseRepository{pool: pool}
}

// ExerciseInput carries the mutable fields of an exercise. Pointer fields are
// optional; on update, nil means "leave unchanged".
type ExerciseInput struct {
	Name                  *string
	MeasurementType       *string
	TargetSets            *int
	TargetReps            *int
	TargetWeight          *float64
	TargetDurationSeconds *int
	TargetDistance        *float64
	DistanceUnit          *string
	PrimaryMuscleGroup    *string
	SecondaryMuscleGroups []string
	DefaultMetadata       domain.JSONMap
	Notes                 *string

	// CatalogExerciseID, when non-nil, links the exercise to a catalog entry
	// (PRD 0006). On create this makes the exercise catalog-backed (its own
	// muscle columns are left NULL and resolved from the catalog on read). On
	// update it (re)links to the given catalog entry.
	CatalogExerciseID *string
	// ClearCatalog requests unlinking on update: the exercise becomes custom
	// again. The service requires PrimaryMuscleGroup to be supplied alongside so
	// the CHECK constraint still holds. Ignored on create.
	ClearCatalog bool
}

// resolvedExerciseSelect reads an exercise together with its (optional) linked
// catalog entry. Muscle groups are resolved in Go (see scanExercise) from the
// catalog when linked, or the exercise's own columns when custom — so the JSON
// response always carries concrete muscle groups (PRD §4.2). Callers append the
// appropriate JOIN/WHERE/ORDER BY.
const resolvedExerciseSelect = `
	SELECT
		e.id, e.routine_id, e.name, e.measurement_type,
		e.target_sets, e.target_reps, e.target_weight, e.target_duration_seconds,
		e.target_distance, e.distance_unit,
		e.primary_muscle_group,
		COALESCE(e.secondary_muscle_groups, '{}')::text[],
		e.default_metadata, e.notes, e.position, e.created_at, e.updated_at,
		e.catalog_exercise_id,
		ec.primary_muscle_group,
		COALESCE(ec.secondary_muscle_groups, '{}')::text[],
		ec.name
	FROM exercises e
	LEFT JOIN exercise_catalog ec ON ec.id = e.catalog_exercise_id`

func scanExercise(row pgx.Row) (*domain.Exercise, error) {
	var e domain.Exercise
	var meta []byte
	var ownPrimary *string
	var ownSecondary []string
	var catalogID *string
	var catalogPrimary *string
	var catalogSecondary []string
	var catalogName *string
	err := row.Scan(
		&e.ID, &e.RoutineID, &e.Name, &e.MeasurementType,
		&e.TargetSets, &e.TargetReps, &e.TargetWeight, &e.TargetDurationSeconds,
		&e.TargetDistance, &e.DistanceUnit,
		&ownPrimary,
		&ownSecondary,
		&meta, &e.Notes, &e.Position, &e.CreatedAt, &e.UpdatedAt,
		&catalogID,
		&catalogPrimary,
		&catalogSecondary,
		&catalogName,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	e.DefaultMetadata = decodeMeta(meta)
	e.CatalogExerciseID = catalogID
	e.CatalogName = catalogName
	primary, secondary := catalog.ResolveMuscleGroups(
		catalogID != nil,
		deref(catalogPrimary, ""), catalogSecondary,
		deref(ownPrimary, ""), ownSecondary,
	)
	e.PrimaryMuscleGroup = primary
	e.SecondaryMuscleGroups = secondary
	return &e, nil
}

// getResolvedByID re-reads an exercise (with catalog resolution) by id alone —
// used after a write to return the fully resolved row.
func (r *ExerciseRepository) getResolvedByID(ctx context.Context, id string) (*domain.Exercise, error) {
	return scanExercise(r.pool.QueryRow(ctx, resolvedExerciseSelect+` WHERE e.id = $1`, id))
}

// ownsRoutine reports whether the routine exists and belongs to the user.
func (r *ExerciseRepository) ownsRoutine(ctx context.Context, userID, routineID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM routines WHERE id = $1 AND user_id = $2)`,
		routineID, userID).Scan(&exists)
	return exists, err
}

// Create inserts an exercise into a routine the user owns, at the end of the
// routine's list. Returns ErrNotFound if the routine is missing/not owned.
func (r *ExerciseRepository) Create(ctx context.Context, userID, routineID string, in ExerciseInput) (*domain.Exercise, error) {
	owns, err := r.ownsRoutine(ctx, userID, routineID)
	if err != nil {
		return nil, err
	}
	if !owns {
		return nil, ErrNotFound
	}

	// Linked exercises leave their own muscle columns NULL/empty — the catalog is
	// the source of truth, resolved on read. Custom exercises populate them
	// (default primary 'other', mirroring the pre-catalog behavior).
	var primary any // NULL when linked
	var secondary string
	if in.CatalogExerciseID != nil {
		primary = nil
		secondary = "{}"
	} else {
		primary = deref(in.PrimaryMuscleGroup, "other")
		secondary = enumArrayLiteral(in.SecondaryMuscleGroups)
	}

	const q = `
		INSERT INTO exercises (
			routine_id, name, measurement_type,
			target_sets, target_reps, target_weight, target_duration_seconds,
			target_distance, distance_unit, primary_muscle_group,
			secondary_muscle_groups, default_metadata, notes, catalog_exercise_id, position
		) VALUES (
			$1, $2, $3::measurement_type,
			$4, $5, $6, $7,
			$8, $9::distance_unit, $10::muscle_group,
			$11::muscle_group[], $12::jsonb, $13, $14,
			COALESCE((SELECT MAX(position) + 1 FROM exercises WHERE routine_id = $1), 0)
		)
		RETURNING id`

	var id string
	if err := r.pool.QueryRow(ctx, q,
		routineID,
		deref(in.Name, ""),
		deref(in.MeasurementType, "weight_reps"),
		in.TargetSets, in.TargetReps, in.TargetWeight, in.TargetDurationSeconds,
		in.TargetDistance, in.DistanceUnit,
		primary,
		secondary,
		encodeMeta(in.DefaultMetadata),
		deref(in.Notes, ""),
		in.CatalogExerciseID,
	).Scan(&id); err != nil {
		return nil, err
	}
	return r.getResolvedByID(ctx, id)
}

// GetByID returns an exercise reachable through a routine the user owns.
func (r *ExerciseRepository) GetByID(ctx context.Context, userID, id string) (*domain.Exercise, error) {
	const q = resolvedExerciseSelect + `
		JOIN routines rt ON rt.id = e.routine_id
		WHERE e.id = $1 AND rt.user_id = $2`
	return scanExercise(r.pool.QueryRow(ctx, q, id, userID))
}

// ListByRoutine returns the routine's exercises sorted by resolved primary
// muscle group (ASC), then name (ASC). Muscle groups are resolved in Go from the
// catalog when linked (see scanExercise), so the sort must happen after the scan
// rather than in SQL — a SQL ORDER BY on primary_muscle_group would mis-order
// catalog-linked rows (their own column is NULL) and sort by enum definition
// order instead of alphabetically.
func (r *ExerciseRepository) ListByRoutine(ctx context.Context, routineID string) ([]domain.Exercise, error) {
	const q = resolvedExerciseSelect + `
		WHERE e.routine_id = $1`
	rows, err := r.pool.Query(ctx, q, routineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.Exercise{}
	for rows.Next() {
		e, err := scanExercise(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	sort.SliceStable(out, func(i, j int) bool {
		return ordering.ExerciseLess(
			out[i].PrimaryMuscleGroup, out[i].Name,
			out[j].PrimaryMuscleGroup, out[j].Name,
		)
	})
	return out, nil
}

// Update applies non-nil fields to an exercise the user owns.
func (r *ExerciseRepository) Update(ctx context.Context, userID, id string, in ExerciseInput) (*domain.Exercise, error) {
	// Secondary groups: nil slice means "unchanged"; a non-nil (possibly empty)
	// slice replaces the value.
	var secondary *string
	if in.SecondaryMuscleGroups != nil {
		lit := enumArrayLiteral(in.SecondaryMuscleGroups)
		secondary = &lit
	}
	var meta *string
	if in.DefaultMetadata != nil {
		m := encodeMeta(in.DefaultMetadata)
		meta = &m
	}

	// catalogOp drives the catalog-linkage change: 0 = unchanged, 1 = link to
	// $15, 2 = clear (unlink → custom). When linking, the exercise's own muscle
	// columns are reset (NULL primary, empty secondary) so the catalog is the
	// sole source of truth; when clearing, the caller-supplied muscle columns
	// take effect (the service requires primary_muscle_group alongside a clear).
	catalogOp := 0
	switch {
	case in.CatalogExerciseID != nil:
		catalogOp = 1
	case in.ClearCatalog:
		catalogOp = 2
	}

	// RHS column references are qualified with e. because routines (joined for
	// the ownership check) shares column names like name/notes/position.
	const q = `
		UPDATE exercises e SET
			name = COALESCE($3, e.name),
			measurement_type = COALESCE($4::measurement_type, e.measurement_type),
			target_sets = COALESCE($5, e.target_sets),
			target_reps = COALESCE($6, e.target_reps),
			target_weight = COALESCE($7, e.target_weight),
			target_duration_seconds = COALESCE($8, e.target_duration_seconds),
			target_distance = COALESCE($9, e.target_distance),
			distance_unit = COALESCE($10::distance_unit, e.distance_unit),
			primary_muscle_group = CASE $16::int
				WHEN 1 THEN NULL
				ELSE COALESCE($11::muscle_group, e.primary_muscle_group) END,
			secondary_muscle_groups = CASE $16::int
				WHEN 1 THEN '{}'::muscle_group[]
				ELSE COALESCE($12::muscle_group[], e.secondary_muscle_groups) END,
			catalog_exercise_id = CASE $16::int
				WHEN 1 THEN $15::uuid
				WHEN 2 THEN NULL
				ELSE e.catalog_exercise_id END,
			default_metadata = COALESCE($13::jsonb, e.default_metadata),
			notes = COALESCE($14, e.notes),
			updated_at = now()
		FROM routines rt
		WHERE e.id = $1 AND rt.id = e.routine_id AND rt.user_id = $2
		RETURNING e.id`

	var updatedID string
	err := r.pool.QueryRow(ctx, q,
		id, userID,
		in.Name, in.MeasurementType,
		in.TargetSets, in.TargetReps, in.TargetWeight, in.TargetDurationSeconds,
		in.TargetDistance, in.DistanceUnit, in.PrimaryMuscleGroup,
		secondary, meta, in.Notes,
		in.CatalogExerciseID, catalogOp,
	).Scan(&updatedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return r.getResolvedByID(ctx, updatedID)
}

// HistoryRow is one logged set for an exercise, joined to its session, used to
// derive progression. Ordered oldest session first.
type HistoryRow struct {
	SessionID   string
	PerformedAt time.Time
	EntryNumber int
	Weight      *float64
	WeightUnit  *string
	Reps        *int
}

// History returns every logged set for the exercise across all of the user's
// sessions, oldest first. Ownership is enforced via the session's user_id.
func (r *ExerciseRepository) History(ctx context.Context, userID, exerciseID string) ([]HistoryRow, error) {
	const q = `
		SELECT
			s.id,
			COALESCE(s.started_at, s.performed_at, s.created_at) AS performed_at,
			se.entry_number, se.weight, se.weight_unit, se.reps
		FROM set_entries se
		JOIN session_exercises sx ON sx.id = se.session_exercise_id
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE sx.exercise_id = $1 AND s.user_id = $2
		ORDER BY performed_at, s.id, se.entry_number`
	rows, err := r.pool.Query(ctx, q, exerciseID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []HistoryRow{}
	for rows.Next() {
		var h HistoryRow
		if err := rows.Scan(&h.SessionID, &h.PerformedAt, &h.EntryNumber, &h.Weight, &h.WeightUnit, &h.Reps); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// LastSetRow is one weighted, rep-logged set of an exercise, tagged with the
// session it belongs to and when that session happened. Callers derive the
// "weight to beat" (most recent session's heaviest set) from these in Go — the
// SQL only scopes and filters; the progression rule stays in pkg/overload.
type LastSetRow struct {
	ExerciseID  string
	SessionID   string
	Weight      float64
	WeightUnit  string
	Reps        int
	PerformedAt time.Time
}

// scanLastSetRows reads LastSetRow results (candidate sets, unordered).
func scanLastSetRows(rows pgx.Rows) ([]LastSetRow, error) {
	defer rows.Close()
	out := []LastSetRow{}
	for rows.Next() {
		var r LastSetRow
		if err := rows.Scan(&r.ExerciseID, &r.SessionID, &r.Weight, &r.WeightUnit, &r.Reps, &r.PerformedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// LastSetsByRoutine returns every weighted, rep-logged set for the routine's
// exercises across all of the user's sessions. Scoped to the user via the
// session's user_id; exercises never performed with a weight are simply absent.
// The caller reduces these to each exercise's most recent top set.
func (r *ExerciseRepository) LastSetsByRoutine(ctx context.Context, userID, routineID string) ([]LastSetRow, error) {
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
		JOIN exercises e ON e.id = sx.exercise_id
		WHERE e.routine_id = $1 AND s.user_id = $2
			AND se.weight IS NOT NULL AND se.reps IS NOT NULL`
	rows, err := r.pool.Query(ctx, q, routineID, userID)
	if err != nil {
		return nil, err
	}
	return scanLastSetRows(rows)
}

// Delete removes an exercise the user owns. Missing -> ErrNotFound.
func (r *ExerciseRepository) Delete(ctx context.Context, userID, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM exercises e
		USING routines rt
		WHERE e.id = $1 AND rt.id = e.routine_id AND rt.user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Reorder sets each exercise's position to its index in orderedIDs. All must
// belong to the given routine owned by the user; the change is atomic.
func (r *ExerciseRepository) Reorder(ctx context.Context, userID, routineID string, orderedIDs []string) error {
	owns, err := r.ownsRoutine(ctx, userID, routineID)
	if err != nil {
		return err
	}
	if !owns {
		return ErrNotFound
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for i, id := range orderedIDs {
		tag, err := tx.Exec(ctx,
			`UPDATE exercises SET position = $3, updated_at = now() WHERE id = $1 AND routine_id = $2`,
			id, routineID, i)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
	}
	return tx.Commit(ctx)
}

// --- helpers ---

func deref[T any](p *T, fallback T) T {
	if p == nil {
		return fallback
	}
	return *p
}

// enumArrayLiteral renders a Postgres array literal for enum values. The values
// are controlled-vocabulary identifiers (validated by the service), so no
// escaping is required.
func enumArrayLiteral(vals []string) string {
	if len(vals) == 0 {
		return "{}"
	}
	return "{" + strings.Join(vals, ",") + "}"
}

func encodeMeta(m domain.JSONMap) string {
	if m == nil {
		return "{}"
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func decodeMeta(b []byte) domain.JSONMap {
	if len(b) == 0 {
		return domain.JSONMap{}
	}
	var m domain.JSONMap
	if err := json.Unmarshal(b, &m); err != nil {
		return domain.JSONMap{}
	}
	return m
}
