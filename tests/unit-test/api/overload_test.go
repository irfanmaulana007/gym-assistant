package api_test

import (
	"testing"

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
