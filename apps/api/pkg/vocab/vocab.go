// Package vocab holds the controlled vocabularies (muscle groups, measurement
// types, units) shared by the API and validated at the edge. Keeping them here
// (pure, no deps) lets both services and the test suite validate against the
// same source of truth as the database enums.
package vocab

// MuscleGroups is the controlled muscle-group vocabulary (mirrors the
// muscle_group enum in the initial migration).
var MuscleGroups = []string{
	"chest", "back", "shoulders", "biceps", "triceps", "forearms",
	"quads", "hamstrings", "glutes", "calves", "core", "full_body",
	"cardio", "other",
}

// MeasurementTypes mirrors the measurement_type enum.
var MeasurementTypes = []string{"weight_reps", "reps_only", "duration", "distance"}

// WeightUnits mirrors the weight_unit enum.
var WeightUnits = []string{"kg", "lb"}

// DistanceUnits mirrors the distance_unit enum.
var DistanceUnits = []string{"km", "mi", "m"}

// SessionExerciseStatuses mirrors the session_exercise_status enum — the
// checklist checkbox states.
var SessionExerciseStatuses = []string{"pending", "in_progress", "completed", "skipped"}

func in(set []string, v string) bool {
	for _, s := range set {
		if s == v {
			return true
		}
	}
	return false
}

// IsMuscleGroup reports whether v is a valid muscle group.
func IsMuscleGroup(v string) bool { return in(MuscleGroups, v) }

// IsMeasurementType reports whether v is a valid measurement type.
func IsMeasurementType(v string) bool { return in(MeasurementTypes, v) }

// IsWeightUnit reports whether v is a valid weight unit.
func IsWeightUnit(v string) bool { return in(WeightUnits, v) }

// IsDistanceUnit reports whether v is a valid distance unit.
func IsDistanceUnit(v string) bool { return in(DistanceUnits, v) }

// IsSessionExerciseStatus reports whether v is a valid checklist status.
func IsSessionExerciseStatus(v string) bool { return in(SessionExerciseStatuses, v) }
