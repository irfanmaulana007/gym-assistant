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
}
