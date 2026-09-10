package api_test

import (
	"testing"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/overload"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/vocab"
)

func TestTotalVolume(t *testing.T) {
	sets := []overload.Set{
		{SetNumber: 1, Weight: 60, Reps: 8},
		{SetNumber: 2, Weight: 62.5, Reps: 8},
	}
	got := overload.TotalVolume(sets)
	want := 60*8 + 62.5*8 // 980
	if got != want {
		t.Errorf("TotalVolume = %v, want %v", got, want)
	}
	if overload.TotalVolume(nil) != 0 {
		t.Error("TotalVolume(nil) should be 0")
	}
}

func TestBestSet(t *testing.T) {
	sets := []overload.Set{
		{SetNumber: 1, Weight: 60, Reps: 10},
		{SetNumber: 2, Weight: 62.5, Reps: 8},
		{SetNumber: 3, Weight: 62.5, Reps: 9}, // tie on weight, more reps -> wins
	}
	best, ok := overload.BestSet(sets)
	if !ok {
		t.Fatal("expected a best set")
	}
	if best.Weight != 62.5 || best.Reps != 9 {
		t.Errorf("BestSet = %+v, want {62.5 9}", best)
	}
	if _, ok := overload.BestSet(nil); ok {
		t.Error("BestSet(nil) should report ok=false")
	}
}

func TestTrendFromTopWeights(t *testing.T) {
	cases := []struct {
		name    string
		weights []float64
		dir     string
		change  float64
	}{
		{"none with one", []float64{60}, "none", 0},
		{"none with empty", nil, "none", 0},
		{"up", []float64{60, 62.5}, "up", 2.5},
		{"down", []float64{62.5, 60}, "down", -2.5},
		{"flat", []float64{60, 60}, "flat", 0},
		{"uses last two", []float64{50, 55, 57.5}, "up", 2.5},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := overload.TrendFromTopWeights(c.weights)
			if got.Direction != c.dir {
				t.Errorf("direction = %q, want %q", got.Direction, c.dir)
			}
			if got.Change != c.change {
				t.Errorf("change = %v, want %v", got.Change, c.change)
			}
			if got.Metric != "top_set_weight" {
				t.Errorf("metric = %q", got.Metric)
			}
		})
	}
}

func TestLastTopSet(t *testing.T) {
	day1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 1, 8, 10, 0, 0, 0, time.UTC)

	t.Run("no sets -> ok false", func(t *testing.T) {
		if _, ok := overload.LastTopSet(nil); ok {
			t.Error("LastTopSet(nil) should report ok=false")
		}
	})

	t.Run("single set is returned", func(t *testing.T) {
		got, ok := overload.LastTopSet([]overload.SessionSet{
			{SessionID: "s1", PerformedAt: day1, Weight: 60, Reps: 8},
		})
		if !ok || got.Weight != 60 || got.Reps != 8 {
			t.Errorf("LastTopSet = %+v ok=%v, want {60 8} true", got, ok)
		}
	})

	t.Run("picks the most recent session, not the heaviest ever", func(t *testing.T) {
		got, ok := overload.LastTopSet([]overload.SessionSet{
			{SessionID: "s1", PerformedAt: day1, Weight: 100, Reps: 5}, // heavier, but older
			{SessionID: "s2", PerformedAt: day2, Weight: 70, Reps: 8},  // most recent
			{SessionID: "s2", PerformedAt: day2, Weight: 72.5, Reps: 6},
		})
		if !ok || got.Weight != 72.5 || got.Reps != 6 {
			t.Errorf("LastTopSet = %+v, want {72.5 6} (latest session's top)", got)
		}
	})

	t.Run("within the latest session, ties on weight break to more reps", func(t *testing.T) {
		got, _ := overload.LastTopSet([]overload.SessionSet{
			{SessionID: "s2", PerformedAt: day2, Weight: 60, Reps: 8},
			{SessionID: "s2", PerformedAt: day2, Weight: 60, Reps: 10},
		})
		if got.Weight != 60 || got.Reps != 10 {
			t.Errorf("LastTopSet = %+v, want {60 10}", got)
		}
	})

	t.Run("equal timestamps break deterministically by session id", func(t *testing.T) {
		got, _ := overload.LastTopSet([]overload.SessionSet{
			{SessionID: "aaa", PerformedAt: day1, Weight: 50, Reps: 5},
			{SessionID: "bbb", PerformedAt: day1, Weight: 55, Reps: 5},
		})
		if got.Weight != 55 { // session "bbb" > "aaa" wins
			t.Errorf("LastTopSet = %+v, want session bbb's {55 5}", got)
		}
	})
}

func TestVocab(t *testing.T) {
	if !vocab.IsMuscleGroup("chest") || vocab.IsMuscleGroup("nope") {
		t.Error("muscle group validation wrong")
	}
	if !vocab.IsMeasurementType("duration") || vocab.IsMeasurementType("nope") {
		t.Error("measurement type validation wrong")
	}
	if !vocab.IsWeightUnit("kg") || vocab.IsWeightUnit("stone") {
		t.Error("weight unit validation wrong")
	}
	if !vocab.IsDistanceUnit("km") || vocab.IsDistanceUnit("league") {
		t.Error("distance unit validation wrong")
	}
}
