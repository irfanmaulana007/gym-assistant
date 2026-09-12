package api

import (
	"net/http"
	"strings"
	"testing"
)

// registerWith registers a user with an optional username and returns the token.
func (h *harness) registerWith(t *testing.T, body map[string]any) apiResponse {
	t.Helper()
	return h.do(t, http.MethodPost, "/api/v1/auth/register", "", body)
}

// tokenFrom decodes a token out of an auth response.
func tokenFrom(t *testing.T, resp apiResponse) string {
	t.Helper()
	var out struct {
		Token string `json:"token"`
	}
	resp.decode(t, &out)
	return out.Token
}

func TestLoginByUsernameOrEmail_E2E(t *testing.T) {
	h := newHarnessWithDB(t)

	reg := h.registerWith(t, map[string]any{
		"email": "athlete@example.com", "password": "supersecret", "display_name": "Athlete", "username": "athlete1",
	})
	if reg.Status != http.StatusCreated {
		t.Fatalf("register status %d body %s", reg.Status, reg.Body)
	}
	var regBody struct {
		User struct {
			Username *string `json:"username"`
		} `json:"user"`
	}
	reg.decode(t, &regBody)
	if regBody.User.Username == nil || *regBody.User.Username != "athlete1" {
		t.Fatalf("username not returned on register: %+v", regBody.User.Username)
	}

	// Login by username.
	if r := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"identifier": "athlete1", "password": "supersecret",
	}); r.Status != http.StatusOK || tokenFrom(t, r) == "" {
		t.Fatalf("login by username status %d body %s", r.Status, r.Body)
	}

	// Login by email (via the identifier field).
	if r := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"identifier": "athlete@example.com", "password": "supersecret",
	}); r.Status != http.StatusOK || tokenFrom(t, r) == "" {
		t.Fatalf("login by email status %d body %s", r.Status, r.Body)
	}

	// Legacy email field still works.
	if r := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"email": "athlete@example.com", "password": "supersecret",
	}); r.Status != http.StatusOK {
		t.Fatalf("legacy email login status %d body %s", r.Status, r.Body)
	}

	// Wrong password is a generic 401.
	if r := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"identifier": "athlete1", "password": "wrongpass",
	}); r.Status != http.StatusUnauthorized {
		t.Fatalf("bad password status %d, want 401", r.Status)
	}
}

func TestRegisterWithoutUsername_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	reg := h.registerWith(t, map[string]any{
		"email": "nouser@example.com", "password": "supersecret", "display_name": "No User",
	})
	if reg.Status != http.StatusCreated {
		t.Fatalf("register without username status %d body %s", reg.Status, reg.Body)
	}
	var body struct {
		User struct {
			Username            *string `json:"username"`
			PreferredWeightUnit string  `json:"preferred_weight_unit"`
			PreferredHeightUnit string  `json:"preferred_height_unit"`
		} `json:"user"`
	}
	reg.decode(t, &body)
	if body.User.Username != nil {
		t.Fatalf("username should be null, got %v", *body.User.Username)
	}
	if body.User.PreferredWeightUnit != "kg" || body.User.PreferredHeightUnit != "cm" {
		t.Fatalf("preference defaults = %s/%s, want kg/cm", body.User.PreferredWeightUnit, body.User.PreferredHeightUnit)
	}
}

func TestDuplicateUsername_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	if r := h.registerWith(t, map[string]any{
		"email": "a@example.com", "password": "supersecret", "display_name": "A", "username": "dup",
	}); r.Status != http.StatusCreated {
		t.Fatalf("first register status %d", r.Status)
	}
	r := h.registerWith(t, map[string]any{
		"email": "b@example.com", "password": "supersecret", "display_name": "B", "username": "dup",
	})
	if r.Status != http.StatusConflict {
		t.Fatalf("duplicate username status %d, want 409 body %s", r.Status, r.Body)
	}
	if code := r.errorCode(t); code != "conflict" {
		t.Fatalf("error code %q, want conflict", code)
	}
}

func TestProfileUpdate_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "prof@example.com", "supersecret", "Prof")

	patch := map[string]any{
		"full_name":             "Prof Fessor",
		"gender":                "female",
		"date_of_birth":         "1992-03-04",
		"body_weight":           68.5,
		"body_weight_unit":      "kg",
		"height":                170,
		"height_unit":           "cm",
		"fitness_goal":          "build_muscle",
		"activity_level":        "active",
		"preferred_weight_unit": "lb",
		"preferred_height_unit": "in",
	}
	pr := h.do(t, http.MethodPatch, "/api/v1/auth/me", token, patch)
	if pr.Status != http.StatusOK {
		t.Fatalf("patch status %d body %s", pr.Status, pr.Body)
	}

	// Read back on GET /me.
	me := h.do(t, http.MethodGet, "/api/v1/auth/me", token, nil)
	if me.Status != http.StatusOK {
		t.Fatalf("me status %d", me.Status)
	}
	if strings.Contains(string(me.Body), "password_hash") {
		t.Fatal("/me leaked password_hash")
	}
	var u struct {
		FullName            *string  `json:"full_name"`
		Gender              *string  `json:"gender"`
		DateOfBirth         *string  `json:"date_of_birth"`
		BodyWeight          *float64 `json:"body_weight"`
		BodyWeightUnit      *string  `json:"body_weight_unit"`
		Height              *float64 `json:"height"`
		HeightUnit          *string  `json:"height_unit"`
		FitnessGoal         *string  `json:"fitness_goal"`
		ActivityLevel       *string  `json:"activity_level"`
		PreferredWeightUnit string   `json:"preferred_weight_unit"`
		PreferredHeightUnit string   `json:"preferred_height_unit"`
	}
	me.decode(t, &u)
	if u.FullName == nil || *u.FullName != "Prof Fessor" {
		t.Fatalf("full_name = %v", u.FullName)
	}
	if u.Gender == nil || *u.Gender != "female" {
		t.Fatalf("gender = %v", u.Gender)
	}
	if u.DateOfBirth == nil || !strings.HasPrefix(*u.DateOfBirth, "1992-03-04") {
		t.Fatalf("date_of_birth = %v", u.DateOfBirth)
	}
	if u.BodyWeight == nil || *u.BodyWeight != 68.5 || u.BodyWeightUnit == nil || *u.BodyWeightUnit != "kg" {
		t.Fatalf("body weight = %v %v", u.BodyWeight, u.BodyWeightUnit)
	}
	if u.PreferredWeightUnit != "lb" || u.PreferredHeightUnit != "in" {
		t.Fatalf("preferred units = %s/%s, want lb/in", u.PreferredWeightUnit, u.PreferredHeightUnit)
	}

	// Invalid enum -> 422.
	if r := h.do(t, http.MethodPatch, "/api/v1/auth/me", token, map[string]any{"gender": "banana"}); r.Status != http.StatusUnprocessableEntity {
		t.Fatalf("invalid gender status %d, want 422", r.Status)
	}
}

func TestSetEntryUnitDefaultsToPreferred_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "lifter@example.com", "supersecret", "Lifter")

	// Prefer pounds.
	if r := h.do(t, http.MethodPatch, "/api/v1/auth/me", token, map[string]any{"preferred_weight_unit": "lb"}); r.Status != http.StatusOK {
		t.Fatalf("set preference status %d body %s", r.Status, r.Body)
	}

	routine := h.createRoutine(t, token, "Push", "")
	h.addExercise(t, token, routine, map[string]any{"name": "Bench", "primary_muscle_group": "chest"})

	start := h.do(t, http.MethodPost, "/api/v1/routines/"+routine+"/sessions", token, nil)
	if start.Status != http.StatusCreated {
		t.Fatalf("start status %d body %s", start.Status, start.Body)
	}
	var session struct {
		ID        string `json:"id"`
		Exercises []struct {
			ID string `json:"id"`
		} `json:"exercises"`
	}
	start.decode(t, &session)
	sx := session.Exercises[0].ID

	// Log a set WITHOUT a weight_unit — it must default to the preferred lb.
	if r := h.do(t, http.MethodPost, "/api/v1/session-exercises/"+sx+"/entries", token, map[string]any{
		"weight": 135, "reps": 5,
	}); r.Status != http.StatusCreated {
		t.Fatalf("log entry status %d body %s", r.Status, r.Body)
	}

	get := h.do(t, http.MethodGet, "/api/v1/sessions/"+session.ID, token, nil)
	var full struct {
		Exercises []struct {
			Entries []struct {
				Weight     *float64 `json:"weight"`
				WeightUnit *string  `json:"weight_unit"`
			} `json:"entries"`
		} `json:"exercises"`
	}
	get.decode(t, &full)
	if len(full.Exercises) == 0 || len(full.Exercises[0].Entries) == 0 {
		t.Fatalf("no entries returned: %s", get.Body)
	}
	unit := full.Exercises[0].Entries[0].WeightUnit
	if unit == nil || *unit != "lb" {
		t.Fatalf("entry weight_unit = %v, want lb (from preference)", unit)
	}
}

func TestAvatar_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "ava@example.com", "supersecret", "Ava")

	// Set a small valid avatar.
	avatar := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	if r := h.do(t, http.MethodPatch, "/api/v1/auth/me", token, map[string]any{"avatar_url": avatar}); r.Status != http.StatusOK {
		t.Fatalf("set avatar status %d body %s", r.Status, r.Body)
	}
	me := h.do(t, http.MethodGet, "/api/v1/auth/me", token, nil)
	var u struct {
		AvatarURL *string `json:"avatar_url"`
	}
	me.decode(t, &u)
	if u.AvatarURL == nil || *u.AvatarURL != avatar {
		t.Fatalf("avatar not stored: %v", u.AvatarURL)
	}

	// Clear it with null.
	if r := h.do(t, http.MethodPatch, "/api/v1/auth/me", token, map[string]any{"avatar_url": nil}); r.Status != http.StatusOK {
		t.Fatalf("clear avatar status %d", r.Status)
	}
	me = h.do(t, http.MethodGet, "/api/v1/auth/me", token, nil)
	me.decode(t, &u)
	if u.AvatarURL != nil {
		t.Fatalf("avatar not cleared: %v", *u.AvatarURL)
	}

	// Oversized avatar -> 422.
	oversized := "data:image/png;base64," + strings.Repeat("A", 300*1024)
	if r := h.do(t, http.MethodPatch, "/api/v1/auth/me", token, map[string]any{"avatar_url": oversized}); r.Status != http.StatusUnprocessableEntity {
		t.Fatalf("oversized avatar status %d, want 422", r.Status)
	}
}

func TestUsernameTakenViaPatch_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	if r := h.registerWith(t, map[string]any{
		"email": "owner@example.com", "password": "supersecret", "display_name": "Owner", "username": "taken",
	}); r.Status != http.StatusCreated {
		t.Fatalf("register owner status %d", r.Status)
	}
	other := h.registerUser(t, "other@example.com", "supersecret", "Other")
	r := h.do(t, http.MethodPatch, "/api/v1/auth/me", other, map[string]any{"username": "taken"})
	if r.Status != http.StatusConflict {
		t.Fatalf("username-taken PATCH status %d, want 409 body %s", r.Status, r.Body)
	}
}

func TestChangePassword_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	token := h.registerUser(t, "pw@example.com", "originalpass", "PW")

	// Wrong current password -> 401.
	if r := h.do(t, http.MethodPost, "/api/v1/auth/change-password", token, map[string]any{
		"current_password": "notitatall", "new_password": "brandnewpass",
	}); r.Status != http.StatusUnauthorized {
		t.Fatalf("wrong current status %d, want 401", r.Status)
	}

	// Too-short new password -> 422.
	if r := h.do(t, http.MethodPost, "/api/v1/auth/change-password", token, map[string]any{
		"current_password": "originalpass", "new_password": "short",
	}); r.Status != http.StatusUnprocessableEntity {
		t.Fatalf("short new password status %d, want 422", r.Status)
	}

	// Correct current -> 204.
	if r := h.do(t, http.MethodPost, "/api/v1/auth/change-password", token, map[string]any{
		"current_password": "originalpass", "new_password": "brandnewpass",
	}); r.Status != http.StatusNoContent {
		t.Fatalf("change password status %d, want 204 body %s", r.Status, r.Body)
	}

	// New password logs in; old one is rejected.
	if r := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"identifier": "pw@example.com", "password": "brandnewpass",
	}); r.Status != http.StatusOK {
		t.Fatalf("login with new password status %d", r.Status)
	}
	if r := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"identifier": "pw@example.com", "password": "originalpass",
	}); r.Status != http.StatusUnauthorized {
		t.Fatalf("login with old password status %d, want 401", r.Status)
	}
}
