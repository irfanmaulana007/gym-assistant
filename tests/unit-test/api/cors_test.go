// Unit tests for CORS behavior on the assembled API handler. They run in-process
// against app.New with an httptest recorder — no network, no database.
package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/app"
)

const webOrigin = "http://localhost:5173"

func corsHandler(t *testing.T, origins ...string) http.Handler {
	t.Helper()
	return app.New(nil, app.Config{JWTSecret: "unit-secret", AllowedOrigins: origins})
}

func TestCORS_AllowedOriginGetsHeader(t *testing.T) {
	h := corsHandler(t, webOrigin)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	req.Header.Set("Origin", webOrigin)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != webOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, webOrigin)
	}
}

func TestCORS_DisallowedOriginGetsNoHeader(t *testing.T) {
	h := corsHandler(t, webOrigin)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	req.Header.Set("Origin", "http://evil.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty for disallowed origin", got)
	}
}

func TestCORS_PreflightShortCircuits(t *testing.T) {
	h := corsHandler(t, webOrigin)

	// A preflight for register must be answered directly (204) without hitting
	// the DB-backed route handler.
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/auth/register", nil)
	req.Header.Set("Origin", webOrigin)
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != webOrigin {
		t.Fatalf("preflight Access-Control-Allow-Origin = %q, want %q", got, webOrigin)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatal("preflight missing Access-Control-Allow-Methods")
	}
}

func TestCORS_Wildcard(t *testing.T) {
	h := corsHandler(t, "*")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	req.Header.Set("Origin", "http://anything.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want *", got)
	}
}
