package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

// apiResponse is a decoded HTTP response from the test API.
type apiResponse struct {
	Status int
	Body   []byte
}

// decode unmarshals the response body into dst.
func (r apiResponse) decode(t *testing.T, dst any) {
	t.Helper()
	if err := json.Unmarshal(r.Body, dst); err != nil {
		t.Fatalf("decode response (%d): %v\nbody: %s", r.Status, err, r.Body)
	}
}

// errorCode extracts error.code from a standard error envelope.
func (r apiResponse) errorCode(t *testing.T) string {
	t.Helper()
	var env struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	r.decode(t, &env)
	return env.Error.Code
}

// do performs an HTTP request against the harness server. body is JSON-encoded
// when non-nil; token, when non-empty, is sent as a bearer token.
func (h *harness) do(t *testing.T, method, path, token string, body any) apiResponse {
	t.Helper()

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, h.server.URL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return apiResponse{Status: resp.StatusCode, Body: data}
}

// registerUser is a convenience that registers a user and returns its token.
func (h *harness) registerUser(t *testing.T, email, password, name string) string {
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
		Token string `json:"token"`
	}
	resp.decode(t, &out)
	if out.Token == "" {
		t.Fatal("register returned empty token")
	}
	return out.Token
}
