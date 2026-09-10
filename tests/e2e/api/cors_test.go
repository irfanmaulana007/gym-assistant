package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/app"
)

const corsWebOrigin = "http://localhost:5173"

// newHarnessCORS builds a DB-less API server with CORS enabled for the web dev
// origin. Preflight and no-DB routes need no database, so this runs anywhere.
func newHarnessCORS(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(app.New(nil, app.Config{
		JWTSecret:      testJWTSecret,
		AllowedOrigins: []string{corsWebOrigin},
	}))
	t.Cleanup(srv.Close)
	return srv
}

// TestCORS_PreflightRegister reproduces the reported browser failure: the
// preflight OPTIONS for /auth/register must succeed with CORS headers so the
// subsequent POST is not blocked by the browser.
func TestCORS_PreflightRegister(t *testing.T) {
	srv := newHarnessCORS(t)

	req, err := http.NewRequest(http.MethodOptions, srv.URL+"/api/v1/auth/register", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Origin", corsWebOrigin)
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", resp.StatusCode, http.StatusNoContent)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != corsWebOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, corsWebOrigin)
	}
	if got := resp.Header.Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatal("missing Access-Control-Allow-Headers on preflight")
	}
}

// TestCORS_ActualResponseCarriesHeader verifies the real response (not just the
// preflight) carries the allow-origin header so the browser exposes it.
func TestCORS_ActualResponseCarriesHeader(t *testing.T) {
	srv := newHarnessCORS(t)

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/health", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Origin", corsWebOrigin)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != corsWebOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, corsWebOrigin)
	}
}
