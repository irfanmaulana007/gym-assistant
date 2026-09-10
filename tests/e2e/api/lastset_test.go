package api

import (
	"net/http"
	"testing"
)

// lastSet mirrors the derived domain.LastSet in API responses.
type lastSet struct {
	Weight     float64 `json:"weight"`
	WeightUnit string  `json:"weight_unit"`
	Reps       int     `json:"reps"`
}

// TestLastSet_E2E proves the "weight to beat" round-trips end to end: it is
// absent before any session, appears on the routine-detail exercise and the
// active-session checklist item after a session is logged, and reflects the
// prior session's top set — never the in-progress session's own logs.
func TestLastSet_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "lastset@example.com", "supersecret1", "LS")
	routine := h.createRoutine(t, token, "Push", "")
	benchID := h.addExercise(t, token, routine, map[string]any{
		"name": "Bench Press", "measurement_type": "weight_reps",
		"target_sets": 3, "target_reps": 8, "primary_muscle_group": "chest",
	})

	// Before any session, routine detail carries no last_set.
	if ls := routineBenchLastSet(t, h, token, routine, benchID); ls != nil {
		t.Fatalf("expected no last_set before any session, got %+v", ls)
	}

	// Session 1: top set is 62.5 × 10 (heavier-weight set wins over 60 × 8).
	sx1 := startAndFindBench(t, h, token, routine)
	logWeight(t, h, token, sx1, 60, 8)
	logWeight(t, h, token, sx1, 62.5, 10)
	if r := h.do(t, http.MethodPost, "/api/v1/sessions/"+sx1.sessionID+"/complete", token, nil); r.Status != http.StatusOK {
		t.Fatalf("complete session 1: status %d body %s", r.Status, r.Body)
	}

	// Routine detail now surfaces the prior session's top set.
	ls := routineBenchLastSet(t, h, token, routine, benchID)
	if ls == nil {
		t.Fatal("expected last_set on routine detail after a completed session")
	}
	if ls.Weight != 62.5 || ls.Reps != 10 || ls.WeightUnit != "kg" {
		t.Errorf("routine last_set = %+v, want {62.5 kg 10}", *ls)
	}

	// Session 2: the checklist item carries session 1's top set as the target.
	sx2 := startAndFindBench(t, h, token, routine)
	if sx2.lastSet == nil {
		t.Fatal("expected last_set on the active-session checklist item")
	}
	if sx2.lastSet.Weight != 62.5 || sx2.lastSet.Reps != 10 {
		t.Errorf("session last_set = %+v, want {62.5 kg 10}", *sx2.lastSet)
	}

	// Logging a lighter set in the *current* session must not change last_set:
	// it still reflects the previous session, not the in-progress one.
	logWeight(t, h, token, sx2, 40, 3)
	reloaded := getBench(t, h, token, sx2.sessionID)
	if reloaded.lastSet == nil || reloaded.lastSet.Weight != 62.5 || reloaded.lastSet.Reps != 10 {
		t.Errorf("last_set after in-session log = %+v, want unchanged {62.5 10}", reloaded.lastSet)
	}
}

// benchRef identifies the Bench Press checklist item within a session.
type benchRef struct {
	sessionID string
	sxID      string
	lastSet   *lastSet
}

// startAndFindBench starts a session for the routine and returns the Bench item.
func startAndFindBench(t *testing.T, h *harness, token, routine string) benchRef {
	t.Helper()
	r := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil)
	if r.Status != http.StatusCreated {
		t.Fatalf("start session: status %d body %s", r.Status, r.Body)
	}
	var out struct {
		ID        string `json:"id"`
		Exercises []struct {
			ID           string   `json:"id"`
			NameSnapshot string   `json:"name_snapshot"`
			LastSet      *lastSet `json:"last_set"`
		} `json:"exercises"`
	}
	r.decode(t, &out)
	for _, e := range out.Exercises {
		if e.NameSnapshot == "Bench Press" {
			return benchRef{sessionID: out.ID, sxID: e.ID, lastSet: e.LastSet}
		}
	}
	t.Fatal("Bench Press not found in started session")
	return benchRef{}
}

// getBench re-reads a session and returns the Bench item.
func getBench(t *testing.T, h *harness, token, sessionID string) benchRef {
	t.Helper()
	r := h.do(t, http.MethodGet, "/api/v1/sessions/"+sessionID, token, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("get session: status %d body %s", r.Status, r.Body)
	}
	var out struct {
		ID        string `json:"id"`
		Exercises []struct {
			ID           string   `json:"id"`
			NameSnapshot string   `json:"name_snapshot"`
			LastSet      *lastSet `json:"last_set"`
		} `json:"exercises"`
	}
	r.decode(t, &out)
	for _, e := range out.Exercises {
		if e.NameSnapshot == "Bench Press" {
			return benchRef{sessionID: out.ID, sxID: e.ID, lastSet: e.LastSet}
		}
	}
	t.Fatal("Bench Press not found in session")
	return benchRef{}
}

// logWeight logs one weighted set under a checklist item.
func logWeight(t *testing.T, h *harness, token string, b benchRef, weight float64, reps int) {
	t.Helper()
	r := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+b.sxID+"/entries", token, map[string]any{
		"weight": weight, "reps": reps,
	})
	if r.Status != http.StatusCreated {
		t.Fatalf("log entry %v×%d: status %d body %s", weight, reps, r.Status, r.Body)
	}
}

// routineBenchLastSet reads the routine detail and returns Bench's last_set.
func routineBenchLastSet(t *testing.T, h *harness, token, routine, benchID string) *lastSet {
	t.Helper()
	r := h.do(t, http.MethodGet, "/api/v1/routines/"+routine, token, nil)
	if r.Status != http.StatusOK {
		t.Fatalf("get routine: status %d body %s", r.Status, r.Body)
	}
	var out struct {
		Exercises []struct {
			ID      string   `json:"id"`
			LastSet *lastSet `json:"last_set"`
		} `json:"exercises"`
	}
	r.decode(t, &out)
	for _, e := range out.Exercises {
		if e.ID == benchID {
			return e.LastSet
		}
	}
	t.Fatal("Bench Press not found in routine detail")
	return nil
}
