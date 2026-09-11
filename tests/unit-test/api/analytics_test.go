package api_test

import (
	"testing"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/analytics"
)

func TestToKg(t *testing.T) {
	if got := analytics.ToKg(100, "lb"); got < 45.35 || got > 45.36 {
		t.Errorf("ToKg(100, lb) = %v, want ~45.359", got)
	}
	if got := analytics.ToKg(100, "kg"); got != 100 {
		t.Errorf("ToKg(100, kg) = %v, want 100", got)
	}
	if got := analytics.ToKg(100, ""); got != 100 {
		t.Errorf("ToKg(100, \"\") should default to kg, got %v", got)
	}
}

// TestMixedUnitVolume is the §4.5 guard: an exercise logged in both kg and lb
// must sum to a correct kilogram total, not a nonsense mixed sum.
func TestMixedUnitVolume(t *testing.T) {
	// 100kg x 5 = 500 kg-vol; 100lb x 5 = 45.359237kg x 5 = 226.796185 kg-vol.
	vol := analytics.ToKg(100, "kg")*5 + analytics.ToKg(100, "lb")*5
	want := 500 + 100*0.45359237*5
	if analytics.Round2(vol) != analytics.Round2(want) {
		t.Errorf("mixed-unit volume = %v, want %v", vol, want)
	}
	// The naive (unit-ignoring) sum would be 1000 — prove we are NOT that.
	if analytics.Round2(vol) == 1000 {
		t.Error("mixed-unit volume ignored units (got the nonsense 1000)")
	}
}

func TestEpley1RM(t *testing.T) {
	// 100kg x 5 -> 100 * (1 + 5/30) = 116.666...
	if got := analytics.Round2(analytics.Epley1RM(100, 5)); got != 116.67 {
		t.Errorf("Epley1RM(100,5) = %v, want 116.67", got)
	}
	if got := analytics.Epley1RM(100, 0); got != 0 {
		t.Errorf("Epley1RM with 0 reps = %v, want 0", got)
	}
}

func TestPercentDelta(t *testing.T) {
	if pct, ok := analytics.PercentDelta(120, 100); !ok || pct != 20 {
		t.Errorf("PercentDelta(120,100) = %v ok=%v, want 20 true", pct, ok)
	}
	if pct, ok := analytics.PercentDelta(80, 100); !ok || pct != -20 {
		t.Errorf("PercentDelta(80,100) = %v ok=%v, want -20 true", pct, ok)
	}
	if _, ok := analytics.PercentDelta(50, 0); ok {
		t.Error("PercentDelta with prev=0 should report ok=false")
	}
}

func TestWeekStreaks(t *testing.T) {
	base := time.Date(2026, 3, 2, 12, 0, 0, 0, time.UTC) // a Monday
	wk := func(offsetWeeks int) int {
		return analytics.WeekIndex(base.AddDate(0, 0, offsetWeeks*7))
	}
	current := wk(0)

	t.Run("consecutive weeks ending at current week", func(t *testing.T) {
		weeks := []int{wk(-2), wk(-1), wk(0)}
		cur, longest := analytics.WeekStreaks(weeks, current)
		if cur != 3 || longest != 3 {
			t.Errorf("streaks = (%d,%d), want (3,3)", cur, longest)
		}
	})

	t.Run("a gap breaks the current streak but longest survives", func(t *testing.T) {
		// trained 5,4,3 weeks ago (a 3-run), then this week — the gap at weeks 2,1
		// means the current run is just this week.
		weeks := []int{wk(-5), wk(-4), wk(-3), wk(0)}
		cur, longest := analytics.WeekStreaks(weeks, current)
		if cur != 1 {
			t.Errorf("current = %d, want 1 (gap resets it)", cur)
		}
		if longest != 3 {
			t.Errorf("longest = %d, want 3", longest)
		}
	})

	t.Run("last week counts as still-live; two weeks ago does not", func(t *testing.T) {
		if cur, _ := analytics.WeekStreaks([]int{wk(-1)}, current); cur != 1 {
			t.Errorf("current with last-week-only = %d, want 1", cur)
		}
		if cur, _ := analytics.WeekStreaks([]int{wk(-2)}, current); cur != 0 {
			t.Errorf("current with only-two-weeks-ago = %d, want 0", cur)
		}
	})

	t.Run("empty", func(t *testing.T) {
		if cur, longest := analytics.WeekStreaks(nil, current); cur != 0 || longest != 0 {
			t.Errorf("empty streaks = (%d,%d), want (0,0)", cur, longest)
		}
	})
}

func TestIsUndertrained(t *testing.T) {
	// chest landmark is 10 sets/week.
	if !analytics.IsUndertrained("chest", 6, 1) {
		t.Error("chest with 6 sets in 1 week should be undertrained")
	}
	if analytics.IsUndertrained("chest", 12, 1) {
		t.Error("chest with 12 sets in 1 week should not be undertrained")
	}
	// Over a 4-week window, 24 sets = 6/week < 10 -> undertrained.
	if !analytics.IsUndertrained("chest", 24, 4) {
		t.Error("chest 24 sets / 4 weeks (6/wk) should be undertrained")
	}
	// Non-target groups are never undertrained.
	if analytics.IsUndertrained("cardio", 0, 1) {
		t.Error("cardio should never be undertrained")
	}
}

func TestIsStalled(t *testing.T) {
	// Increasing then no new high over last 3 -> not stalled if a PR is within.
	if analytics.IsStalled([]float64{60, 62.5, 65}, 3) {
		t.Error("progressing series should not be stalled")
	}
	// Flat over last 3 -> stalled.
	if !analytics.IsStalled([]float64{60, 60, 60}, 3) {
		t.Error("flat series should be stalled")
	}
	// Went up 4 sessions ago, flat since: last 3 have no increase over baseline.
	if !analytics.IsStalled([]float64{50, 65, 65, 65}, 3) {
		t.Error("no increase over the last 3 should be stalled")
	}
	// Fewer than n sessions -> not enough data.
	if analytics.IsStalled([]float64{60, 62.5}, 3) {
		t.Error("fewer than n sessions cannot be stalled")
	}
}

func TestResolveWindow(t *testing.T) {
	loc := time.UTC
	now := time.Date(2026, 3, 18, 15, 0, 0, 0, loc) // a Wednesday

	t.Run("unknown window errors", func(t *testing.T) {
		if _, err := analytics.ResolveWindow("decade", now, loc); err == nil {
			t.Error("expected error for unknown window")
		}
	})

	t.Run("empty defaults to month", func(t *testing.T) {
		w, err := analytics.ResolveWindow("", now, loc)
		if err != nil {
			t.Fatal(err)
		}
		if w.Key != "month" || w.From.Day() != 1 || int(w.From.Month()) != 3 {
			t.Errorf("default window = %+v, want current month", w)
		}
	})

	t.Run("week is Monday-aligned and 7 days", func(t *testing.T) {
		w, err := analytics.ResolveWindow("week", now, loc)
		if err != nil {
			t.Fatal(err)
		}
		if w.From.Weekday() != time.Monday {
			t.Errorf("week From weekday = %v, want Monday", w.From.Weekday())
		}
		if w.To.Sub(w.From) != 7*24*time.Hour {
			t.Errorf("week span = %v, want 168h", w.To.Sub(w.From))
		}
		if !w.HasPrev || w.PrevTo != w.From {
			t.Errorf("week prev window misaligned: %+v", w)
		}
	})

	t.Run("month prev window is the previous calendar month", func(t *testing.T) {
		w, _ := analytics.ResolveWindow("month", now, loc)
		if int(w.PrevFrom.Month()) != 2 || w.PrevTo != w.From {
			t.Errorf("month prev = [%v,%v), want February..March", w.PrevFrom, w.PrevTo)
		}
	})

	t.Run("all has no prev and month buckets", func(t *testing.T) {
		w, _ := analytics.ResolveWindow("all", now, loc)
		if w.HasPrev {
			t.Error("all window should have no previous window")
		}
		if w.Bucket != "month" {
			t.Errorf("all bucket = %q, want month", w.Bucket)
		}
	})

	t.Run("tz shifts the day boundary", func(t *testing.T) {
		jkt, err := time.LoadLocation("Asia/Jakarta")
		if err != nil {
			t.Skip("tz database unavailable")
		}
		// Late UTC evening is already the next calendar day in Jakarta (+7).
		lateUTC := time.Date(2026, 3, 18, 20, 0, 0, 0, time.UTC)
		w, _ := analytics.ResolveWindow("week", lateUTC, jkt)
		if w.From.Location().String() != "Asia/Jakarta" {
			t.Errorf("window not resolved in tz: %v", w.From.Location())
		}
	})
}

func TestWindowWeeks(t *testing.T) {
	loc := time.UTC
	now := time.Date(2026, 3, 18, 15, 0, 0, 0, loc)
	w, _ := analytics.ResolveWindow("week", now, loc)
	if w.Weeks() != 1 {
		t.Errorf("week window Weeks() = %d, want 1", w.Weeks())
	}
	q, _ := analytics.ResolveWindow("quarter", now, loc)
	if q.Weeks() < 12 || q.Weeks() > 14 {
		t.Errorf("quarter window Weeks() = %d, want ~13", q.Weeks())
	}
}
