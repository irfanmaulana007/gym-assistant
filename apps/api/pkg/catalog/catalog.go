// Package catalog holds the pure, dependency-light rules for the shared
// exercise catalog (PRD 0006): validating a catalog entry's controlled-vocab
// fields, and resolving an exercise's displayed muscle groups from either the
// catalog (when linked) or the exercise's own columns (when custom).
//
// Keeping these as pure functions lets the repository/service reuse one rule and
// the test module (which cannot import internal/) unit-test it directly.
package catalog

import "github.com/irfanmaulana007/gym-assistant/apps/api/pkg/vocab"

// ResolveMuscleGroups returns the muscle groups to display for an exercise.
//
// When the exercise is linked to a catalog entry, the catalog is the source of
// truth (reference-only, PRD §4.2); otherwise the exercise owns its columns. The
// returned secondary slice is always non-nil so JSON encodes it as [] not null.
func ResolveMuscleGroups(linked bool, catalogPrimary string, catalogSecondary []string, ownPrimary string, ownSecondary []string) (primary string, secondary []string) {
	if linked {
		return catalogPrimary, nonNil(catalogSecondary)
	}
	return ownPrimary, nonNil(ownSecondary)
}

// ValidateEntry checks the controlled-vocabulary fields of a catalog entry and
// returns a field->message map (empty when valid). It is the single gate used
// both for the catalog data itself and for validating catalog-related filters.
func ValidateEntry(primaryMuscleGroup string, secondaryMuscleGroups []string, defaultMeasurementType string) map[string]string {
	details := map[string]string{}
	if !vocab.IsMuscleGroup(primaryMuscleGroup) {
		details["primary_muscle_group"] = "unknown muscle group"
	}
	for _, g := range secondaryMuscleGroups {
		if !vocab.IsMuscleGroup(g) {
			details["secondary_muscle_groups"] = "unknown muscle group: " + g
			break
		}
	}
	if defaultMeasurementType != "" && !vocab.IsMeasurementType(defaultMeasurementType) {
		details["default_measurement_type"] = "unknown measurement type"
	}
	return details
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
