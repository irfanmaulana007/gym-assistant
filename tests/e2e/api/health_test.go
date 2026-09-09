package api

import (
	"encoding/json"
	"net/http"
	"testing"
)

// TestHealthLiveness_E2E exercises the liveness probe over real HTTP. It needs
// no database, so it runs in every environment.
func TestHealthLiveness_E2E(t *testing.T) {
	h := newHarnessNoDB(t)

	for _, path := range []string{"/healthz", "/api/v1/health"} {
		resp, err := http.Get(h.server.URL + path)
		if err != nil {
			t.Fatalf("GET %s: %v", path, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("GET %s status = %d, want 200", path, resp.StatusCode)
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
		resp.Body.Close()
		if body.Status != "ok" {
			t.Errorf("GET %s status field = %q, want ok", path, body.Status)
		}
	}
}

// TestNotFoundEnvelope_E2E verifies unknown routes return the standard error
// envelope over real HTTP.
func TestNotFoundEnvelope_E2E(t *testing.T) {
	h := newHarnessNoDB(t)

	resp, err := http.Get(h.server.URL + "/api/v1/does-not-exist")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if env.Error.Code != "not_found" {
		t.Errorf("error.code = %q, want not_found", env.Error.Code)
	}
}

// TestReadiness_E2E checks the readiness probe reports the database as reachable
// when a test database is configured.
func TestReadiness_E2E(t *testing.T) {
	h := newHarnessWithDB(t)

	resp, err := http.Get(h.server.URL + "/readyz")
	if err != nil {
		t.Fatalf("GET /readyz: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Status   string `json:"status"`
		Database string `json:"database"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Database != "ok" {
		t.Errorf("database = %q, want ok", body.Database)
	}
}
