package api

import (
	"net/http"
	"testing"
)

// catalogEntry is the decoded shape of one catalog row.
type catalogEntry struct {
	ID                     string   `json:"id"`
	Name                   string   `json:"name"`
	PrimaryMuscleGroup     string   `json:"primary_muscle_group"`
	SecondaryMuscleGroups  []string `json:"secondary_muscle_groups"`
	DefaultMeasurementType string   `json:"default_measurement_type"`
}

// listCatalog fetches /exercise-catalog with an optional raw query string.
func (h *harness) listCatalog(t *testing.T, token, query string) []catalogEntry {
	t.Helper()
	path := "/api/v1/exercise-catalog"
	if query != "" {
		path += "?" + query
	}
	resp := h.do(t, http.MethodGet, path, token, nil)
	if resp.Status != http.StatusOK {
		t.Fatalf("list catalog (%s): status %d body %s", query, resp.Status, resp.Body)
	}
	var out struct {
		Exercises []catalogEntry `json:"exercises"`
	}
	resp.decode(t, &out)
	return out.Exercises
}

// findCatalog returns the seeded catalog entry with the given name.
func (h *harness) findCatalog(t *testing.T, token, name string) catalogEntry {
	t.Helper()
	for _, e := range h.listCatalog(t, token, "") {
		if e.Name == name {
			return e
		}
	}
	t.Fatalf("catalog entry %q not found in seed", name)
	return catalogEntry{}
}

// TestExerciseCatalog_List_E2E verifies the seed loads and the filters work.
func TestExerciseCatalog_List_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "catalog@example.com", "supersecret1", "Cat")

	all := h.listCatalog(t, token, "")
	if len(all) < 40 {
		t.Fatalf("catalog seed = %d entries, want >= 40", len(all))
	}

	// Search filter (case-insensitive substring on name).
	bench := h.listCatalog(t, token, "search=bench")
	if len(bench) == 0 {
		t.Fatal("search=bench returned nothing")
	}
	for _, e := range bench {
		if !containsFold(e.Name, "bench") {
			t.Errorf("search=bench returned %q which lacks 'bench'", e.Name)
		}
	}

	// Muscle-group filter.
	chest := h.listCatalog(t, token, "muscle_group=chest")
	if len(chest) == 0 {
		t.Fatal("muscle_group=chest returned nothing")
	}
	for _, e := range chest {
		if e.PrimaryMuscleGroup != "chest" {
			t.Errorf("muscle_group=chest returned %q with primary %q", e.Name, e.PrimaryMuscleGroup)
		}
	}

	// Entries added in migration 0003 are present with their mapped primary
	// muscle group (no adductor/abductor enum — Hip Adductor→quads,
	// Hip Abductor→glutes).
	wantPrimary := map[string]string{
		"Hack Squat":    "quads",
		"Incline Walk":  "cardio",
		"Stair Climber": "cardio",
		"Hip Adductor":  "quads",
		"Hip Abductor":  "glutes",
	}
	for name, primary := range wantPrimary {
		e := h.findCatalog(t, token, name)
		if e.PrimaryMuscleGroup != primary {
			t.Errorf("catalog %q primary = %q, want %q", name, e.PrimaryMuscleGroup, primary)
		}
	}

	// Bad muscle-group filter is a validation error.
	bad := h.do(t, http.MethodGet, "/api/v1/exercise-catalog?muscle_group=eyebrows", token, nil)
	if bad.Status != http.StatusUnprocessableEntity {
		t.Errorf("bad muscle_group filter: status %d, want 422", bad.Status)
	}

	// Auth required.
	anon := h.do(t, http.MethodGet, "/api/v1/exercise-catalog", "", nil)
	if anon.Status != http.StatusUnauthorized {
		t.Errorf("anon catalog list: status %d, want 401", anon.Status)
	}
}

// exerciseView is the decoded read shape of a routine exercise.
type exerciseView struct {
	ID                    string   `json:"id"`
	Name                  string   `json:"name"`
	MeasurementType       string   `json:"measurement_type"`
	PrimaryMuscleGroup    string   `json:"primary_muscle_group"`
	SecondaryMuscleGroups []string `json:"secondary_muscle_groups"`
	CatalogExerciseID     *string  `json:"catalog_exercise_id"`
	CatalogName           *string  `json:"catalog_name"`
	TargetSets            *int     `json:"target_sets"`
}

// TestExerciseCatalog_LinkedExercise_E2E adds a catalog-linked exercise (targets
// only) and asserts its muscle groups resolve from the catalog on read.
func TestExerciseCatalog_LinkedExercise_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "linker@example.com", "supersecret1", "Link")
	routine := h.createRoutine(t, token, "Push Day", "")

	bench := h.findCatalog(t, token, "Barbell Bench Press")

	// Add linked exercise supplying ONLY targets + the catalog id, plus bogus
	// muscle fields that must be IGNORED (resolved from the catalog instead).
	resp := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
		"catalog_exercise_id":     bench.ID,
		"target_sets":             4,
		"target_reps":             8,
		"primary_muscle_group":    "core",             // should be ignored
		"secondary_muscle_groups": []string{"cardio"}, // should be ignored
	})
	if resp.Status != http.StatusCreated {
		t.Fatalf("create linked exercise: status %d body %s", resp.Status, resp.Body)
	}
	var created exerciseView
	resp.decode(t, &created)

	if created.CatalogExerciseID == nil || *created.CatalogExerciseID != bench.ID {
		t.Fatalf("catalog_exercise_id = %v, want %s", created.CatalogExerciseID, bench.ID)
	}
	if created.CatalogName == nil || *created.CatalogName != "Barbell Bench Press" {
		t.Errorf("catalog_name = %v, want Barbell Bench Press", created.CatalogName)
	}
	// Name defaults to the catalog name; measurement to the catalog default.
	if created.Name != "Barbell Bench Press" {
		t.Errorf("name = %q, want Barbell Bench Press (catalog default)", created.Name)
	}
	if created.MeasurementType != bench.DefaultMeasurementType {
		t.Errorf("measurement_type = %q, want %q (catalog default)", created.MeasurementType, bench.DefaultMeasurementType)
	}
	// Muscle groups resolve from the catalog, NOT the ignored request fields.
	if created.PrimaryMuscleGroup != bench.PrimaryMuscleGroup {
		t.Errorf("primary = %q, want %q (catalog)", created.PrimaryMuscleGroup, bench.PrimaryMuscleGroup)
	}
	if !equalStrings(created.SecondaryMuscleGroups, bench.SecondaryMuscleGroups) {
		t.Errorf("secondary = %v, want %v (catalog)", created.SecondaryMuscleGroups, bench.SecondaryMuscleGroups)
	}

	// Read the routine back: resolution holds on the list read too.
	detail := h.do(t, http.MethodGet, "/api/v1/routines/"+routine, token, nil)
	var routineDetail struct {
		Exercises []exerciseView `json:"exercises"`
	}
	detail.decode(t, &routineDetail)
	if len(routineDetail.Exercises) != 1 {
		t.Fatalf("routine exercises = %d, want 1", len(routineDetail.Exercises))
	}
	got := routineDetail.Exercises[0]
	if got.PrimaryMuscleGroup != bench.PrimaryMuscleGroup {
		t.Errorf("routine read primary = %q, want %q", got.PrimaryMuscleGroup, bench.PrimaryMuscleGroup)
	}

	// Start a session and assert the snapshot froze the RESOLVED muscle groups.
	start := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil)
	if start.Status != http.StatusCreated {
		t.Fatalf("start session: status %d body %s", start.Status, start.Body)
	}
	var session struct {
		ID string `json:"id"`
	}
	start.decode(t, &session)

	sessResp := h.do(t, http.MethodGet, "/api/v1/sessions/"+session.ID, token, nil)
	var sessDetail struct {
		Exercises []struct {
			NameSnapshot          string   `json:"name_snapshot"`
			PrimaryMuscleGroup    string   `json:"primary_muscle_group"`
			SecondaryMuscleGroups []string `json:"secondary_muscle_groups"`
		} `json:"exercises"`
	}
	sessResp.decode(t, &sessDetail)
	if len(sessDetail.Exercises) != 1 {
		t.Fatalf("session exercises = %d, want 1; body %s", len(sessDetail.Exercises), sessResp.Body)
	}
	snap := sessDetail.Exercises[0]
	if snap.PrimaryMuscleGroup != bench.PrimaryMuscleGroup {
		t.Errorf("snapshot primary = %q, want %q (resolved)", snap.PrimaryMuscleGroup, bench.PrimaryMuscleGroup)
	}
	if !equalStrings(snap.SecondaryMuscleGroups, bench.SecondaryMuscleGroups) {
		t.Errorf("snapshot secondary = %v, want %v (resolved)", snap.SecondaryMuscleGroups, bench.SecondaryMuscleGroups)
	}
}

// TestExerciseCatalog_CustomExercise_E2E asserts a custom (unlinked) exercise
// keeps its own muscle-group columns.
func TestExerciseCatalog_CustomExercise_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "custom@example.com", "supersecret1", "Cus")
	routine := h.createRoutine(t, token, "Accessory Day", "")

	resp := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
		"name":                    "Banded Pull-Apart",
		"primary_muscle_group":    "shoulders",
		"secondary_muscle_groups": []string{"back"},
		"target_sets":             3,
		"target_reps":             15,
	})
	if resp.Status != http.StatusCreated {
		t.Fatalf("create custom exercise: status %d body %s", resp.Status, resp.Body)
	}
	var created exerciseView
	resp.decode(t, &created)
	if created.CatalogExerciseID != nil {
		t.Errorf("custom exercise catalog_exercise_id = %v, want nil", created.CatalogExerciseID)
	}
	if created.PrimaryMuscleGroup != "shoulders" {
		t.Errorf("primary = %q, want shoulders", created.PrimaryMuscleGroup)
	}
	if !equalStrings(created.SecondaryMuscleGroups, []string{"back"}) {
		t.Errorf("secondary = %v, want [back]", created.SecondaryMuscleGroups)
	}
}

// TestExerciseCatalog_Unlink_E2E covers unlinking a catalog-linked exercise:
// clearing without a primary_muscle_group is rejected; with one it becomes
// custom.
func TestExerciseCatalog_Unlink_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "unlink@example.com", "supersecret1", "Unl")
	routine := h.createRoutine(t, token, "Legs", "")
	squat := h.findCatalog(t, token, "Barbell Back Squat")

	create := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/exercises", token, map[string]any{
		"catalog_exercise_id": squat.ID,
		"target_sets":         5,
		"target_reps":         5,
	})
	var ex exerciseView
	create.decode(t, &ex)

	// Unlink WITHOUT supplying a primary muscle group -> validation error.
	badUnlink := h.do(t, http.MethodPatch, "/api/v1/exercises/"+ex.ID, token, map[string]any{
		"catalog_exercise_id": nil,
	})
	if badUnlink.Status != http.StatusUnprocessableEntity {
		t.Errorf("unlink without primary: status %d, want 422; body %s", badUnlink.Status, badUnlink.Body)
	}

	// Unlink WITH a primary muscle group -> becomes custom.
	goodUnlink := h.do(t, http.MethodPatch, "/api/v1/exercises/"+ex.ID, token, map[string]any{
		"catalog_exercise_id":  nil,
		"primary_muscle_group": "quads",
	})
	if goodUnlink.Status != http.StatusOK {
		t.Fatalf("unlink with primary: status %d body %s", goodUnlink.Status, goodUnlink.Body)
	}
	var unlinked exerciseView
	goodUnlink.decode(t, &unlinked)
	if unlinked.CatalogExerciseID != nil {
		t.Errorf("after unlink catalog_exercise_id = %v, want nil", unlinked.CatalogExerciseID)
	}
	if unlinked.PrimaryMuscleGroup != "quads" {
		t.Errorf("after unlink primary = %q, want quads", unlinked.PrimaryMuscleGroup)
	}

	// Linking to an unknown catalog id is rejected.
	badLink := h.do(t, http.MethodPatch, "/api/v1/exercises/"+ex.ID, token, map[string]any{
		"catalog_exercise_id": "00000000-0000-0000-0000-000000000000",
	})
	if badLink.Status != http.StatusUnprocessableEntity {
		t.Errorf("link to unknown catalog: status %d, want 422; body %s", badLink.Status, badLink.Body)
	}
}

// --- small local helpers ---

func containsFold(s, sub string) bool {
	return len(sub) == 0 || indexFold(s, sub) >= 0
}

func indexFold(s, sub string) int {
	ls, lsub := toLower(s), toLower(sub)
	for i := 0; i+len(lsub) <= len(ls); i++ {
		if ls[i:i+len(lsub)] == lsub {
			return i
		}
	}
	return -1
}

func toLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
