// Package overload derives progressive-overload metrics from logged sets.
// Everything here is pure and computed on read — nothing is stored, so history
// can never drift from the underlying set data (PRD 0001 §6).
package overload

import "time"

// Set is one logged set relevant to progression.
type Set struct {
	SetNumber int
	Weight    float64
	Reps      int
}

// TopSet is the heaviest set of a session (ties broken by higher reps).
type TopSet struct {
	Weight float64
	Reps   int
}

// TotalVolume returns Σ (weight × reps) across the sets.
func TotalVolume(sets []Set) float64 {
	var v float64
	for _, s := range sets {
		v += s.Weight * float64(s.Reps)
	}
	return v
}

// BestSet returns the heaviest set (ties → more reps). ok is false for no sets.
func BestSet(sets []Set) (TopSet, bool) {
	if len(sets) == 0 {
		return TopSet{}, false
	}
	best := sets[0]
	for _, s := range sets[1:] {
		if s.Weight > best.Weight || (s.Weight == best.Weight && s.Reps > best.Reps) {
			best = s
		}
	}
	return TopSet{Weight: best.Weight, Reps: best.Reps}, true
}

// SessionSet is a logged set tagged with the session it belongs to and when
// that session happened — the input for deriving an exercise's "last set to
// beat" surfaced on the routine-detail and active-session screens.
type SessionSet struct {
	SessionID   string
	PerformedAt time.Time
	Weight      float64
	Reps        int
}

// LastTopSet returns the heaviest set (ties → more reps) of the *most recent*
// session among the given sets — the weight the user should aim to beat next
// time. Sessions are ordered by PerformedAt (ties broken by SessionID so the
// choice is deterministic). ok is false when there are no sets.
func LastTopSet(sets []SessionSet) (TopSet, bool) {
	if len(sets) == 0 {
		return TopSet{}, false
	}
	latest := sets[0]
	for _, s := range sets[1:] {
		if s.PerformedAt.After(latest.PerformedAt) ||
			(s.PerformedAt.Equal(latest.PerformedAt) && s.SessionID > latest.SessionID) {
			latest = s
		}
	}
	best, have := TopSet{}, false
	for _, s := range sets {
		if s.SessionID != latest.SessionID {
			continue
		}
		if !have || s.Weight > best.Weight || (s.Weight == best.Weight && s.Reps > best.Reps) {
			best = TopSet{Weight: s.Weight, Reps: s.Reps}
			have = true
		}
	}
	return best, have
}

// Trend describes the direction of a metric across sessions.
type Trend struct {
	Metric    string  `json:"metric"`
	Direction string  `json:"direction"` // "up" | "down" | "flat" | "none"
	Change    float64 `json:"change"`
}

// TrendFromTopWeights compares the most recent top-set weight against the prior
// session's. weights must be in chronological order (oldest first). With fewer
// than two sessions the direction is "none".
func TrendFromTopWeights(weights []float64) Trend {
	t := Trend{Metric: "top_set_weight", Direction: "none"}
	if len(weights) < 2 {
		return t
	}
	latest := weights[len(weights)-1]
	prev := weights[len(weights)-2]
	t.Change = round2(latest - prev)
	switch {
	case latest > prev:
		t.Direction = "up"
	case latest < prev:
		t.Direction = "down"
	default:
		t.Direction = "flat"
	}
	return t
}

// round2 rounds to two decimal places to avoid float noise in API output.
func round2(f float64) float64 {
	// +/-0.005 rounding without importing math for a hot, simple path.
	if f >= 0 {
		return float64(int64(f*100+0.5)) / 100
	}
	return float64(int64(f*100-0.5)) / 100
}
