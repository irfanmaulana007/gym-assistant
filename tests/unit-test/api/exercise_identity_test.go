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

// TestIdentityKey covers the O(n) grouping key used to bucket exercises by
// movement (PRD 0014): catalog-linked exercises key on their catalog id (name
// irrelevant), custom exercises on their normalized name, and the two never
// collide. Equal keys must agree with SameIdentity.
func TestIdentityKey(t *testing.T) {
	catA := "11111111-1111-1111-1111-111111111111"

	if got := exercise.IdentityKey(&catA, "Lateral Raise"); got != "cat:"+catA {
		t.Errorf("linked key = %q, want %q", got, "cat:"+catA)
	}
	if got := exercise.IdentityKey(nil, "  Lateral Raise "); got != "name:lateral raise" {
		t.Errorf("custom key = %q, want %q", got, "name:lateral raise")
	}
	// A linked exercise and a custom exercise whose name equals the catalog id
	// string must still not collide (distinct prefixes).
	if exercise.IdentityKey(&catA, "x") == exercise.IdentityKey(nil, catA) {
		t.Error("linked and custom keys collided")
	}
	// Key equality must match SameIdentity.
	catB := catA
	if (exercise.IdentityKey(&catA, "a") == exercise.IdentityKey(&catB, "b")) !=
		exercise.SameIdentity(&catA, "a", &catB, "b") {
		t.Error("IdentityKey equality disagrees with SameIdentity")
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
