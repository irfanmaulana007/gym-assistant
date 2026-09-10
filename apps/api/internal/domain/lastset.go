package domain

import "time"

// LastSet is the heaviest set from the most recent prior session in which an
// exercise was performed with a weight — the "weight to beat" surfaced on the
// routine-detail and active-session screens so the user knows what to load.
// Derived on read from set_entries, never stored (PRD 0001 §6).
type LastSet struct {
	Weight      float64   `json:"weight"`
	WeightUnit  string    `json:"weight_unit"`
	Reps        int       `json:"reps"`
	PerformedAt time.Time `json:"performed_at"`
}
