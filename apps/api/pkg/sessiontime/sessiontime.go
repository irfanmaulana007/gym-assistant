// Package sessiontime derives workout durations from the append-only session
// event timeline (PRD 0002 §5.3). The event log is the source of truth; these
// pure functions compute total / active / paused time so the values persisted
// on Stop never have to be replayed by readers.
package sessiontime

import "time"

// Event is one lifecycle transition. Types: "start", "pause", "resume",
// "complete", "abandon".
type Event struct {
	Type string
	At   time.Time
}

// Durations is the computed breakdown of a session's time.
//
//	Total  = last event time − first event time (wall clock)
//	Active = time spent in the active state (working)
//	Paused = time spent in the paused state (resting)
//
// For a well-formed timeline, Active + Paused == Total.
type Durations struct {
	Total  time.Duration
	Active time.Duration
	Paused time.Duration
}

// Compute derives durations from a chronologically ordered event slice. The
// first event is expected to be "start" and the last a terminal event
// ("complete"/"abandon") or, for a live session, a synthetic "now" marker the
// caller appends. It is robust to a pause with no resume before stop and to an
// immediate stop.
func Compute(events []Event) Durations {
	if len(events) < 2 {
		return Durations{}
	}

	start := events[0].At
	end := events[len(events)-1].At

	var active, paused time.Duration
	// State entered after the previous event. After "start", we are active.
	activeState := true
	prev := events[0].At

	for i := 1; i < len(events); i++ {
		e := events[i]
		dt := e.At.Sub(prev)
		if dt < 0 {
			dt = 0 // guard against out-of-order/clock skew
		}
		if activeState {
			active += dt
		} else {
			paused += dt
		}
		switch e.Type {
		case "pause":
			activeState = false
		case "resume", "start":
			activeState = true
		case "complete", "abandon":
			// terminal; the interval up to it has been accounted for
		}
		prev = e.At
	}

	total := end.Sub(start)
	if total < 0 {
		total = 0
	}
	return Durations{Total: total, Active: active, Paused: paused}
}

// Seconds returns d rounded to whole seconds.
func Seconds(d time.Duration) int {
	return int(d.Round(time.Second) / time.Second)
}
