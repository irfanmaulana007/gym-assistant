// Package analytics holds the pure, dependency-light derivations behind the
// analytics dashboard (PRD 0007): weight-unit normalization, Epley estimated
// 1RM, weekly streaks from a set of dates, undertrained-muscle landmarks, the
// stall rule, and window → [from, to) resolution.
//
// Keeping these as pure functions (mirroring pkg/overload and pkg/catalog) lets
// the repository/service reuse one rule and the separate test module — which
// cannot import internal/ — unit-test them directly.
package analytics

import (
	"errors"
	"sort"
	"time"
)

// lbToKg is the exact avoirdupois-pound to kilogram factor. Volume/PR math must
// normalize to one unit before summing (PRD §4.5) or mixed-unit rows produce
// nonsense totals.
const lbToKg = 0.45359237

// KgUnit is the display unit the dashboard aggregates in for Phase 1.
const KgUnit = "kg"

// ToKg converts a weight to kilograms given its per-row unit. An empty or
// unrecognized unit is treated as kg (the API's COALESCE default).
func ToKg(weight float64, unit string) float64 {
	if unit == "lb" {
		return weight * lbToKg
	}
	return weight
}

// Epley1RM estimates a one-rep max from a set using the Epley formula
// (PRD §4.1): weight × (1 + reps/30). A non-positive rep count yields 0.
func Epley1RM(weight float64, reps int) float64 {
	if reps <= 0 {
		return 0
	}
	return weight * (1 + float64(reps)/30)
}

// Round2 rounds to two decimals to keep float noise out of API output.
func Round2(f float64) float64 {
	if f >= 0 {
		return float64(int64(f*100+0.5)) / 100
	}
	return float64(int64(f*100-0.5)) / 100
}

// PercentDelta returns the signed percentage change from prev to cur, rounded to
// two decimals. ok is false when prev is 0 (percentage undefined) — callers show
// the raw value or a "new" badge instead of a bogus ∞%.
func PercentDelta(cur, prev float64) (pct float64, ok bool) {
	if prev == 0 {
		return 0, false
	}
	return Round2((cur - prev) / prev * 100), true
}

// --- weekly streaks ---

// MondayOf returns local midnight of the Monday that starts t's week.
func MondayOf(t time.Time) time.Time {
	y, m, d := t.Date()
	base := time.Date(y, m, d, 0, 0, 0, 0, t.Location())
	offset := (int(base.Weekday()) + 6) % 7 // Go weeks start Sunday; shift to Monday=0
	return base.AddDate(0, 0, -offset)
}

// WeekIndex maps t to a monotonic week ordinal (consecutive weeks differ by 1),
// aligned to Monday, so streak math is plain integer arithmetic.
func WeekIndex(t time.Time) int {
	monday := MondayOf(t)
	return int(monday.Unix() / 86400 / 7)
}

// WeekStreaks computes the current and longest run of consecutive training weeks
// from the week ordinals of completed sessions. The current streak counts back
// from the most recent trained week and is only "live" when that week is the
// current week or the one just before it (a rest week in progress doesn't break
// it, but a fully missed week does).
func WeekStreaks(weeks []int, currentWeek int) (current, longest int) {
	if len(weeks) == 0 {
		return 0, 0
	}
	set := map[int]bool{}
	for _, w := range weeks {
		set[w] = true
	}
	distinct := make([]int, 0, len(set))
	for w := range set {
		distinct = append(distinct, w)
	}
	sort.Ints(distinct)

	longest, run := 1, 1
	for i := 1; i < len(distinct); i++ {
		if distinct[i] == distinct[i-1]+1 {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	latest := distinct[len(distinct)-1]
	if latest < currentWeek-1 {
		return 0, longest // most recent training was too long ago
	}
	current = 0
	for w := latest; set[w]; w-- {
		current++
	}
	return current, longest
}

// --- muscle-group balance ---

// weeklySetsLandmark is the default minimum weekly working-sets target per
// primary muscle group (PRD §4.3, Open Q2). Groups mapped to 0 are never flagged
// undertrained (they aren't standard hypertrophy targets).
var weeklySetsLandmark = map[string]int{
	"chest": 10, "back": 10, "shoulders": 10,
	"quads": 10, "hamstrings": 10, "glutes": 10,
	"biceps": 6, "triceps": 6, "calves": 6, "core": 6, "forearms": 6,
	"full_body": 0, "cardio": 0, "other": 0,
}

// WeeklySetsLandmark returns the default weekly-sets target for a group (0 when
// the group isn't a tracked target).
func WeeklySetsLandmark(group string) int {
	return weeklySetsLandmark[group]
}

// IsUndertrained reports whether the sets logged for a group over the window
// fall below its weekly landmark, normalized to a per-week rate. Groups with a
// 0 landmark are never undertrained.
func IsUndertrained(group string, sets, weeks int) bool {
	lm := WeeklySetsLandmark(group)
	if lm == 0 {
		return false
	}
	if weeks < 1 {
		weeks = 1
	}
	return float64(sets)/float64(weeks) < float64(lm)
}

// --- stall detection ---

// IsStalled reports whether an exercise has stalled: it has at least n recorded
// sessions and no top-set weight in the last n sessions beats the weight n
// sessions ago (PRD §4.1, default n=3). topWeights must be chronological (oldest
// first).
func IsStalled(topWeights []float64, n int) bool {
	if n < 1 || len(topWeights) < n {
		return false
	}
	baseline := topWeights[len(topWeights)-n]
	for _, w := range topWeights[len(topWeights)-n+1:] {
		if w > baseline {
			return false
		}
	}
	return true
}

// --- window resolution ---

// ErrUnknownWindow is returned by ResolveWindow for an unrecognized window key.
var ErrUnknownWindow = errors.New("unknown window")

// Window is a resolved [From, To) range plus the equal-length previous window
// used for deltas, and the default bucket granularity for its time-series.
type Window struct {
	Key      string    `json:"key"`
	From     time.Time `json:"from"`
	To       time.Time `json:"to"`
	PrevFrom time.Time `json:"-"`
	PrevTo   time.Time `json:"-"`
	HasPrev  bool      `json:"-"`
	Bucket   string    `json:"bucket"` // "week" | "month"
}

// Weeks returns the number of whole (or partial) weeks the window spans, used to
// turn window totals into per-week rates for the undertrained landmark. Always
// at least 1.
func (w Window) Weeks() int {
	days := int(w.To.Sub(w.From).Hours()/24 + 0.5)
	weeks := (days + 6) / 7
	if weeks < 1 {
		return 1
	}
	return weeks
}

// ResolveWindow turns a window key into a concrete range against now in loc.
// "week"/"month" mean the current calendar week (Monday-start)/month; "quarter"
// and "year" are the trailing 3/12 months ending today; "all" is everything up
// to end of today. An empty key defaults to "month". The range is resolved
// server-side so a client clock can't skew buckets (PRD §5.1).
func ResolveWindow(key string, now time.Time, loc *time.Location) (Window, error) {
	if loc == nil {
		loc = time.UTC
	}
	now = now.In(loc)
	if key == "" {
		key = "month"
	}
	// End boundary is the start of tomorrow so today's sessions are included.
	y, m, d := now.Date()
	startOfToday := time.Date(y, m, d, 0, 0, 0, 0, loc)
	endExclusive := startOfToday.AddDate(0, 0, 1)

	w := Window{Key: key, To: endExclusive, HasPrev: true, Bucket: "week"}
	switch key {
	case "week":
		w.From = MondayOf(now)
		w.To = w.From.AddDate(0, 0, 7)
		w.PrevFrom = w.From.AddDate(0, 0, -7)
		w.PrevTo = w.From
	case "month":
		w.From = time.Date(y, m, 1, 0, 0, 0, 0, loc)
		w.To = w.From.AddDate(0, 1, 0)
		w.PrevFrom = w.From.AddDate(0, -1, 0)
		w.PrevTo = w.From
	case "quarter":
		w.From = endExclusive.AddDate(0, -3, 0)
		w.PrevFrom = w.From.AddDate(0, -3, 0)
		w.PrevTo = w.From
	case "year":
		w.From = endExclusive.AddDate(-1, 0, 0)
		w.PrevFrom = w.From.AddDate(-1, 0, 0)
		w.PrevTo = w.From
		w.Bucket = "month"
	case "all":
		w.From = time.Date(1970, 1, 1, 0, 0, 0, 0, loc)
		w.HasPrev = false
		w.Bucket = "month"
	default:
		return Window{}, ErrUnknownWindow
	}
	return w, nil
}
