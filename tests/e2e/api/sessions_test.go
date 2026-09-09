package api

import (
	"net/http"
	"testing"
)

// addExercise creates an exercise in a routine and returns its id.
func (h *harness) addExercise(t *testing.T, token, routineID string, body map[string]any) string {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/routines/"+routineID+"/exercises", token, body)
	if resp.Status != http.StatusCreated {
		t.Fatalf("add exercise: status %d body %s", resp.Status, resp.Body)
	}
	var out struct {
		ID string `json:"id"`
	}
	resp.decode(t, &out)
	return out.ID
}

// TestSessionLifecycle_E2E exercises the full PRD 0002 flow: start (snapshots a
// checklist) → pause/resume → log a weight set and a duration bout → check off
// an exercise → add an ad-hoc exercise → complete, and asserts the persisted
// durations, aggregates, and muscle groups.
func TestSessionLifecycle_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "session@example.com", "supersecret1", "Sess")
	routine := h.createRoutine(t, token, "Push", "")
	h.addExercise(t, token, routine, map[string]any{
		"name": "Bench Press", "measurement_type": "weight_reps",
		"target_sets": 3, "target_reps": 8, "primary_muscle_group": "chest",
		"secondary_muscle_groups": []string{"triceps"},
	})
	h.addExercise(t, token, routine, map[string]any{
		"name": "Plank", "measurement_type": "duration",
		"target_duration_seconds": 60, "primary_muscle_group": "core",
	})

	// Start.
	startResp := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil)
	if startResp.Status != http.StatusCreated {
		t.Fatalf("start status %d body %s", startResp.Status, startResp.Body)
	}
	var session struct {
		ID        string                  `json:"id"`
		Status    string                  `json:"status"`
		Events    []struct{ Type string } `json:"events"`
		Exercises []struct {
			ID              string `json:"id"`
			NameSnapshot    string `json:"name_snapshot"`
			MeasurementType string `json:"measurement_type"`
			Status          string `json:"status"`
		} `json:"exercises"`
	}
	startResp.decode(t, &session)
	if session.Status != "active" {
		t.Fatalf("status = %q, want active", session.Status)
	}
	if len(session.Exercises) != 2 {
		t.Fatalf("checklist = %d items, want 2", len(session.Exercises))
	}
	if len(session.Events) != 1 || session.Events[0].Type != "start" {
		t.Fatalf("events = %+v, want one start", session.Events)
	}
	benchSX := session.Exercises[0].ID
	plankSX := session.Exercises[1].ID

	// One active session at a time -> starting another is a conflict.
	dup := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil)
	if dup.Status != http.StatusConflict {
		t.Fatalf("second start status %d, want 409", dup.Status)
	}

	// Pause then resume.
	if r := h.do(t, http.MethodPost, "/api/v1/sessions/"+session.ID+"/pause", token, nil); r.Status != http.StatusOK {
		t.Fatalf("pause status %d", r.Status)
	}
	if r := h.do(t, http.MethodPost, "/api/v1/sessions/"+session.ID+"/resume", token, nil); r.Status != http.StatusOK {
		t.Fatalf("resume status %d", r.Status)
	}

	// Log a weight set on Bench (60kg x 8 -> volume 480).
	if r := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+benchSX+"/entries", token, map[string]any{
		"weight": 60, "reps": 8,
	}); r.Status != http.StatusCreated {
		t.Fatalf("log bench entry status %d body %s", r.Status, r.Body)
	}
	// Log a duration bout on Plank.
	if r := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+plankSX+"/entries", token, map[string]any{
		"duration_seconds": 60,
	}); r.Status != http.StatusCreated {
		t.Fatalf("log plank entry status %d body %s", r.Status, r.Body)
	}

	// Check off Bench.
	if r := h.do(t, http.MethodPatch, "/api/v1/session-exercises/"+benchSX, token, map[string]any{
		"status": "completed",
	}); r.Status != http.StatusOK {
		t.Fatalf("check off bench status %d body %s", r.Status, r.Body)
	}

	// Add an ad-hoc cardio exercise.
	adhoc := h.do(t, http.MethodPost, "/api/v1/sessions/"+session.ID+"/exercises", token, map[string]any{
		"name": "Incline Walk", "measurement_type": "duration",
		"target_duration_seconds": 1800, "primary_muscle_group": "cardio",
	})
	if adhoc.Status != http.StatusCreated {
		t.Fatalf("add ad-hoc status %d body %s", adhoc.Status, adhoc.Body)
	}

	// Complete.
	completeResp := h.do(t, http.MethodPost, "/api/v1/sessions/"+session.ID+"/complete", token, nil)
	if completeResp.Status != http.StatusOK {
		t.Fatalf("complete status %d body %s", completeResp.Status, completeResp.Body)
	}
	var done struct {
		Status                string   `json:"status"`
		EndedAt               *string  `json:"ended_at"`
		TotalDurationSeconds  *int     `json:"total_duration_seconds"`
		ActiveDurationSeconds *int     `json:"active_duration_seconds"`
		PausedDurationSeconds *int     `json:"paused_duration_seconds"`
		MuscleGroups          []string `json:"muscle_groups"`
		Exercises             []struct {
			NameSnapshot  string   `json:"name_snapshot"`
			Status        string   `json:"status"`
			SetsCompleted int      `json:"sets_completed"`
			TotalVolume   *float64 `json:"total_volume"`
			TopSetWeight  *float64 `json:"top_set_weight"`
		} `json:"exercises"`
	}
	completeResp.decode(t, &done)

	if done.Status != "completed" {
		t.Errorf("status = %q, want completed", done.Status)
	}
	if done.EndedAt == nil || done.TotalDurationSeconds == nil || done.ActiveDurationSeconds == nil || done.PausedDurationSeconds == nil {
		t.Errorf("durations/ended_at not persisted: %+v", done)
	}
	// Muscle groups aggregated from all exercises (incl. secondary + ad-hoc).
	assertContains(t, done.MuscleGroups, "chest")
	assertContains(t, done.MuscleGroups, "triceps")
	assertContains(t, done.MuscleGroups, "core")
	assertContains(t, done.MuscleGroups, "cardio")

	// Bench aggregates: 1 set, volume 480, top set 60.
	var bench *struct {
		NameSnapshot  string
		Status        string
		SetsCompleted int
		TotalVolume   *float64
		TopSetWeight  *float64
	}
	for _, e := range done.Exercises {
		if e.NameSnapshot == "Bench Press" {
			bench = &struct {
				NameSnapshot  string
				Status        string
				SetsCompleted int
				TotalVolume   *float64
				TopSetWeight  *float64
			}{e.NameSnapshot, e.Status, e.SetsCompleted, e.TotalVolume, e.TopSetWeight}
		}
	}
	if bench == nil {
		t.Fatal("Bench Press not found in completed session")
	}
	if bench.Status != "completed" {
		t.Errorf("bench status = %q, want completed", bench.Status)
	}
	if bench.SetsCompleted != 1 {
		t.Errorf("bench sets_completed = %d, want 1", bench.SetsCompleted)
	}
	if bench.TotalVolume == nil || *bench.TotalVolume != 480 {
		t.Errorf("bench total_volume = %v, want 480", bench.TotalVolume)
	}
	if bench.TopSetWeight == nil || *bench.TopSetWeight != 60 {
		t.Errorf("bench top_set_weight = %v, want 60", bench.TopSetWeight)
	}

	// Completing again is a conflict.
	if r := h.do(t, http.MethodPost, "/api/v1/sessions/"+session.ID+"/complete", token, nil); r.Status != http.StatusConflict {
		t.Errorf("re-complete status %d, want 409", r.Status)
	}

	// After completion, a new session can be started.
	if r := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil); r.Status != http.StatusCreated {
		t.Errorf("start after completion status %d, want 201", r.Status)
	}
}

func TestSession_CrossUserIsolation_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	tokenA := h.registerUser(t, "sa@example.com", "supersecret1", "SA")
	tokenB := h.registerUser(t, "sb@example.com", "supersecret1", "SB")
	routineA := h.createRoutine(t, tokenA, "A Push", "")
	h.addExercise(t, tokenA, routineA, map[string]any{"name": "Bench", "primary_muscle_group": "chest"})

	start := h.do(t, http.MethodPost, "/api/v1/routines/"+routineA+"/sessions", tokenA, nil)
	var sess struct {
		ID string `json:"id"`
	}
	start.decode(t, &sess)

	// B cannot read or mutate A's session.
	if r := h.do(t, http.MethodGet, "/api/v1/sessions/"+sess.ID, tokenB, nil); r.Status != http.StatusNotFound {
		t.Errorf("B GET A's session: status %d, want 404", r.Status)
	}
	if r := h.do(t, http.MethodPost, "/api/v1/sessions/"+sess.ID+"/complete", tokenB, nil); r.Status != http.StatusNotFound {
		t.Errorf("B completing A's session: status %d, want 404", r.Status)
	}

	// B's session list is empty.
	list := h.do(t, http.MethodGet, "/api/v1/sessions", tokenB, nil)
	var out struct {
		Sessions []any `json:"sessions"`
	}
	list.decode(t, &out)
	if len(out.Sessions) != 0 {
		t.Errorf("B sees %d sessions, want 0", len(out.Sessions))
	}
}

func assertContains(t *testing.T, haystack []string, want string) {
	t.Helper()
	for _, s := range haystack {
		if s == want {
			return
		}
	}
	t.Errorf("expected %q in %v", want, haystack)
}
