package api

import (
	"net/http"
	"testing"
)

// TestCardioSessionLogging_E2E guards PRD 0019: a distance exercise's target
// must survive the routine→session snapshot, and a cardio bout must round-trip
// distance, duration, incline, and heart rate through the set-entry API.
func TestCardioSessionLogging_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "cardio@example.com", "supersecret1", "Runner")

	routine := h.createRoutine(t, token, "Conditioning", "")
	h.createExercise(t, token, routine, map[string]any{
		"name":                 "Outdoor Run",
		"measurement_type":     "distance",
		"target_distance":      5,
		"distance_unit":        "km",
		"primary_muscle_group": "cardio",
	})

	// Start a session: the snapshot must carry target_distance / distance_unit.
	startResp := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil)
	if startResp.Status != http.StatusCreated {
		t.Fatalf("start session: status %d body %s", startResp.Status, startResp.Body)
	}
	var session struct {
		ID        string `json:"id"`
		Exercises []struct {
			ID              string   `json:"id"`
			MeasurementType string   `json:"measurement_type"`
			TargetDistance  *float64 `json:"target_distance"`
			DistanceUnit    *string  `json:"distance_unit"`
		} `json:"exercises"`
	}
	startResp.decode(t, &session)
	if len(session.Exercises) != 1 {
		t.Fatalf("checklist = %d items, want 1", len(session.Exercises))
	}
	run := session.Exercises[0]
	if run.MeasurementType != "distance" {
		t.Fatalf("measurement_type = %q, want distance", run.MeasurementType)
	}
	if run.TargetDistance == nil || *run.TargetDistance != 5 {
		t.Fatalf("snapshot target_distance = %v, want 5 (the routine target must carry through)", run.TargetDistance)
	}
	if run.DistanceUnit == nil || *run.DistanceUnit != "km" {
		t.Fatalf("snapshot distance_unit = %v, want km", run.DistanceUnit)
	}

	// Log a run with every cardio field, then read it back intact.
	entryResp := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+run.ID+"/entries", token, map[string]any{
		"distance":         5,
		"distance_unit":    "km",
		"duration_seconds": 1650,
		"incline":          1.5,
		"avg_heart_rate":   150,
		"max_heart_rate":   172,
	})
	if entryResp.Status != http.StatusCreated {
		t.Fatalf("log cardio entry: status %d body %s", entryResp.Status, entryResp.Body)
	}

	getResp := h.do(t, http.MethodGet, "/api/v1/sessions/"+session.ID, token, nil)
	if getResp.Status != http.StatusOK {
		t.Fatalf("get session: status %d body %s", getResp.Status, getResp.Body)
	}
	var detail struct {
		Exercises []struct {
			ID      string `json:"id"`
			Entries []struct {
				Distance        *float64 `json:"distance"`
				DistanceUnit    *string  `json:"distance_unit"`
				DurationSeconds *int     `json:"duration_seconds"`
				Incline         *float64 `json:"incline"`
				AvgHeartRate    *int     `json:"avg_heart_rate"`
				MaxHeartRate    *int     `json:"max_heart_rate"`
			} `json:"entries"`
		} `json:"exercises"`
	}
	getResp.decode(t, &detail)

	var entries []struct {
		Distance        *float64 `json:"distance"`
		DistanceUnit    *string  `json:"distance_unit"`
		DurationSeconds *int     `json:"duration_seconds"`
		Incline         *float64 `json:"incline"`
		AvgHeartRate    *int     `json:"avg_heart_rate"`
		MaxHeartRate    *int     `json:"max_heart_rate"`
	}
	for _, e := range detail.Exercises {
		if e.ID == run.ID {
			entries = e.Entries
		}
	}
	if len(entries) != 1 {
		t.Fatalf("logged entries = %d, want 1", len(entries))
	}
	e := entries[0]
	if e.Distance == nil || *e.Distance != 5 {
		t.Errorf("entry distance = %v, want 5", e.Distance)
	}
	if e.DistanceUnit == nil || *e.DistanceUnit != "km" {
		t.Errorf("entry distance_unit = %v, want km", e.DistanceUnit)
	}
	if e.DurationSeconds == nil || *e.DurationSeconds != 1650 {
		t.Errorf("entry duration_seconds = %v, want 1650", e.DurationSeconds)
	}
	if e.Incline == nil || *e.Incline != 1.5 {
		t.Errorf("entry incline = %v, want 1.5", e.Incline)
	}
	if e.AvgHeartRate == nil || *e.AvgHeartRate != 150 {
		t.Errorf("entry avg_heart_rate = %v, want 150", e.AvgHeartRate)
	}
	if e.MaxHeartRate == nil || *e.MaxHeartRate != 172 {
		t.Errorf("entry max_heart_rate = %v, want 172", e.MaxHeartRate)
	}

	// A negative heart rate is rejected by validation.
	bad := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+run.ID+"/entries", token, map[string]any{
		"distance":       5,
		"distance_unit":  "km",
		"avg_heart_rate": -5,
	})
	if bad.Status != http.StatusUnprocessableEntity {
		t.Fatalf("negative avg_heart_rate: status %d, want 422", bad.Status)
	}
}

// TestAdHocDistanceExercise_E2E proves an ad-hoc distance exercise added mid-
// session carries its distance target (PRD 0019 + 0017).
func TestAdHocDistanceExercise_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "adhoc-cardio@example.com", "supersecret1", "AdHoc")

	routine := h.createRoutine(t, token, "Legs", "")
	h.createExercise(t, token, routine, map[string]any{
		"name": "Squat", "measurement_type": "weight_reps",
		"target_sets": 3, "target_reps": 8, "primary_muscle_group": "quads",
	})
	start := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil)
	if start.Status != http.StatusCreated {
		t.Fatalf("start session: status %d body %s", start.Status, start.Body)
	}
	var sess struct {
		ID string `json:"id"`
	}
	start.decode(t, &sess)

	adhoc := h.do(t, http.MethodPost, "/api/v1/sessions/"+sess.ID+"/exercises", token, map[string]any{
		"name":                 "Treadmill Sprint",
		"measurement_type":     "distance",
		"target_distance":      2,
		"distance_unit":        "mi",
		"primary_muscle_group": "cardio",
	})
	if adhoc.Status != http.StatusCreated {
		t.Fatalf("add ad-hoc distance exercise: status %d body %s", adhoc.Status, adhoc.Body)
	}
	var sx struct {
		MeasurementType string   `json:"measurement_type"`
		TargetDistance  *float64 `json:"target_distance"`
		DistanceUnit    *string  `json:"distance_unit"`
	}
	adhoc.decode(t, &sx)
	if sx.MeasurementType != "distance" {
		t.Fatalf("measurement_type = %q, want distance", sx.MeasurementType)
	}
	if sx.TargetDistance == nil || *sx.TargetDistance != 2 {
		t.Fatalf("ad-hoc target_distance = %v, want 2", sx.TargetDistance)
	}
	if sx.DistanceUnit == nil || *sx.DistanceUnit != "mi" {
		t.Fatalf("ad-hoc distance_unit = %v, want mi", sx.DistanceUnit)
	}
}
