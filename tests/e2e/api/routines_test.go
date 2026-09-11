package api

import (
	"context"
	"net/http"
	"testing"
)

// TestRoutineAndExerciseCRUD_E2E covers the routine + exercise lifecycle over
// real HTTP against a real database.
func TestRoutineAndExerciseCRUD_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "lifter@example.com", "supersecret1", "Lifter")

	// Create two routines.
	push := h.createRoutine(t, token, "Push Day", "chest/shoulders/tris")
	pull := h.createRoutine(t, token, "Pull Day", "")

	// List returns both, ordered by position (creation order).
	listResp := h.do(t, http.MethodGet, "/api/v1/routines", token, nil)
	if listResp.Status != http.StatusOK {
		t.Fatalf("list status %d", listResp.Status)
	}
	var list struct {
		Routines []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Position int    `json:"position"`
		} `json:"routines"`
	}
	listResp.decode(t, &list)
	if len(list.Routines) != 2 {
		t.Fatalf("got %d routines, want 2", len(list.Routines))
	}
	if list.Routines[0].Name != "Push Day" || list.Routines[1].Name != "Pull Day" {
		t.Errorf("unexpected order: %v", list.Routines)
	}

	// Reorder: pull first.
	reorder := h.do(t, http.MethodPatch, "/api/v1/routines/reorder", token, map[string]any{
		"ids": []string{pull, push},
	})
	if reorder.Status != http.StatusOK {
		t.Fatalf("reorder status %d body %s", reorder.Status, reorder.Body)
	}
	reorder.decode(t, &list)
	if list.Routines[0].ID != pull {
		t.Errorf("after reorder first routine = %s, want %s", list.Routines[0].ID, pull)
	}

	// Add a weight_reps exercise to Push Day.
	exResp := h.do(t, http.MethodPost, "/api/v1/routines/"+push+"/exercises", token, map[string]any{
		"name":                    "Bench Press",
		"measurement_type":        "weight_reps",
		"target_sets":             4,
		"target_reps":             8,
		"target_weight":           60,
		"primary_muscle_group":    "chest",
		"secondary_muscle_groups": []string{"triceps", "shoulders"},
		"default_metadata":        map[string]any{"grip": "medium"},
	})
	if exResp.Status != http.StatusCreated {
		t.Fatalf("create exercise status %d body %s", exResp.Status, exResp.Body)
	}
	var ex struct {
		ID                    string   `json:"id"`
		Name                  string   `json:"name"`
		MeasurementType       string   `json:"measurement_type"`
		SecondaryMuscleGroups []string `json:"secondary_muscle_groups"`
		TargetSets            *int     `json:"target_sets"`
	}
	exResp.decode(t, &ex)
	if ex.Name != "Bench Press" || ex.MeasurementType != "weight_reps" {
		t.Errorf("unexpected exercise: %+v", ex)
	}
	if len(ex.SecondaryMuscleGroups) != 2 {
		t.Errorf("secondary groups = %v, want 2", ex.SecondaryMuscleGroups)
	}
	if ex.TargetSets == nil || *ex.TargetSets != 4 {
		t.Errorf("target_sets = %v, want 4", ex.TargetSets)
	}

	// Add a duration exercise (PRD 0002 exercise type).
	walkResp := h.do(t, http.MethodPost, "/api/v1/routines/"+push+"/exercises", token, map[string]any{
		"name":                    "Incline Walk",
		"measurement_type":        "duration",
		"target_duration_seconds": 1800,
		"primary_muscle_group":    "cardio",
		"default_metadata":        map[string]any{"incline": 6, "speed": 5.5},
	})
	if walkResp.Status != http.StatusCreated {
		t.Fatalf("create duration exercise status %d body %s", walkResp.Status, walkResp.Body)
	}

	// Get routine detail includes both exercises in order.
	getResp := h.do(t, http.MethodGet, "/api/v1/routines/"+push, token, nil)
	var detail struct {
		Exercises []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"exercises"`
	}
	getResp.decode(t, &detail)
	if len(detail.Exercises) != 2 {
		t.Fatalf("routine detail exercises = %d, want 2", len(detail.Exercises))
	}

	// Update the exercise.
	updResp := h.do(t, http.MethodPatch, "/api/v1/exercises/"+ex.ID, token, map[string]any{
		"target_reps": 10,
		"notes":       "focus on tempo",
	})
	if updResp.Status != http.StatusOK {
		t.Fatalf("update exercise status %d body %s", updResp.Status, updResp.Body)
	}

	// Delete the duration exercise.
	delResp := h.do(t, http.MethodDelete, "/api/v1/exercises/"+detail.Exercises[1].ID, token, nil)
	if delResp.Status != http.StatusNoContent {
		t.Fatalf("delete exercise status %d", delResp.Status)
	}

	// Delete a routine.
	delRoutine := h.do(t, http.MethodDelete, "/api/v1/routines/"+pull, token, nil)
	if delRoutine.Status != http.StatusNoContent {
		t.Fatalf("delete routine status %d", delRoutine.Status)
	}
}

// TestExerciseList_SortedByMuscleGroupThenName_E2E proves the routine detail
// returns exercises sorted by primary muscle group ASC, then name ASC —
// independent of insertion order — over real HTTP against a real database.
func TestExerciseList_SortedByMuscleGroupThenName_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "sorter@example.com", "supersecret1", "Sorter")
	routine := h.createRoutine(t, token, "Full Body", "")

	// Inserted in an order that matches neither the target sort nor reverse of
	// it, so passing can only mean the sort actually ran.
	inserts := []struct{ name, muscle string }{
		{"Overhead Press", "shoulders"},
		{"Incline Press", "chest"},
		{"Pull Up", "back"},
		{"Bench Press", "chest"},
		{"Deadlift", "back"},
	}
	for _, in := range inserts {
		resp := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
			"name":                 in.name,
			"measurement_type":     "weight_reps",
			"target_sets":          3,
			"target_reps":          10,
			"primary_muscle_group": in.muscle,
		})
		if resp.Status != http.StatusCreated {
			t.Fatalf("create %q status %d body %s", in.name, resp.Status, resp.Body)
		}
	}

	getResp := h.do(t, http.MethodGet, "/api/v1/routines/"+routine, token, nil)
	if getResp.Status != http.StatusOK {
		t.Fatalf("get routine status %d body %s", getResp.Status, getResp.Body)
	}
	var detail struct {
		Exercises []struct {
			Name               string `json:"name"`
			PrimaryMuscleGroup string `json:"primary_muscle_group"`
		} `json:"exercises"`
	}
	getResp.decode(t, &detail)

	type row struct{ muscle, name string }
	got := make([]row, len(detail.Exercises))
	for i, e := range detail.Exercises {
		got[i] = row{e.PrimaryMuscleGroup, e.Name}
	}
	want := []row{
		{"back", "Deadlift"},
		{"back", "Pull Up"},
		{"chest", "Bench Press"},
		{"chest", "Incline Press"},
		{"shoulders", "Overhead Press"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d exercises, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("position %d = %+v, want %+v (full: %+v)", i, got[i], want[i], got)
		}
	}
}

func TestRoutine_CrossUserIsolation_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	tokenA := h.registerUser(t, "a@example.com", "supersecret1", "A")
	tokenB := h.registerUser(t, "b@example.com", "supersecret1", "B")

	routineA := h.createRoutine(t, tokenA, "A's Push", "")

	// B cannot read A's routine.
	resp := h.do(t, http.MethodGet, "/api/v1/routines/"+routineA, tokenB, nil)
	if resp.Status != http.StatusNotFound {
		t.Fatalf("B reading A's routine: status %d, want 404", resp.Status)
	}

	// B cannot add an exercise to A's routine.
	resp = h.do(t, http.MethodPost, "/api/v1/routines/"+routineA+"/exercises", tokenB, map[string]any{
		"name": "Sneaky", "primary_muscle_group": "chest",
	})
	if resp.Status != http.StatusNotFound {
		t.Fatalf("B adding exercise to A's routine: status %d, want 404", resp.Status)
	}

	// B's routine list is empty.
	list := h.do(t, http.MethodGet, "/api/v1/routines", tokenB, nil)
	var out struct {
		Routines []any `json:"routines"`
	}
	list.decode(t, &out)
	if len(out.Routines) != 0 {
		t.Errorf("B sees %d routines, want 0", len(out.Routines))
	}
}

func TestExercise_ValidationErrors_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "val@example.com", "supersecret1", "Val")
	routine := h.createRoutine(t, token, "Day", "")

	// Missing name.
	resp := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
		"primary_muscle_group": "chest",
	})
	if resp.Status != http.StatusUnprocessableEntity {
		t.Errorf("missing name: status %d, want 422", resp.Status)
	}

	// Bad muscle group.
	resp = h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
		"name": "X", "primary_muscle_group": "eyebrows",
	})
	if resp.Status != http.StatusUnprocessableEntity {
		t.Errorf("bad muscle group: status %d, want 422", resp.Status)
	}

	// Bad measurement type.
	resp = h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
		"name": "X", "measurement_type": "vibes",
	})
	if resp.Status != http.StatusUnprocessableEntity {
		t.Errorf("bad measurement type: status %d, want 422", resp.Status)
	}
}

// TestExerciseHistory_E2E seeds logged sets directly and verifies the derived
// progression (top set, volume, trend) from the history endpoint.
func TestExerciseHistory_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "hist@example.com", "supersecret1", "Hist")
	routine := h.createRoutine(t, token, "Push", "")

	exResp := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
		"name": "Bench Press", "measurement_type": "weight_reps",
		"target_sets": 3, "target_reps": 8, "primary_muscle_group": "chest",
	})
	var ex struct {
		ID string `json:"id"`
	}
	exResp.decode(t, &ex)

	// New exercise: history is well-formed and empty, trend "none".
	histResp := h.do(t, http.MethodGet, "/api/v1/exercises/"+ex.ID+"/history", token, nil)
	if histResp.Status != http.StatusOK {
		t.Fatalf("history status %d body %s", histResp.Status, histResp.Body)
	}
	var empty struct {
		Sessions []any `json:"sessions"`
		Trend    struct {
			Direction string `json:"direction"`
		} `json:"trend"`
	}
	histResp.decode(t, &empty)
	if len(empty.Sessions) != 0 || empty.Trend.Direction != "none" {
		t.Fatalf("empty history unexpected: %+v", empty)
	}

	// Seed two sessions of logged sets: session 1 top 60kg, session 2 top 62.5kg.
	seedSession(t, h, "hist@example.com", ex.ID, "2026-09-01T09:00:00Z", []seedSet{{1, 57.5, 8}, {2, 60, 8}})
	seedSession(t, h, "hist@example.com", ex.ID, "2026-09-08T09:00:00Z", []seedSet{{1, 60, 8}, {2, 62.5, 8}})

	histResp = h.do(t, http.MethodGet, "/api/v1/exercises/"+ex.ID+"/history", token, nil)
	var hist struct {
		Sessions []struct {
			TopSet struct {
				Weight     float64 `json:"weight"`
				WeightUnit string  `json:"weight_unit"`
				Reps       int     `json:"reps"`
			} `json:"top_set"`
			TotalVolume float64 `json:"total_volume"`
		} `json:"sessions"`
		Trend struct {
			Direction string  `json:"direction"`
			Change    float64 `json:"change"`
		} `json:"trend"`
	}
	histResp.decode(t, &hist)

	if len(hist.Sessions) != 2 {
		t.Fatalf("history sessions = %d, want 2; body %s", len(hist.Sessions), histResp.Body)
	}
	// Oldest first.
	if hist.Sessions[0].TopSet.Weight != 60 {
		t.Errorf("session1 top set = %v, want 60", hist.Sessions[0].TopSet.Weight)
	}
	if hist.Sessions[0].TotalVolume != 57.5*8+60*8 {
		t.Errorf("session1 volume = %v, want %v", hist.Sessions[0].TotalVolume, 57.5*8+60*8)
	}
	if hist.Sessions[1].TopSet.Weight != 62.5 {
		t.Errorf("session2 top set = %v, want 62.5", hist.Sessions[1].TopSet.Weight)
	}
	if hist.Trend.Direction != "up" || hist.Trend.Change != 2.5 {
		t.Errorf("trend = %+v, want up/+2.5", hist.Trend)
	}
}

// --- seeding helpers (write directly to the DB to simulate logged sessions) ---

type seedSet struct {
	number int
	weight float64
	reps   int
}

func seedSession(t *testing.T, h *harness, email, exerciseID, performedAt string, sets []seedSet) {
	t.Helper()
	ctx := context.Background()

	var userID string
	if err := h.pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID); err != nil {
		t.Fatalf("lookup user: %v", err)
	}

	var sessionID string
	if err := h.pool.QueryRow(ctx, `
		INSERT INTO workout_sessions (user_id, status, performed_at, started_at)
		VALUES ($1, 'completed', $2::timestamptz, $2::timestamptz)
		RETURNING id`, userID, performedAt).Scan(&sessionID); err != nil {
		t.Fatalf("seed session: %v", err)
	}

	var sxID string
	if err := h.pool.QueryRow(ctx, `
		INSERT INTO session_exercises (session_id, exercise_id, position, name_snapshot, measurement_type, primary_muscle_group, status)
		VALUES ($1, $2, 0, 'Bench Press', 'weight_reps', 'chest', 'completed')
		RETURNING id`, sessionID, exerciseID).Scan(&sxID); err != nil {
		t.Fatalf("seed session_exercise: %v", err)
	}

	for _, s := range sets {
		if _, err := h.pool.Exec(ctx, `
			INSERT INTO set_entries (session_exercise_id, entry_number, weight, weight_unit, reps)
			VALUES ($1, $2, $3, 'kg', $4)`, sxID, s.number, s.weight, s.reps); err != nil {
			t.Fatalf("seed set_entry: %v", err)
		}
	}
}

// createRoutine is a helper that creates a routine and returns its id.
func (h *harness) createRoutine(t *testing.T, token, name, notes string) string {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/routines", token, map[string]any{
		"name": name, "notes": notes,
	})
	if resp.Status != http.StatusCreated {
		t.Fatalf("create routine %q: status %d body %s", name, resp.Status, resp.Body)
	}
	var out struct {
		ID string `json:"id"`
	}
	resp.decode(t, &out)
	return out.ID
}
