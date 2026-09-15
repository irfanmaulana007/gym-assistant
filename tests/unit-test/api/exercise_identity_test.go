package api_test

import (
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/exercise"
)

// TestNormalizeName covers the identity-key folding used to group custom
// exercises across routines (PRD 0014): case- and surrounding-whitespace
// insensitive, mirroring Postgres lower(btrim(name)).
func TestNormalizeName(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Lateral Raise", "lateral raise"},
		{"  lateral raise  ", "lateral raise"},
		{"LATERAL RAISE", "lateral raise"},
	}
	for _, c := range cases {
		if got := exercise.NormalizeName(c.in); got != c.want {
			t.Errorf("NormalizeName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestSameIdentity is the single rule for "same movement" that drives shared
// history aggregation (PRD 0014).
func TestSameIdentity(t *testing.T) {
	catA := "11111111-1111-1111-1111-111111111111"
	catB := "22222222-2222-2222-2222-222222222222"

	t.Run("both linked to same catalog entry", func(t *testing.T) {
		if !exercise.SameIdentity(&catA, "Lateral Raise", &catA, "Side Lateral Raise") {
			t.Error("same catalog id should merge regardless of name")
		}
	})

	t.Run("both linked to different catalog entries", func(t *testing.T) {
		if exercise.SameIdentity(&catA, "Lateral Raise", &catB, "Lateral Raise") {
			t.Error("different catalog ids should not merge even with same name")
		}
	})

	t.Run("both custom, names match case/space-insensitively", func(t *testing.T) {
		if !exercise.SameIdentity(nil, "My Move", nil, "  my move ") {
			t.Error("custom exercises with equal normalized names should merge")
		}
	})

	t.Run("both custom, names differ", func(t *testing.T) {
		if exercise.SameIdentity(nil, "My Move", nil, "Other Move") {
			t.Error("custom exercises with different names should not merge")
		}
	})

	t.Run("one linked and one custom never merge", func(t *testing.T) {
		if exercise.SameIdentity(&catA, "Lateral Raise", nil, "Lateral Raise") {
			t.Error("a linked and a custom exercise should not merge on name alone")
		}
	})
}
