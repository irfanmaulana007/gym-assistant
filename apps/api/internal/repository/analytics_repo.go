package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsRepository runs the read-only, windowed aggregate queries behind the
// analytics dashboard (PRD 0007). Every query is scoped to the authenticated
// user_id and counts only completed sessions. Volume is normalized to kilograms
// in SQL (PRD §4.5) so mixed-unit rows never corrupt a total.
type AnalyticsRepository struct {
	pool *pgxpool.Pool
}

// NewAnalyticsRepository builds an AnalyticsRepository.
func NewAnalyticsRepository(pool *pgxpool.Pool) *AnalyticsRepository {
	return &AnalyticsRepository{pool: pool}
}

// sessionDate is the canonical "when did this session happen" expression, reused
// across every windowed query so bucketing and filtering stay consistent.
const sessionDate = "COALESCE(s.started_at, s.performed_at, s.created_at)"

// normKg normalizes a set entry's weight to kilograms inline (lb → kg).
const normKg = "(CASE WHEN se.weight_unit = 'lb' THEN se.weight * 0.45359237 ELSE se.weight END)"

// SessionStats holds session-level aggregates over a window.
type SessionStats struct {
	Workouts    int
	ActiveSecs  int
	TotalVolume float64 // kilograms, unit-normalized
}

// SessionStats returns the count of completed sessions, total active training
// seconds, and unit-normalized total volume for the user in [from, to).
func (r *AnalyticsRepository) SessionStats(ctx context.Context, userID string, from, to time.Time) (SessionStats, error) {
	var out SessionStats
	// Session count + active seconds (session-level).
	const sq = `
		SELECT COUNT(*), COALESCE(SUM(COALESCE(active_duration_seconds, 0)), 0)
		FROM workout_sessions s
		WHERE s.user_id = $1 AND s.status = 'completed'
		  AND ` + sessionDate + ` >= $2 AND ` + sessionDate + ` < $3`
	if err := r.pool.QueryRow(ctx, sq, userID, from, to).Scan(&out.Workouts, &out.ActiveSecs); err != nil {
		return SessionStats{}, err
	}
	// Volume (set-level, unit-normalized).
	const vq = `
		SELECT COALESCE(SUM(` + normKg + ` * se.reps), 0)
		FROM set_entries se
		JOIN session_exercises sx ON sx.id = se.session_exercise_id
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE s.user_id = $1 AND s.status = 'completed'
		  AND se.weight IS NOT NULL AND se.reps IS NOT NULL
		  AND ` + sessionDate + ` >= $2 AND ` + sessionDate + ` < $3`
	if err := r.pool.QueryRow(ctx, vq, userID, from, to).Scan(&out.TotalVolume); err != nil {
		return SessionStats{}, err
	}
	return out, nil
}

// LastSessionDate returns the date of the user's most recent completed session,
// or nil when they have none.
func (r *AnalyticsRepository) LastSessionDate(ctx context.Context, userID string) (*time.Time, error) {
	const q = `
		SELECT MAX(` + sessionDate + `)
		FROM workout_sessions s
		WHERE s.user_id = $1 AND s.status = 'completed'`
	var t *time.Time
	if err := r.pool.QueryRow(ctx, q, userID).Scan(&t); err != nil {
		return nil, err
	}
	return t, nil
}

// SessionDates returns the dates of all the user's completed sessions (all-time,
// ascending) — the input for streak calculation.
func (r *AnalyticsRepository) SessionDates(ctx context.Context, userID string) ([]time.Time, error) {
	const q = `
		SELECT ` + sessionDate + ` AS d
		FROM workout_sessions s
		WHERE s.user_id = $1 AND s.status = 'completed'
		ORDER BY d`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []time.Time{}
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// DayCount is the number of completed sessions on a single calendar day.
type DayCount struct {
	Date  time.Time
	Count int
}

// DayCounts returns per-day completed-session counts within [from, to), for the
// activity calendar. Days are truncated in the given timezone.
func (r *AnalyticsRepository) DayCounts(ctx context.Context, userID string, from, to time.Time, tz string) ([]DayCount, error) {
	const q = `
		SELECT date_trunc('day', ` + sessionDate + ` AT TIME ZONE $4)::date AS d, COUNT(*)
		FROM workout_sessions s
		WHERE s.user_id = $1 AND s.status = 'completed'
		  AND ` + sessionDate + ` >= $2 AND ` + sessionDate + ` < $3
		GROUP BY d ORDER BY d`
	rows, err := r.pool.Query(ctx, q, userID, from, to, tz)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DayCount{}
	for rows.Next() {
		var dc DayCount
		if err := rows.Scan(&dc.Date, &dc.Count); err != nil {
			return nil, err
		}
		out = append(out, dc)
	}
	return out, rows.Err()
}

// VolumeBucket is one point on the volume time-series.
type VolumeBucket struct {
	BucketStart time.Time
	Volume      float64 // kilograms, unit-normalized
	Sets        int
}

// VolumeSeries returns unit-normalized volume and completed-set counts bucketed
// by week or month (or per session when bucket == "session") over [from, to).
func (r *AnalyticsRepository) VolumeSeries(ctx context.Context, userID string, from, to time.Time, bucket, tz string) ([]VolumeBucket, error) {
	// bucket selects the truncation granularity; it is interpolated from a fixed
	// allow-list (never user text) so it is not a bind parameter.
	granularity := "week"
	switch bucket {
	case "session":
		granularity = "day"
	case "month":
		granularity = "month"
	}
	groupExpr := "date_trunc('" + granularity + "', " + sessionDate + " AT TIME ZONE $4)::date"
	q := `
		SELECT ` + groupExpr + ` AS b,
		       COALESCE(SUM(` + normKg + ` * se.reps), 0) AS vol,
		       COUNT(*) FILTER (WHERE se.weight IS NOT NULL AND se.reps IS NOT NULL) AS sets
		FROM set_entries se
		JOIN session_exercises sx ON sx.id = se.session_exercise_id
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE s.user_id = $1 AND s.status = 'completed'
		  AND se.weight IS NOT NULL AND se.reps IS NOT NULL
		  AND ` + sessionDate + ` >= $2 AND ` + sessionDate + ` < $3
		GROUP BY b ORDER BY b`
	rows, err := r.pool.Query(ctx, q, userID, from, to, tz)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []VolumeBucket{}
	for rows.Next() {
		var b VolumeBucket
		if err := rows.Scan(&b.BucketStart, &b.Volume, &b.Sets); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// MuscleGroupRow aggregates one primary muscle group over the window.
type MuscleGroupRow struct {
	MuscleGroup string
	Sets        int
	Volume      float64 // kilograms, unit-normalized
	Frequency   int     // distinct sessions that trained the group
}

// MuscleGroups returns per-primary-muscle-group sets, unit-normalized volume, and
// session frequency over [from, to). Sets/frequency come from the persisted
// session_exercise aggregates; volume is summed from normalized set rows so the
// two never double-count each other.
func (r *AnalyticsRepository) MuscleGroups(ctx context.Context, userID string, from, to time.Time) ([]MuscleGroupRow, error) {
	const q = `
		SELECT sx.primary_muscle_group::text,
		       COALESCE(SUM(sx.sets_completed), 0) AS sets,
		       COUNT(DISTINCT sx.session_id) AS freq,
		       COALESCE(SUM(vol.v), 0) AS volume
		FROM session_exercises sx
		JOIN workout_sessions s ON s.id = sx.session_id
		LEFT JOIN LATERAL (
			SELECT SUM(` + normKg + ` * se.reps) AS v
			FROM set_entries se
			WHERE se.session_exercise_id = sx.id
			  AND se.weight IS NOT NULL AND se.reps IS NOT NULL
		) vol ON true
		WHERE s.user_id = $1 AND s.status = 'completed'
		  AND ` + sessionDate + ` >= $2 AND ` + sessionDate + ` < $3
		GROUP BY sx.primary_muscle_group
		ORDER BY sets DESC, sx.primary_muscle_group`
	rows, err := r.pool.Query(ctx, q, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MuscleGroupRow{}
	for rows.Next() {
		var m MuscleGroupRow
		if err := rows.Scan(&m.MuscleGroup, &m.Sets, &m.Frequency, &m.Volume); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// PRSetRow is one weighted set of a catalog-linked exercise, normalized to kg —
// the raw material for personal records and estimated 1RM.
type PRSetRow struct {
	ExerciseID  string
	Name        string
	WeightKg    float64
	Reps        int
	PerformedAt time.Time
}

// PRSets returns every completed, weight-and-rep set of the user's
// catalog-linked exercises (all-time, normalized to kg). The service reduces
// these to per-exercise records and est-1RM; the in-window flag is derived by
// comparing PerformedAt to the window.
func (r *AnalyticsRepository) PRSets(ctx context.Context, userID string) ([]PRSetRow, error) {
	const q = `
		SELECT sx.exercise_id::text, sx.name_snapshot,
		       ` + normKg + ` AS wkg, se.reps, se.performed_at
		FROM set_entries se
		JOIN session_exercises sx ON sx.id = se.session_exercise_id
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE s.user_id = $1 AND s.status = 'completed'
		  AND sx.exercise_id IS NOT NULL
		  AND se.weight IS NOT NULL AND se.reps IS NOT NULL AND se.reps > 0
		ORDER BY sx.exercise_id, se.performed_at`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PRSetRow{}
	for rows.Next() {
		var p PRSetRow
		if err := rows.Scan(&p.ExerciseID, &p.Name, &p.WeightKg, &p.Reps, &p.PerformedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// TopSetRow is a single session's top (heaviest, normalized) set weight for a
// catalog-linked exercise — the per-session series behind trend/stall signals.
type TopSetRow struct {
	ExerciseID  string
	Name        string
	PerformedAt time.Time
	TopWeightKg float64
}

// ExerciseTopSets returns, per catalog-linked exercise, the heaviest normalized
// set weight of each completed session, ordered oldest first — the input to
// TrendFromTopWeights and the stall rule.
func (r *AnalyticsRepository) ExerciseTopSets(ctx context.Context, userID string) ([]TopSetRow, error) {
	const q = `
		SELECT sx.exercise_id::text, sx.name_snapshot,
		       ` + sessionDate + ` AS d,
		       MAX(` + normKg + `) AS top
		FROM set_entries se
		JOIN session_exercises sx ON sx.id = se.session_exercise_id
		JOIN workout_sessions s ON s.id = sx.session_id
		WHERE s.user_id = $1 AND s.status = 'completed'
		  AND sx.exercise_id IS NOT NULL
		  AND se.weight IS NOT NULL AND se.reps IS NOT NULL
		GROUP BY sx.exercise_id, sx.name_snapshot, s.id, d
		ORDER BY sx.exercise_id, d`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TopSetRow{}
	for rows.Next() {
		var t TopSetRow
		if err := rows.Scan(&t.ExerciseID, &t.Name, &t.PerformedAt, &t.TopWeightKg); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
