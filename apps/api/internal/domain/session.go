package domain

import "time"

// WorkoutSession is one stateful performance of a routine (PRD 0002 §5.2).
type WorkoutSession struct {
	ID                    string     `json:"id"`
	UserID                string     `json:"user_id"`
	RoutineID             *string    `json:"routine_id"`
	Status                string     `json:"status"`
	PerformedAt           time.Time  `json:"performed_at"`
	StartedAt             *time.Time `json:"started_at"`
	EndedAt               *time.Time `json:"ended_at"`
	TotalDurationSeconds  *int       `json:"total_duration_seconds"`
	ActiveDurationSeconds *int       `json:"active_duration_seconds"`
	PausedDurationSeconds *int       `json:"paused_duration_seconds"`
	MuscleGroups          []string   `json:"muscle_groups"`
	Notes                 string     `json:"notes"`
	Metadata              JSONMap    `json:"metadata"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`

	// Populated on detail reads.
	Events    []SessionEvent    `json:"events,omitempty"`
	Exercises []SessionExercise `json:"exercises,omitempty"`
}

// SessionEvent is one lifecycle transition (PRD 0002 §5.3).
type SessionEvent struct {
	ID         string    `json:"id"`
	SessionID  string    `json:"session_id"`
	Type       string    `json:"type"`
	OccurredAt time.Time `json:"occurred_at"`
	Metadata   JSONMap   `json:"metadata"`
}

// SessionExercise is a checklist item + snapshot + per-exercise aggregates
// (PRD 0002 §5.4).
type SessionExercise struct {
	ID                    string     `json:"id"`
	SessionID             string     `json:"session_id"`
	ExerciseID            *string    `json:"exercise_id"`
	Position              int        `json:"position"`
	NameSnapshot          string     `json:"name_snapshot"`
	MeasurementType       string     `json:"measurement_type"`
	TargetSets            *int       `json:"target_sets"`
	TargetReps            *int       `json:"target_reps"`
	TargetWeight          *float64   `json:"target_weight"`
	TargetDurationSeconds *int       `json:"target_duration_seconds"`
	PrimaryMuscleGroup    string     `json:"primary_muscle_group"`
	SecondaryMuscleGroups []string   `json:"secondary_muscle_groups"`
	Status                string     `json:"status"`
	CompletedAt           *time.Time `json:"completed_at"`
	SetsCompleted         int        `json:"sets_completed"`
	TotalReps             *int       `json:"total_reps"`
	TotalVolume           *float64   `json:"total_volume"`
	TotalDurationSeconds  *int       `json:"total_duration_seconds"`
	TopSetWeight          *float64   `json:"top_set_weight"`
	Metadata              JSONMap    `json:"metadata"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`

	// Populated on detail reads.
	Entries []SetEntry `json:"entries,omitempty"`
}

// SetEntry is a generic performed unit — a strength set or a timed/distance bout
// (PRD 0002 §5.5).
type SetEntry struct {
	ID                string    `json:"id"`
	SessionExerciseID string    `json:"session_exercise_id"`
	EntryNumber       int       `json:"entry_number"`
	Weight            *float64  `json:"weight"`
	WeightUnit        *string   `json:"weight_unit"`
	Reps              *int      `json:"reps"`
	DurationSeconds   *int      `json:"duration_seconds"`
	Distance          *float64  `json:"distance"`
	DistanceUnit      *string   `json:"distance_unit"`
	Incline           *float64  `json:"incline"`
	Speed             *float64  `json:"speed"`
	RPE               *float64  `json:"rpe"`
	IsCompleted       bool      `json:"is_completed"`
	PerformedAt       time.Time `json:"performed_at"`
	Metadata          JSONMap   `json:"metadata"`
	CreatedAt         time.Time `json:"created_at"`
}
