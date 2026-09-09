// Unit tests for the shared HTTP helpers (apps/api/pkg/httpx). These are pure,
// need no database, and run fast.
package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

func TestErrorEnvelopeShape(t *testing.T) {
	rec := httptest.NewRecorder()
	httpx.Error(rec, http.StatusNotFound, httpx.CodeNotFound, "resource not found", map[string]any{"id": "abc"})

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type = %q, want application/json", ct)
	}

	var env httpx.ErrorEnvelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if env.Error.Code != httpx.CodeNotFound {
		t.Errorf("code = %q, want %q", env.Error.Code, httpx.CodeNotFound)
	}
	if env.Error.Message != "resource not found" {
		t.Errorf("message = %q", env.Error.Message)
	}
	if env.Error.Details["id"] != "abc" {
		t.Errorf("details.id = %v, want abc", env.Error.Details["id"])
	}
}

func TestWriteError_APIError(t *testing.T) {
	rec := httptest.NewRecorder()
	httpx.WriteError(rec, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict, "already exists"))

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}
	var env httpx.ErrorEnvelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if env.Error.Code != httpx.CodeConflict {
		t.Errorf("code = %q, want %q", env.Error.Code, httpx.CodeConflict)
	}
}

func TestWriteError_GenericErrorIsHidden(t *testing.T) {
	rec := httptest.NewRecorder()
	// A non-APIError must never leak its message to the client.
	httpx.WriteError(rec, errSentinel("db exploded: secret connection string"))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	var env httpx.ErrorEnvelope
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Error.Code != httpx.CodeInternal {
		t.Errorf("code = %q, want %q", env.Error.Code, httpx.CodeInternal)
	}
	if strings.Contains(env.Error.Message, "secret") {
		t.Errorf("internal error message leaked to client: %q", env.Error.Message)
	}
}

func TestDecodeJSON_RejectsUnknownFieldsAndEmptyBody(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
	}

	// Empty body -> bad_request.
	{
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(""))
		var p payload
		err := httpx.DecodeJSON(req, &p)
		if err == nil {
			t.Fatal("expected error for empty body")
		}
	}
	// Unknown field -> error.
	{
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"a","x":1}`))
		var p payload
		if err := httpx.DecodeJSON(req, &p); err == nil {
			t.Fatal("expected error for unknown field")
		}
	}
	// Valid -> ok.
	{
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"a"}`))
		var p payload
		if err := httpx.DecodeJSON(req, &p); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Name != "a" {
			t.Errorf("name = %q, want a", p.Name)
		}
	}
}

type errSentinel string

func (e errSentinel) Error() string { return string(e) }
