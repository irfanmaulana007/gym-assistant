package api

import (
	"net/http"
	"testing"
)

// TestAuthFlow_E2E covers the full register -> login -> me round-trip and the
// key failure modes. Requires TEST_DATABASE_URL (skips otherwise).
func TestAuthFlow_E2E(t *testing.T) {
	h := newHarnessWithDB(t)

	// Register.
	token := h.registerUser(t, "riko@example.com", "supersecret1", "Riko")

	// /me with the token returns the profile and never leaks the password hash.
	meResp := h.do(t, http.MethodGet, "/api/v1/auth/me", token, nil)
	if meResp.Status != http.StatusOK {
		t.Fatalf("GET /me status = %d, body %s", meResp.Status, meResp.Body)
	}
	var me map[string]any
	meResp.decode(t, &me)
	if me["email"] != "riko@example.com" {
		t.Errorf("me.email = %v, want riko@example.com", me["email"])
	}
	if me["display_name"] != "Riko" {
		t.Errorf("me.display_name = %v, want Riko", me["display_name"])
	}
	if _, leaked := me["password_hash"]; leaked {
		t.Error("password_hash leaked in /me response")
	}

	// Login with correct credentials.
	loginResp := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"email":    "riko@example.com",
		"password": "supersecret1",
	})
	if loginResp.Status != http.StatusOK {
		t.Fatalf("login status = %d, body %s", loginResp.Status, loginResp.Body)
	}
	var login struct {
		Token string `json:"token"`
	}
	loginResp.decode(t, &login)
	if login.Token == "" {
		t.Fatal("login returned empty token")
	}
}

func TestAuth_DuplicateEmailConflict_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	h.registerUser(t, "dup@example.com", "supersecret1", "First")

	resp := h.do(t, http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"email":        "DUP@example.com", // different case -> normalized to same
		"password":     "supersecret1",
		"display_name": "Second",
	})
	if resp.Status != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body %s", resp.Status, resp.Body)
	}
	if code := resp.errorCode(t); code != "conflict" {
		t.Errorf("error.code = %q, want conflict", code)
	}
}

func TestAuth_InvalidCredentials_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	h.registerUser(t, "real@example.com", "supersecret1", "Real")

	// Wrong password.
	resp := h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"email":    "real@example.com",
		"password": "wrongpassword",
	})
	if resp.Status != http.StatusUnauthorized {
		t.Fatalf("wrong password status = %d, want 401", resp.Status)
	}

	// Unknown email returns the same 401 (no account enumeration).
	resp = h.do(t, http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"email":    "ghost@example.com",
		"password": "supersecret1",
	})
	if resp.Status != http.StatusUnauthorized {
		t.Fatalf("unknown email status = %d, want 401", resp.Status)
	}
}

func TestAuth_ValidationError_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	resp := h.do(t, http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"email":        "bad",
		"password":     "short",
		"display_name": "",
	})
	if resp.Status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body %s", resp.Status, resp.Body)
	}
	if code := resp.errorCode(t); code != "validation_error" {
		t.Errorf("error.code = %q, want validation_error", code)
	}
}

func TestAuth_RequiresToken_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	resp := h.do(t, http.MethodGet, "/api/v1/auth/me", "", nil)
	if resp.Status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.Status)
	}
}
