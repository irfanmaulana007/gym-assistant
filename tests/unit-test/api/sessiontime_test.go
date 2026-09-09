package api_test

import (
	"testing"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/sessiontime"
)

// base is a fixed reference time; tests build event timelines as offsets from it.
var base = time.Date(2026, 9, 9, 10, 0, 0, 0, time.UTC)

func at(sec int) time.Time { return base.Add(time.Duration(sec) * time.Second) }

func TestCompute_NoPauses(t *testing.T) {
	// start@0, complete@600 -> 600s total, all active.
	d := sessiontime.Compute([]sessiontime.Event{
		{Type: "start", At: at(0)},
		{Type: "complete", At: at(600)},
	})
	if sessiontime.Seconds(d.Total) != 600 {
		t.Errorf("total = %d, want 600", sessiontime.Seconds(d.Total))
	}
	if sessiontime.Seconds(d.Active) != 600 {
		t.Errorf("active = %d, want 600", sessiontime.Seconds(d.Active))
	}
	if sessiontime.Seconds(d.Paused) != 0 {
		t.Errorf("paused = %d, want 0", sessiontime.Seconds(d.Paused))
	}
}

func TestCompute_SinglePauseResume(t *testing.T) {
	// active 0-100, paused 100-160 (60s), active 160-300.
	d := sessiontime.Compute([]sessiontime.Event{
		{Type: "start", At: at(0)},
		{Type: "pause", At: at(100)},
		{Type: "resume", At: at(160)},
		{Type: "complete", At: at(300)},
	})
	if got := sessiontime.Seconds(d.Total); got != 300 {
		t.Errorf("total = %d, want 300", got)
	}
	if got := sessiontime.Seconds(d.Active); got != 240 {
		t.Errorf("active = %d, want 240", got)
	}
	if got := sessiontime.Seconds(d.Paused); got != 60 {
		t.Errorf("paused = %d, want 60", got)
	}
}

func TestCompute_MultiplePauseCycles(t *testing.T) {
	// active 0-50, pause 50-80(30), active 80-120, pause 120-150(30), active 150-200.
	d := sessiontime.Compute([]sessiontime.Event{
		{Type: "start", At: at(0)},
		{Type: "pause", At: at(50)},
		{Type: "resume", At: at(80)},
		{Type: "pause", At: at(120)},
		{Type: "resume", At: at(150)},
		{Type: "complete", At: at(200)},
	})
	if got := sessiontime.Seconds(d.Active); got != 140 {
		t.Errorf("active = %d, want 140", got)
	}
	if got := sessiontime.Seconds(d.Paused); got != 60 {
		t.Errorf("paused = %d, want 60", got)
	}
	if got := sessiontime.Seconds(d.Total); got != 200 {
		t.Errorf("total = %d, want 200", got)
	}
	// Invariant: active + paused == total for a well-formed timeline.
	if d.Active+d.Paused != d.Total {
		t.Errorf("active+paused (%v) != total (%v)", d.Active+d.Paused, d.Total)
	}
}

func TestCompute_PauseWithNoResumeBeforeStop(t *testing.T) {
	// active 0-100, pause 100, complete@250 while paused -> 150s paused.
	d := sessiontime.Compute([]sessiontime.Event{
		{Type: "start", At: at(0)},
		{Type: "pause", At: at(100)},
		{Type: "complete", At: at(250)},
	})
	if got := sessiontime.Seconds(d.Active); got != 100 {
		t.Errorf("active = %d, want 100", got)
	}
	if got := sessiontime.Seconds(d.Paused); got != 150 {
		t.Errorf("paused = %d, want 150", got)
	}
}

func TestCompute_ImmediateStop(t *testing.T) {
	d := sessiontime.Compute([]sessiontime.Event{
		{Type: "start", At: at(0)},
		{Type: "complete", At: at(0)},
	})
	if sessiontime.Seconds(d.Total) != 0 || sessiontime.Seconds(d.Active) != 0 || sessiontime.Seconds(d.Paused) != 0 {
		t.Errorf("immediate stop should be all zero, got %+v", d)
	}
}

func TestCompute_DegenerateInput(t *testing.T) {
	if d := sessiontime.Compute(nil); d.Total != 0 {
		t.Error("nil events should give zero durations")
	}
	if d := sessiontime.Compute([]sessiontime.Event{{Type: "start", At: at(0)}}); d.Total != 0 {
		t.Error("single event should give zero durations")
	}
}
