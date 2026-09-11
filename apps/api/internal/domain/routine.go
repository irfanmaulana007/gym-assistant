package domain

import "time"

// Routine is a grouped workout day (Push/Pull/Legs), scoped to a user.
type Routine struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	Notes     string    `json:"notes"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Exercises is populated only on the routine-detail read.
	Exercises []Exercise `json:"exercises,omitempty"`
}

// Exercise is a movement definition/template within a routine.
type Exercise struct {
	ID                    string    `json:"id"`
	RoutineID             string    `json:"routine_id"`
	Name                  string    `json:"name"`
	MeasurementType       string    `json:"measurement_type"`
	TargetSets            *int      `json:"target_sets"`
	TargetReps            *int      `json:"target_reps"`
	TargetWeight          *float64  `json:"target_weight"`
	TargetDurationSeconds *int      `json:"target_duration_seconds"`
	TargetDistance        *float64  `json:"target_distance"`
	DistanceUnit          *string   `json:"distance_unit"`
	PrimaryMuscleGroup    string    `json:"primary_muscle_group"`
	SecondaryMuscleGroups []string  `json:"secondary_muscle_groups"`
	DefaultMetadata       JSONMap   `json:"default_metadata"`
	Notes                 string    `json:"notes"`
	Position              int       `json:"position"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`

	// CatalogExerciseID links this exercise to a shared catalog entry (PRD 0006).
	// When set, PrimaryMuscleGroup/SecondaryMuscleGroups above are resolved from
	// the catalog on read rather than from this exercise's own columns.
	CatalogExerciseID *string `json:"catalog_exercise_id"`
	// CatalogName is the linked catalog entry's canonical name, for convenience
	// on read. Nil for custom exercises.
	CatalogName *string `json:"catalog_name,omitempty"`

	// LastSet is populated on the routine-detail read: the heaviest set of the
	// most recent session this exercise was performed in, or nil if never done.
	LastSet *LastSet `json:"last_set,omitempty"`
}

// CatalogExercise is a shared master-data movement (PRD 0006). It is global
// (not user-scoped) and read-only to users; a routine Exercise may link to it
// via CatalogExerciseID, resolving its muscle groups from here on read.
type CatalogExercise struct {
	ID                     string    `json:"id"`
	Name                   string    `json:"name"`
	PrimaryMuscleGroup     string    `json:"primary_muscle_group"`
	SecondaryMuscleGroups  []string  `json:"secondary_muscle_groups"`
	DefaultMeasurementType string    `json:"default_measurement_type"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}
