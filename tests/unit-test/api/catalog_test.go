package api_test

import (
	"reflect"
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/catalog"
)

// TestResolveMuscleGroups covers the resolve-on-read rule (PRD §4.2): a linked
// exercise shows the catalog's muscle groups; a custom one shows its own.
func TestResolveMuscleGroups(t *testing.T) {
	catPrimary := "chest"
	catSecondary := []string{"triceps", "shoulders"}
	ownPrimary := "back"
	ownSecondary := []string{"biceps"}

	t.Run("linked resolves from catalog", func(t *testing.T) {
		primary, secondary := catalog.ResolveMuscleGroups(true, catPrimary, catSecondary, ownPrimary, ownSecondary)
		if primary != "chest" {
			t.Errorf("primary = %q, want chest", primary)
		}
		if !reflect.DeepEqual(secondary, []string{"triceps", "shoulders"}) {
			t.Errorf("secondary = %v, want [triceps shoulders]", secondary)
		}
	})

	t.Run("custom resolves from own columns", func(t *testing.T) {
		primary, secondary := catalog.ResolveMuscleGroups(false, catPrimary, catSecondary, ownPrimary, ownSecondary)
		if primary != "back" {
			t.Errorf("primary = %q, want back", primary)
		}
		if !reflect.DeepEqual(secondary, []string{"biceps"}) {
			t.Errorf("secondary = %v, want [biceps]", secondary)
		}
	})

	t.Run("nil secondary becomes empty slice not nil", func(t *testing.T) {
		_, secondary := catalog.ResolveMuscleGroups(false, "chest", nil, "core", nil)
		if secondary == nil {
			t.Fatal("secondary is nil, want []")
		}
		if len(secondary) != 0 {
			t.Errorf("secondary = %v, want empty", secondary)
		}
	})
}

// TestValidateEntry covers catalog controlled-vocab validation (PRD §5): bad
// muscle groups and measurement types are rejected; valid entries pass.
func TestValidateEntry(t *testing.T) {
	t.Run("valid entry has no details", func(t *testing.T) {
		details := catalog.ValidateEntry("chest", []string{"triceps"}, "weight_reps")
		if len(details) != 0 {
			t.Errorf("valid entry produced details: %v", details)
		}
	})

	t.Run("bad primary muscle group rejected", func(t *testing.T) {
		details := catalog.ValidateEntry("eyebrows", nil, "weight_reps")
		if _, ok := details["primary_muscle_group"]; !ok {
			t.Errorf("expected primary_muscle_group error, got %v", details)
		}
	})

	t.Run("bad secondary muscle group rejected", func(t *testing.T) {
		details := catalog.ValidateEntry("chest", []string{"triceps", "nostrils"}, "weight_reps")
		if _, ok := details["secondary_muscle_groups"]; !ok {
			t.Errorf("expected secondary_muscle_groups error, got %v", details)
		}
	})

	t.Run("bad measurement type rejected", func(t *testing.T) {
		details := catalog.ValidateEntry("chest", nil, "vibes")
		if _, ok := details["default_measurement_type"]; !ok {
			t.Errorf("expected default_measurement_type error, got %v", details)
		}
	})

	t.Run("empty measurement type allowed", func(t *testing.T) {
		details := catalog.ValidateEntry("chest", nil, "")
		if _, ok := details["default_measurement_type"]; ok {
			t.Errorf("empty measurement type should be allowed, got %v", details)
		}
	})
}
