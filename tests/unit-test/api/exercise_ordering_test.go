package api_test

import (
	"sort"
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/ordering"
)

// TestExerciseLess covers the routine exercise-list ordering rule: primary
// muscle group ASC, then name ASC.
func TestExerciseLess(t *testing.T) {
	t.Run("different muscle groups sort by muscle group ASC", func(t *testing.T) {
		// "back" < "chest" regardless of name.
		if !ordering.ExerciseLess("back", "Zzz Row", "chest", "Aaa Press") {
			t.Errorf("expected back/Zzz Row to sort before chest/Aaa Press")
		}
		if ordering.ExerciseLess("chest", "Aaa Press", "back", "Zzz Row") {
			t.Errorf("expected chest/Aaa Press to sort after back/Zzz Row")
		}
	})

	t.Run("same muscle group falls back to name ASC", func(t *testing.T) {
		if !ordering.ExerciseLess("chest", "Bench Press", "chest", "Incline Press") {
			t.Errorf("expected Bench Press to sort before Incline Press within chest")
		}
		if ordering.ExerciseLess("chest", "Incline Press", "chest", "Bench Press") {
			t.Errorf("expected Incline Press to sort after Bench Press within chest")
		}
	})

	t.Run("equal muscle group and name is not less", func(t *testing.T) {
		if ordering.ExerciseLess("chest", "Bench Press", "chest", "Bench Press") {
			t.Errorf("identical entries must not report less-than")
		}
	})
}

// TestExerciseLess_SortsSlice verifies the rule produces the expected full
// ordering when used as a sort comparator over a scrambled slice.
func TestExerciseLess_SortsSlice(t *testing.T) {
	type ex struct{ muscle, name string }
	in := []ex{
		{"chest", "Incline Press"},
		{"back", "Pull Up"},
		{"chest", "Bench Press"},
		{"back", "Deadlift"},
		{"biceps", "Curl"},
	}
	want := []ex{
		{"back", "Deadlift"},
		{"back", "Pull Up"},
		{"biceps", "Curl"},
		{"chest", "Bench Press"},
		{"chest", "Incline Press"},
	}

	sort.SliceStable(in, func(i, j int) bool {
		return ordering.ExerciseLess(in[i].muscle, in[i].name, in[j].muscle, in[j].name)
	})

	for i := range want {
		if in[i] != want[i] {
			t.Fatalf("position %d = %+v, want %+v (full: %+v)", i, in[i], want[i], in)
		}
	}
}
