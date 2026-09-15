package api

import (
	"context"
	"net/http"
	"testing"
)

// lateralRaiseCatalogID looks up the seeded "Lateral Raise" catalog entry.
func lateralRaiseCatalogID(t *testing.T, h *harness) string {
	t.Helper()
	var id string
	if err := h.pool.QueryRow(context.Background(),
		`SELECT id FROM exercise_catalog WHERE name = 'Lateral Raise'`).Scan(&id); err != nil {
		t.Fatalf("lookup catalog Lateral Raise: %v", err)
	}
	return id
}

// routineExerciseLastSet reads a routine's detail and returns one exercise's
// last_set (nil if absent).
func routineExerciseLastSet(t *testing.T, h *harness, token, routineID, exerciseID string) *lastSet {
	t.Helper()
	r := h.do(t, http.MethodGet, "/api/v1/routines/"+routineID, token, nil)
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
		if e.ID == exerciseID {
			return e.LastSet
		}
	}
	t.Fatalf("exercise %s not found in routine detail", exerciseID)
	return nil
}

// TestSharedLastSet_RoutineDetail_E2E is the regression guard for PRD 0014's
// last-set sharing: the weight-to-beat on a routine's exercise reflects the most
// recent top set of the *same movement* logged in ANY routine — the reported
// bug where a Lateral Raise done on Upper day showed no starting weight on Push
// day. Covers both identity rules (catalog link, else normalized name).
func TestSharedLastSet_RoutineDetail_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	const email = "shared-last@example.com"
	token := h.registerUser(t, email, "supersecret1", "Shared")
	latID := lateralRaiseCatalogID(t, h)

	upper := h.createRoutine(t, token, "Upper", "")
	push := h.createRoutine(t, token, "Push", "")

	// Same catalog-linked movement in both routines.
	upperEx := h.createExercise(t, token, upper, map[string]any{
		"name": "Lateral Raise", "catalog_exercise_id": latID,
		"target_sets": 3, "target_reps": 12,
	})
	pushEx := h.createExercise(t, token, push, map[string]any{
		"name": "Lateral Raise", "catalog_exercise_id": latID,
		"target_sets": 3, "target_reps": 12,
	})

	// A custom (non-catalog) movement shared by name across two routines, plus an
	// unrelated exercise that must NOT inherit a last set.
	customA := h.createExercise(t, token, upper, map[string]any{
		"name": "My Cable Move", "primary_muscle_group": "shoulders",
		"target_sets": 3, "target_reps": 10,
	})
	customB := h.createExercise(t, token, push, map[string]any{
		"name": "  my cable move ", "primary_muscle_group": "shoulders",
		"target_sets": 3, "target_reps": 10,
	})
	unrelated := h.createExercise(t, token, push, map[string]any{
		"name": "Solo Move", "primary_muscle_group": "back",
		"target_sets": 3, "target_reps": 10,
	})

	// Log a session only on the Upper copies.
	seedSession(t, h, email, upperEx, "2026-09-01T09:00:00Z", []seedSet{{1, 8, 12}, {2, 10, 12}})
	seedSession(t, h, email, customA, "2026-09-02T09:00:00Z", []seedSet{{1, 20, 10}})

	// The Push copies inherit the weight-to-beat even though nothing was logged
	// under them directly — this is the bug being fixed.
	t.Run("catalog-linked shares last set to the other routine", func(t *testing.T) {
		ls := routineExerciseLastSet(t, h, token, push, pushEx)
		if ls == nil {
			t.Fatal("push Lateral Raise has no last_set; expected the Upper session's top set")
		}
		if ls.Weight != 10 || ls.Reps != 12 {
			t.Errorf("push last_set = %+v, want {10 kg 12}", *ls)
		}
	})

	t.Run("custom name shares last set to the other routine", func(t *testing.T) {
		ls := routineExerciseLastSet(t, h, token, push, customB)
		if ls == nil {
			t.Fatal("push custom move has no last_set; expected the Upper session's top set")
		}
		if ls.Weight != 20 || ls.Reps != 10 {
			t.Errorf("push custom last_set = %+v, want {20 kg 10}", *ls)
		}
	})

	t.Run("unrelated exercise gets no last set", func(t *testing.T) {
		if ls := routineExerciseLastSet(t, h, token, push, unrelated); ls != nil {
			t.Errorf("unrelated exercise last_set = %+v, want nil", *ls)
		}
	})
}

// TestSharedLastSet_ActiveSession_E2E proves the shared weight-to-beat is present
// on the running session checklist (the surface used "while doing the exercise"):
// completing the movement on one routine seeds its starting weight when the same
// movement is started on another routine.
func TestSharedLastSet_ActiveSession_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "shared-active@example.com", "supersecret1", "Active")
	latID := lateralRaiseCatalogID(t, h)

	upper := h.createRoutine(t, token, "Upper", "")
	push := h.createRoutine(t, token, "Push", "")
	h.createExercise(t, token, upper, map[string]any{
		"name": "Lateral Raise", "catalog_exercise_id": latID, "target_sets": 3, "target_reps": 12,
	})
	h.createExercise(t, token, push, map[string]any{
		"name": "Lateral Raise", "catalog_exercise_id": latID, "target_sets": 3, "target_reps": 12,
	})

	// Complete a Lateral Raise session on Upper day (top set 15 × 12).
	upperSess := startSession(t, h, token, upper)
	upperItem := findItem(t, upperSess, "Lateral Raise")
	logEntry(t, h, token, upperItem.ID, 12, 12)
	logEntry(t, h, token, upperItem.ID, 15, 12)
	if r := h.do(t, http.MethodPost, "/api/v1/sessions/"+upperSess.ID+"/complete", token, nil); r.Status != http.StatusOK {
		t.Fatalf("complete upper session: status %d body %s", r.Status, r.Body)
	}

	// Starting the same movement on Push day shows Upper's top set as the target.
	pushSess := startSession(t, h, token, push)
	pushItem := findItem(t, pushSess, "Lateral Raise")
	if pushItem.LastSet == nil {
		t.Fatal("push active-session Lateral Raise has no last_set; expected Upper's 15×12")
	}
	if pushItem.LastSet.Weight != 15 || pushItem.LastSet.Reps != 12 {
		t.Errorf("push active-session last_set = %+v, want {15 kg 12}", *pushItem.LastSet)
	}
}

// --- generic active-session helpers ---

type sessionItem struct {
	ID           string   `json:"id"`
	NameSnapshot string   `json:"name_snapshot"`
	LastSet      *lastSet `json:"last_set"`
}

type startedSession struct {
	ID        string        `json:"id"`
	Exercises []sessionItem `json:"exercises"`
}

func startSession(t *testing.T, h *harness, token, routineID string) startedSession {
	t.Helper()
	r := h.do(t, http.MethodPost, "/api/v1/routines/"+routineID+"/sessions", token, nil)
	if r.Status != http.StatusCreated {
		t.Fatalf("start session: status %d body %s", r.Status, r.Body)
	}
	var out startedSession
	r.decode(t, &out)
	return out
}

func findItem(t *testing.T, s startedSession, nameSnapshot string) sessionItem {
	t.Helper()
	for _, e := range s.Exercises {
		if e.NameSnapshot == nameSnapshot {
			return e
		}
	}
	t.Fatalf("%q not found in session %s", nameSnapshot, s.ID)
	return sessionItem{}
}

func logEntry(t *testing.T, h *harness, token, sxID string, weight float64, reps int) {
	t.Helper()
	r := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+sxID+"/entries", token, map[string]any{
		"weight": weight, "reps": reps,
	})
	if r.Status != http.StatusCreated {
		t.Fatalf("log entry %v×%d: status %d body %s", weight, reps, r.Status, r.Body)
	}
}
