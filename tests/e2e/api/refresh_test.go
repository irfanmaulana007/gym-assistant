package api

import (
	"net/http"
	"testing"
)

// registerWithRefresh registers a user and returns its access + refresh tokens.
func (h *harness) registerWithRefresh(t *testing.T, email, password, name string) (access, refresh string) {
	t.Helper()
	resp := h.do(t, http.MethodPost, "/api/v1/auth/register", "", map[string]any{
		"email":        email,
		"password":     password,
		"display_name": name,
	})
	if resp.Status != http.StatusCreated {
		t.Fatalf("register %s: status %d, body %s", email, resp.Status, resp.Body)
	}
	var out struct {
		Token        string `json:"token"`
		RefreshToken string `json:"refresh_token"`
	}
	resp.decode(t, &out)
	if out.Token == "" || out.RefreshToken == "" {
		t.Fatalf("register returned empty token(s): access=%q refresh=%q", out.Token, out.RefreshToken)
	}
	return out.Token, out.RefreshToken
}

// TestRefreshFlow_E2E covers the full refresh-token lifecycle: register issues a
// refresh token, refresh rotates it (new pair, old rejected), the new access
// token authorizes /me, and logout revokes.
func TestRefreshFlow_E2E(t *testing.T) {
	h := newHarnessWithDB(t)

	_, refresh0 := h.registerWithRefresh(t, "refresh@example.com", "supersecret1", "Refresh")

	// Exchange the refresh token for a new pair.
	resp := h.do(t, http.MethodPost, "/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh0,
	})
	if resp.Status != http.StatusOK {
		t.Fatalf("refresh status = %d, body %s", resp.Status, resp.Body)
	}
	var rotated struct {
		Token        string `json:"token"`
		RefreshToken string `json:"refresh_token"`
	}
	resp.decode(t, &rotated)
	if rotated.Token == "" || rotated.RefreshToken == "" {
		t.Fatal("refresh returned empty token(s)")
	}
	if rotated.RefreshToken == refresh0 {
		t.Error("refresh token was not rotated (same value returned)")
	}

	// The new access token authorizes a protected endpoint.
	me := h.do(t, http.MethodGet, "/api/v1/auth/me", rotated.Token, nil)
	if me.Status != http.StatusOK {
		t.Fatalf("GET /me with refreshed token = %d, body %s", me.Status, me.Body)
	}

	// The old refresh token is now rejected (single-use / rotated).
	old := h.do(t, http.MethodPost, "/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh0,
	})
	if old.Status != http.StatusUnauthorized {
		t.Fatalf("reusing rotated refresh token = %d, want 401; body %s", old.Status, old.Body)
	}

	// Logout revokes the current refresh token.
	out := h.do(t, http.MethodPost, "/api/v1/auth/logout", "", map[string]any{
		"refresh_token": rotated.RefreshToken,
	})
	if out.Status != http.StatusNoContent {
		t.Fatalf("logout status = %d, want 204; body %s", out.Status, out.Body)
	}
	// After logout the refresh token no longer works.
	afterLogout := h.do(t, http.MethodPost, "/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": rotated.RefreshToken,
	})
	if afterLogout.Status != http.StatusUnauthorized {
		t.Fatalf("refresh after logout = %d, want 401; body %s", afterLogout.Status, afterLogout.Body)
	}
}

// TestRefresh_ReuseDetection_E2E verifies that replaying an already-rotated
// refresh token revokes the whole family — the newly-issued token is invalidated
// too, forcing a fresh login (defense against a stolen, replayed token).
func TestRefresh_ReuseDetection_E2E(t *testing.T) {
	h := newHarnessWithDB(t)

	_, refresh0 := h.registerWithRefresh(t, "reuse@example.com", "supersecret1", "Reuse")

	// Rotate once: refresh0 -> refresh1.
	resp := h.do(t, http.MethodPost, "/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh0,
	})
	if resp.Status != http.StatusOK {
		t.Fatalf("first refresh status = %d, body %s", resp.Status, resp.Body)
	}
	var rotated struct {
		RefreshToken string `json:"refresh_token"`
	}
	resp.decode(t, &rotated)

	// Replay the already-rotated refresh0 — must be rejected AND trip reuse
	// detection, revoking refresh1 as well.
	replay := h.do(t, http.MethodPost, "/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": refresh0,
	})
	if replay.Status != http.StatusUnauthorized {
		t.Fatalf("replay of rotated token = %d, want 401; body %s", replay.Status, replay.Body)
	}

	// refresh1 is now revoked by the reuse-detection response.
	after := h.do(t, http.MethodPost, "/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": rotated.RefreshToken,
	})
	if after.Status != http.StatusUnauthorized {
		t.Fatalf("refresh1 after reuse detection = %d, want 401; body %s", after.Status, after.Body)
	}
}

// TestRefresh_InvalidToken_E2E verifies an unknown refresh token is a generic 401.
func TestRefresh_InvalidToken_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	resp := h.do(t, http.MethodPost, "/api/v1/auth/refresh", "", map[string]any{
		"refresh_token": "not-a-real-token",
	})
	if resp.Status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body %s", resp.Status, resp.Body)
	}
}

// TestLogout_UnknownToken_E2E verifies logout is idempotent and never reveals
// whether a token existed — an unknown token still returns 204.
func TestLogout_UnknownToken_E2E(t *testing.T) {
	h := newHarnessWithDB(t)
	resp := h.do(t, http.MethodPost, "/api/v1/auth/logout", "", map[string]any{
		"refresh_token": "does-not-exist",
	})
	if resp.Status != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body %s", resp.Status, resp.Body)
	}
}
