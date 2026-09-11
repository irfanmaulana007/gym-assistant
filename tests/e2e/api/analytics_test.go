package api

import (
	"context"
	"net/http"
	"testing"
	"time"
)

// startSession starts a session for a routine and returns the session id plus a
// name_snapshot -> session_exercise_id map for logging sets.
func (h *harness) startSession(t *testing.T, token, routineID string) (string, map[string]string) {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/routines/"+routineID+"/sessions", token, nil)
	if resp.Status != http.StatusCreated {
		t.Fatalf("start session: status %d body %s", resp.Status, resp.Body)
	}
	var session struct {
		ID        string `json:"id"`
		Exercises []struct {
			ID           string `json:"id"`
			NameSnapshot string `json:"name_snapshot"`
		} `json:"exercises"`
	}
	resp.decode(t, &session)
	byName := map[string]string{}
	for _, e := range session.Exercises {
		byName[e.NameSnapshot] = e.ID
	}
	return session.ID, byName
}

// logSet posts one set entry to a session exercise.
func (h *harness) logSet(t *testing.T, token, sxID string, body map[string]any) {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+sxID+"/entries", token, body)
	if resp.Status != http.StatusCreated {
		t.Fatalf("log set: status %d body %s", resp.Status, resp.Body)
	}
}

// completeSession completes a session.
func (h *harness) completeSession(t *testing.T, token, sessionID string) {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/sessions/"+sessionID+"/complete", token, nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("complete session: status %d body %s", resp.Status, resp.Body)
	}
}

// backdate rewrites a completed session's date and active duration so analytics
// windows/streaks can be tested deterministically (the API always dates a
// session "now"). Uses the pool directly — the test owns the DB.
func (h *harness) backdate(t *testing.T, sessionID string, when time.Time, activeSecs int) {
	t.Helper()
	_, err := h.pool.Exec(context.Background(),
		`UPDATE workout_sessions SET started_at = $2, performed_at = $2, active_duration_seconds = $3 WHERE id = $1`,
		sessionID, when, activeSecs)
	if err != nil {
		t.Fatalf("backdate session %s: %v", sessionID, err)
	}
}

// TestAnalyticsDashboard_EmptyUser_E2E proves a fresh user gets a valid, zeroed
// dashboard (200, empty arrays) — never a 404 or a spinner-forcing error.
func TestAnalyticsDashboard_EmptyUser_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "analytics-empty@example.com", "supersecret1", "Empty")

	resp := h.do(t, http.MethodGet, "/api/v1/analytics/dashboard", token, nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("dashboard status %d body %s", resp.Status, resp.Body)
	}
	var dash struct {
		VolumeUnit string `json:"volume_unit"`
		Summary    struct {
			Workouts      struct{ Value float64 } `json:"workouts"`
			CurrentStreak int                     `json:"current_streak"`
			DaysSinceLast *int                    `json:"days_since_last"`
		} `json:"summary"`
		VolumeSeries []any `json:"volume_series"`
		MuscleGroups []any `json:"muscle_groups"`
		TrendingUp   []any `json:"trending_up"`
		Stalled      []any `json:"stalled"`
		Records      []any `json:"records"`
		Calendar     []any `json:"calendar"`
	}
	resp.decode(t, &dash)
	if dash.VolumeUnit != "kg" {
		t.Errorf("volume_unit = %q, want kg", dash.VolumeUnit)
	}
	if dash.Summary.Workouts.Value != 0 || dash.Summary.CurrentStreak != 0 {
		t.Errorf("empty summary not zeroed: %+v", dash.Summary)
	}
	if dash.Summary.DaysSinceLast != nil {
		t.Errorf("days_since_last = %v, want nil for a user with no sessions", *dash.Summary.DaysSinceLast)
	}
	// Arrays must be [] (non-null) so the client renders an empty state.
	if dash.VolumeSeries == nil || dash.MuscleGroups == nil || dash.TrendingUp == nil ||
		dash.Stalled == nil || dash.Records == nil || dash.Calendar == nil {
		t.Errorf("empty dashboard arrays should be [] not null: %+v", dash)
	}
}

// TestAnalyticsDashboard_Aggregations_E2E seeds sessions across weeks and muscle
// groups (incl. a mixed kg/lb exercise) and asserts the dashboard's volume
// total, per-group sets, streak, and PRs against hand-computed values.
func TestAnalyticsDashboard_Aggregations_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "analytics-agg@example.com", "supersecret1", "Agg")
	routine := h.createRoutine(t, token, "Push", "")
	h.addExercise(t, token, routine, map[string]any{
		"name": "Bench Press", "measurement_type": "weight_reps",
		"target_sets": 3, "target_reps": 8, "primary_muscle_group": "chest",
	})
	h.addExercise(t, token, routine, map[string]any{
		"name": "Squat", "measurement_type": "weight_reps",
		"target_sets": 3, "target_reps": 5, "primary_muscle_group": "quads",
	})

	// Anchor dates to calendar boundaries so window/streak assertions are
	// deterministic regardless of the day the suite runs. "Today" is always in
	// the current week; "last week" is always the immediately-adjacent week.
	now := time.Now().UTC()
	y, m, d := now.Date()
	startOfToday := time.Date(y, m, d, 12, 0, 0, 0, time.UTC)
	lastWeek := startOfToday.AddDate(0, 0, -7)

	// Session 1 (today): Bench 62.5x8 (kg) + 100x1 (lb); Squat 105x5 (kg).
	s1, sx1 := h.startSession(t, token, routine)
	h.logSet(t, token, sx1["Bench Press"], map[string]any{"weight": 62.5, "reps": 8, "weight_unit": "kg"})
	h.logSet(t, token, sx1["Bench Press"], map[string]any{"weight": 100, "reps": 1, "weight_unit": "lb"})
	h.logSet(t, token, sx1["Squat"], map[string]any{"weight": 105, "reps": 5, "weight_unit": "kg"})
	h.completeSession(t, token, s1)
	h.backdate(t, s1, startOfToday, 1800) // today, 30 min

	// Session 2 (last week): Bench 60x8 (kg); Squat 100x5 (kg). Lighter, older —
	// so the top-set series climbs 60 -> 62.5 (trending up).
	s2, sx2 := h.startSession(t, token, routine)
	h.logSet(t, token, sx2["Bench Press"], map[string]any{"weight": 60, "reps": 8, "weight_unit": "kg"})
	h.logSet(t, token, sx2["Squat"], map[string]any{"weight": 100, "reps": 5, "weight_unit": "kg"})
	h.completeSession(t, token, s2)
	h.backdate(t, s2, lastWeek, 1500) // last week, 25 min

	// --- Dashboard over the "all" window covers both sessions regardless of the
	// calendar date the test runs on. ---
	resp := h.do(t, http.MethodGet, "/api/v1/analytics/dashboard?window=all&tz=UTC", token, nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("dashboard status %d body %s", resp.Status, resp.Body)
	}
	var dash struct {
		Summary struct {
			Workouts        struct{ Value float64 } `json:"workouts"`
			TrainingMinutes struct{ Value float64 } `json:"training_minutes"`
			TotalVolume     struct{ Value float64 } `json:"total_volume"`
			CurrentStreak   int                     `json:"current_streak"`
			LongestStreak   int                     `json:"longest_streak"`
			DaysSinceLast   *int                    `json:"days_since_last"`
		} `json:"summary"`
		MuscleGroups []struct {
			MuscleGroup string  `json:"muscle_group"`
			Sets        int     `json:"sets"`
			Volume      float64 `json:"volume"`
			Frequency   int     `json:"frequency"`
		} `json:"muscle_groups"`
		TrendingUp []struct {
			Name      string `json:"name"`
			Direction string `json:"direction"`
		} `json:"trending_up"`
		Records []struct {
			Name           string  `json:"name"`
			HeaviestWeight float64 `json:"heaviest_weight"`
			EstOneRM       float64 `json:"est_one_rm"`
		} `json:"records"`
	}
	resp.decode(t, &dash)

	if dash.Summary.Workouts.Value != 2 {
		t.Errorf("workouts = %v, want 2", dash.Summary.Workouts.Value)
	}
	if dash.Summary.TrainingMinutes.Value != 55 { // 30 + 25
		t.Errorf("training_minutes = %v, want 55", dash.Summary.TrainingMinutes.Value)
	}
	// Total volume (kg): 62.5*8 + (100lb->45.359237)*1 + 105*5  (today)
	//                  + 60*8 + 100*5                           (last week)
	wantVol := 62.5*8 + 100*0.45359237*1 + 105*5 + 60*8 + 100*5
	if !approx(dash.Summary.TotalVolume.Value, round2(wantVol), 0.02) {
		t.Errorf("total_volume = %v, want ~%v", dash.Summary.TotalVolume.Value, round2(wantVol))
	}
	// Two sessions in two consecutive weeks -> current streak 2.
	if dash.Summary.CurrentStreak != 2 {
		t.Errorf("current_streak = %d, want 2", dash.Summary.CurrentStreak)
	}
	if dash.Summary.LongestStreak < 2 {
		t.Errorf("longest_streak = %d, want >= 2", dash.Summary.LongestStreak)
	}
	if dash.Summary.DaysSinceLast == nil || *dash.Summary.DaysSinceLast != 0 {
		t.Errorf("days_since_last = %v, want 0 (a session today)", dash.Summary.DaysSinceLast)
	}

	// Muscle groups: chest gets 2 bench sets (s1) + 1 (s2) = 3; quads 1+1 = 2.
	sets := map[string]int{}
	freq := map[string]int{}
	for _, m := range dash.MuscleGroups {
		sets[m.MuscleGroup] = m.Sets
		freq[m.MuscleGroup] = m.Frequency
	}
	if sets["chest"] != 3 {
		t.Errorf("chest sets = %d, want 3", sets["chest"])
	}
	if sets["quads"] != 2 {
		t.Errorf("quads sets = %d, want 2", sets["quads"])
	}
	if freq["chest"] != 2 {
		t.Errorf("chest frequency = %d, want 2 (two sessions)", freq["chest"])
	}

	// Bench top weight rose 60 -> 62.5 across sessions -> trending up.
	foundBenchUp := false
	for _, tr := range dash.TrendingUp {
		if tr.Name == "Bench Press" && tr.Direction == "up" {
			foundBenchUp = true
		}
	}
	if !foundBenchUp {
		t.Errorf("expected Bench Press trending up, got %+v", dash.TrendingUp)
	}

	// PR: Squat heaviest is 105kg; est-1RM = 105*(1+5/30) = 122.5.
	var squat *struct {
		Name           string
		HeaviestWeight float64
		EstOneRM       float64
	}
	for _, rec := range dash.Records {
		if rec.Name == "Squat" {
			squat = &struct {
				Name           string
				HeaviestWeight float64
				EstOneRM       float64
			}{rec.Name, rec.HeaviestWeight, rec.EstOneRM}
		}
	}
	if squat == nil {
		t.Fatalf("Squat PR not found in %+v", dash.Records)
	}
	if squat.HeaviestWeight != 105 {
		t.Errorf("squat heaviest = %v, want 105", squat.HeaviestWeight)
	}
	if !approx(squat.EstOneRM, 122.5, 0.01) {
		t.Errorf("squat est_one_rm = %v, want 122.5", squat.EstOneRM)
	}

	// --- The "week" window should only see this week's session. ---
	wresp := h.do(t, http.MethodGet, "/api/v1/analytics/summary?window=week&tz=UTC", token, nil)
	var wk struct {
		Summary struct {
			Workouts struct{ Value float64 } `json:"workouts"`
		} `json:"summary"`
	}
	wresp.decode(t, &wk)
	if wk.Summary.Workouts.Value != 1 {
		t.Errorf("week workouts = %v, want 1 (only this week's session)", wk.Summary.Workouts.Value)
	}
}

// TestAnalytics_CrossUserIsolation_E2E proves analytics never leak another
// user's rows.
func TestAnalytics_CrossUserIsolation_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	tokenA := h.registerUser(t, "an-a@example.com", "supersecret1", "AA")
	tokenB := h.registerUser(t, "an-b@example.com", "supersecret1", "BB")

	routineA := h.createRoutine(t, tokenA, "A Push", "")
	h.addExercise(t, tokenA, routineA, map[string]any{
		"name": "Bench", "measurement_type": "weight_reps",
		"target_sets": 3, "target_reps": 8, "primary_muscle_group": "chest",
	})
	sA, sxA := h.startSession(t, tokenA, routineA)
	h.logSet(t, tokenA, sxA["Bench"], map[string]any{"weight": 80, "reps": 8, "weight_unit": "kg"})
	h.completeSession(t, tokenA, sA)

	// B has no sessions -> B's analytics are empty despite A having data.
	resp := h.do(t, http.MethodGet, "/api/v1/analytics/summary", tokenB, nil)
	var out struct {
		Summary struct {
			Workouts    struct{ Value float64 } `json:"workouts"`
			TotalVolume struct{ Value float64 } `json:"total_volume"`
		} `json:"summary"`
	}
	resp.decode(t, &out)
	if out.Summary.Workouts.Value != 0 || out.Summary.TotalVolume.Value != 0 {
		t.Errorf("user B sees A's data: %+v", out.Summary)
	}

	// Unauthenticated request is rejected.
	if r := h.do(t, http.MethodGet, "/api/v1/analytics/dashboard", "", nil); r.Status != http.StatusUnauthorized {
		t.Errorf("unauthenticated dashboard status %d, want 401", r.Status)
	}
}

// TestAnalytics_UnknownWindow_E2E rejects an invalid window with 422.
func TestAnalytics_UnknownWindow_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "an-win@example.com", "supersecret1", "Win")
	resp := h.do(t, http.MethodGet, "/api/v1/analytics/dashboard?window=decade", token, nil)
	if resp.Status != http.StatusUnprocessableEntity {
		t.Fatalf("bad window status %d, want 422 (body %s)", resp.Status, resp.Body)
	}
	if code := resp.errorCode(t); code != "validation_error" {
		t.Errorf("error code = %q, want validation_error", code)
	}
}

func approx(got, want, tol float64) bool {
	d := got - want
	if d < 0 {
		d = -d
	}
	return d <= tol
}

func round2(f float64) float64 {
	if f >= 0 {
		return float64(int64(f*100+0.5)) / 100
	}
	return float64(int64(f*100-0.5)) / 100
}
