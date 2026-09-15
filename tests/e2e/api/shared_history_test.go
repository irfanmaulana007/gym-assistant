package api

import (
	"context"
	"net/http"
	"testing"
)

// createExercise POSTs an exercise to a routine and returns its id.
func (h *harness) createExercise(t *testing.T, token, routineID string, body map[string]any) string {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/routines/"+routineID+"/exercises", token, body)
	if resp.Status != http.StatusCreated {
		t.Fatalf("create exercise: status %d body %s", resp.Status, resp.Body)
	}
	var ex struct {
		ID string `json:"id"`
	}
	resp.decode(t, &ex)
	if ex.ID == "" {
		t.Fatal("create exercise returned empty id")
	}
	return ex.ID
}

// getHistory fetches an exercise's derived history.
func (h *harness) getHistory(t *testing.T, token, exerciseID string) struct {
	Sessions []struct {
		TopSet *struct {
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
} {
	t.Helper()
	resp := h.do(t, http.MethodGet, "/api/v1/exercises/"+exerciseID+"/history", token, nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("history status %d body %s", resp.Status, resp.Body)
	}
	var hist struct {
		Sessions []struct {
			TopSet *struct {
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
	resp.decode(t, &hist)
	return hist
}

// TestSharedExerciseHistory_CatalogLinked_E2E is the regression guard for PRD
// 0014: the same catalog-linked movement added to two routines shares one
// history. Before the fix, each per-routine exercise row saw only its own sets;
// now history aggregates across every routine that contains the movement.
func TestSharedExerciseHistory_CatalogLinked_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	const email = "shared-cat@example.com"
	token := h.registerUser(t, email, "supersecret1", "Shared")

	var latID string
	if err := h.pool.QueryRow(context.Background(),
		`SELECT id FROM exercise_catalog WHERE name = 'Lateral Raise'`).Scan(&latID); err != nil {
		t.Fatalf("lookup catalog Lateral Raise: %v", err)
	}

	upper := h.createRoutine(t, token, "Upper", "")
	push := h.createRoutine(t, token, "Push", "")

	upperEx := h.createExercise(t, token, upper, map[string]any{
		"name": "Lateral Raise", "catalog_exercise_id": latID,
		"target_sets": 3, "target_reps": 12,
	})
	pushEx := h.createExercise(t, token, push, map[string]any{
		"name": "Lateral Raise", "catalog_exercise_id": latID,
		"target_sets": 3, "target_reps": 12,
	})

	// One session under each routine's copy of the exercise.
	seedSession(t, h, email, upperEx, "2026-09-01T09:00:00Z", []seedSet{{1, 8, 12}, {2, 10, 12}})
	seedSession(t, h, email, pushEx, "2026-09-08T09:00:00Z", []seedSet{{1, 10, 12}, {2, 12.5, 12}})

	// Both copies must show the SAME merged, two-session history, oldest first.
	for _, tc := range []struct {
		name       string
		exerciseID string
	}{{"viewed from Push", pushEx}, {"viewed from Upper", upperEx}} {
		t.Run(tc.name, func(t *testing.T) {
			hist := h.getHistory(t, token, tc.exerciseID)
			if len(hist.Sessions) != 2 {
				t.Fatalf("sessions = %d, want 2 (merged across routines)", len(hist.Sessions))
			}
			if hist.Sessions[0].TopSet == nil || hist.Sessions[0].TopSet.Weight != 10 {
				t.Errorf("oldest session top set = %v, want 10", hist.Sessions[0].TopSet)
			}
			if hist.Sessions[1].TopSet == nil || hist.Sessions[1].TopSet.Weight != 12.5 {
				t.Errorf("newest session top set = %v, want 12.5", hist.Sessions[1].TopSet)
			}
			if hist.Trend.Direction != "up" || hist.Trend.Change != 2.5 {
				t.Errorf("trend = %+v, want up/+2.5", hist.Trend)
			}
		})
	}
}

// TestSharedExerciseHistory_CustomByName_E2E covers the "catalog id, else name"
// rule (PRD 0014): custom exercises (no catalog link) with the same normalized
// name merge across routines, while a differently-named exercise stays separate.
func TestSharedExerciseHistory_CustomByName_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	const email = "shared-custom@example.com"
	token := h.registerUser(t, email, "supersecret1", "Custom")

	rA := h.createRoutine(t, token, "Day A", "")
	rB := h.createRoutine(t, token, "Day B", "")

	// Same custom name in both routines (note the case/space difference — must
	// still merge), plus an unrelated custom exercise that must NOT leak in.
	moveA := h.createExercise(t, token, rA, map[string]any{
		"name": "My Special Move", "primary_muscle_group": "chest",
		"target_sets": 3, "target_reps": 10,
	})
	moveB := h.createExercise(t, token, rB, map[string]any{
		"name": "  my special move ", "primary_muscle_group": "chest",
		"target_sets": 3, "target_reps": 10,
	})
	unrelated := h.createExercise(t, token, rA, map[string]any{
		"name": "Totally Different", "primary_muscle_group": "back",
		"target_sets": 3, "target_reps": 10,
	})

	seedSession(t, h, email, moveA, "2026-09-01T09:00:00Z", []seedSet{{1, 20, 10}})
	seedSession(t, h, email, moveB, "2026-09-08T09:00:00Z", []seedSet{{1, 25, 10}})
	seedSession(t, h, email, unrelated, "2026-09-05T09:00:00Z", []seedSet{{1, 99, 10}})

	// The custom move merges its two sessions across routines.
	hist := h.getHistory(t, token, moveA)
	if len(hist.Sessions) != 2 {
		t.Fatalf("custom move sessions = %d, want 2 (merged by name)", len(hist.Sessions))
	}
	for _, s := range hist.Sessions {
		if s.TopSet != nil && s.TopSet.Weight == 99 {
			t.Errorf("unrelated exercise leaked into merged history: %+v", s.TopSet)
		}
	}

	// The unrelated exercise keeps its own single-session history.
	unrelatedHist := h.getHistory(t, token, unrelated)
	if len(unrelatedHist.Sessions) != 1 {
		t.Fatalf("unrelated sessions = %d, want 1 (not merged)", len(unrelatedHist.Sessions))
	}
}
