package api

import (
	"net/http"
	"testing"
)

// sessionExerciseView is the decoded shape of one session checklist item, with
// the fields PRD 0017 cares about.
type sessionExerciseView struct {
	ID                    string   `json:"id"`
	ExerciseID            *string  `json:"exercise_id"`
	CatalogExerciseID     *string  `json:"catalog_exercise_id"`
	NameSnapshot          string   `json:"name_snapshot"`
	MeasurementType       string   `json:"measurement_type"`
	PrimaryMuscleGroup    string   `json:"primary_muscle_group"`
	SecondaryMuscleGroups []string `json:"secondary_muscle_groups"`
	LastSet               *struct {
		Weight float64 `json:"weight"`
		Reps   int     `json:"reps"`
	} `json:"last_set"`
}

// addAdHoc posts an ad-hoc exercise to a live session and returns the decoded
// session exercise.
func (h *harness) addAdHoc(t *testing.T, token, sessionID string, body map[string]any) (apiResponse, sessionExerciseView) {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/sessions/"+sessionID+"/exercises", token, body)
	var sx sessionExerciseView
	if resp.Status == http.StatusCreated {
		resp.decode(t, &sx)
	}
	return resp, sx
}

// getSessionExercises fetches a session and returns its checklist items.
func (h *harness) getSessionExercises(t *testing.T, token, sessionID string) []sessionExerciseView {
	t.Helper()
	resp := h.do(t, http.MethodGet, "/api/v1/sessions/"+sessionID, token, nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("get session: status %d body %s", resp.Status, resp.Body)
	}
	var out struct {
		Exercises []sessionExerciseView `json:"exercises"`
	}
	resp.decode(t, &out)
	return out.Exercises
}

// TestSessionAdHocCatalogExercise_E2E is the PRD 0017 guard: a catalog exercise
// picked mid-session is session-scoped (never added to the routine) yet
// catalog-linked, so its logged sets join the movement's shared history and it
// gets a "weight to beat".
func TestSessionAdHocCatalogExercise_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	const email = "session-adhoc@example.com"
	token := h.registerUser(t, email, "supersecret1", "AdHoc")

	latPulldown := h.findCatalog(t, token, "Lat Pulldown")

	// Pull Day owns one unrelated exercise; Back Day has a catalog-linked Lat
	// Pulldown we'll open history from.
	pullDay := h.createRoutine(t, token, "Pull Day", "")
	h.createExercise(t, token, pullDay, map[string]any{
		"name": "Barbell Row", "primary_muscle_group": "back",
		"target_sets": 4, "target_reps": 8,
	})
	backDay := h.createRoutine(t, token, "Back Day", "")
	latEx := h.createExercise(t, token, backDay, map[string]any{
		"name": "Lat Pulldown", "catalog_exercise_id": latPulldown.ID,
		"target_sets": 3, "target_reps": 10,
	})

	// Start a Pull Day session and add Lat Pulldown on the spot from the catalog.
	session1, _ := h.startSession(t, token, pullDay)
	resp, adHoc := h.addAdHoc(t, token, session1, map[string]any{
		"catalog_exercise_id": latPulldown.ID,
		"target_sets":         3,
		"target_reps":         10,
	})
	if resp.Status != http.StatusCreated {
		t.Fatalf("add ad-hoc catalog exercise: status %d body %s", resp.Status, resp.Body)
	}

	// Session-scoped (exercise_id NULL) yet catalog-linked, with metadata resolved
	// from the catalog.
	if adHoc.ExerciseID != nil {
		t.Errorf("ad-hoc exercise_id = %v, want nil (session-scoped, not a routine exercise)", *adHoc.ExerciseID)
	}
	if adHoc.CatalogExerciseID == nil || *adHoc.CatalogExerciseID != latPulldown.ID {
		t.Errorf("ad-hoc catalog_exercise_id = %v, want %s", adHoc.CatalogExerciseID, latPulldown.ID)
	}
	if adHoc.NameSnapshot != "Lat Pulldown" {
		t.Errorf("ad-hoc name = %q, want Lat Pulldown (from catalog)", adHoc.NameSnapshot)
	}
	if adHoc.MeasurementType != "weight_reps" {
		t.Errorf("ad-hoc measurement_type = %q, want weight_reps (catalog default)", adHoc.MeasurementType)
	}
	if adHoc.PrimaryMuscleGroup != "back" {
		t.Errorf("ad-hoc primary_muscle_group = %q, want back (from catalog, not 'other')", adHoc.PrimaryMuscleGroup)
	}

	// Log a weighted set on the ad-hoc exercise, then finish the session.
	h.logSet(t, token, adHoc.ID, map[string]any{"weight": 40.0, "reps": 10, "weight_unit": "kg"})
	h.completeSession(t, token, session1)

	// Shared history: opening Lat Pulldown's history from Back Day's routine
	// exercise includes the set logged ad-hoc in Pull Day (PRD 0017 §4.3).
	hist := h.getHistory(t, token, latEx)
	if len(hist.Sessions) != 1 {
		t.Fatalf("Lat Pulldown history sessions = %d, want 1 (the ad-hoc set merged in)", len(hist.Sessions))
	}
	if hist.Sessions[0].TopSet == nil || hist.Sessions[0].TopSet.Weight != 40 {
		t.Errorf("history top set = %v, want 40 (from the ad-hoc session)", hist.Sessions[0].TopSet)
	}

	// Session-scoping: a NEW Pull Day session's checklist has Barbell Row but NOT
	// the ad-hoc Lat Pulldown — it never persisted to the routine.
	session2, byName := h.startSession(t, token, pullDay)
	if _, ok := byName["Barbell Row"]; !ok {
		t.Error("new session missing the routine's Barbell Row")
	}
	if _, ok := byName["Lat Pulldown"]; ok {
		t.Error("ad-hoc Lat Pulldown leaked into the next session's checklist (should be session-scoped)")
	}

	// "Weight to beat": adding Lat Pulldown ad-hoc again surfaces last session's
	// set of the same catalog movement (PRD 0017 §4.4).
	if _, again := h.addAdHoc(t, token, session2, map[string]any{
		"catalog_exercise_id": latPulldown.ID, "target_sets": 3, "target_reps": 10,
	}); again.CatalogExerciseID == nil {
		t.Fatal("re-added ad-hoc has no catalog link")
	}
	exercises := h.getSessionExercises(t, token, session2)
	var adHoc2 *sessionExerciseView
	for i := range exercises {
		if exercises[i].CatalogExerciseID != nil && *exercises[i].CatalogExerciseID == latPulldown.ID {
			adHoc2 = &exercises[i]
			break
		}
	}
	if adHoc2 == nil {
		t.Fatal("re-added ad-hoc Lat Pulldown not found in session 2")
	}
	if adHoc2.LastSet == nil || adHoc2.LastSet.Weight != 40 {
		t.Errorf("ad-hoc last_set = %v, want weight 40 (from the prior session)", adHoc2.LastSet)
	}
}

// TestSessionAdHocCatalog_UnknownCatalog_E2E rejects a bad catalog link with a
// validation error rather than inserting a dangling row (PRD 0017 §4.2).
func TestSessionAdHocCatalog_UnknownCatalog_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "adhoc-bad@example.com", "supersecret1", "Bad")
	routine := h.createRoutine(t, token, "Pull Day", "")
	session, _ := h.startSession(t, token, routine)

	resp, _ := h.addAdHoc(t, token, session, map[string]any{
		"catalog_exercise_id": "00000000-0000-0000-0000-000000000000",
	})
	if resp.Status != http.StatusUnprocessableEntity {
		t.Fatalf("unknown catalog: status %d body %s, want 422", resp.Status, resp.Body)
	}
	if code := resp.errorCode(t); code != "validation_error" {
		t.Errorf("error code = %q, want validation_error", code)
	}
}
