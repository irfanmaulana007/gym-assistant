package api

import (
	"net/http"
	"testing"
)

// TestSentryMiddleware_RoundTrip exercises the assembled API — which now mounts
// the Sentry recover/tracing HTTP middleware in its chain — over real HTTP and
// asserts a normal request still round-trips to 200. Sentry is a no-op here (no
// DSN initialized in the test), so this proves the added middleware integrates
// into the router chain without breaking the request→response flow.
//
// A true end-to-end assertion that captured events actually reach Sentry
// requires a live DSN and network egress, which the suite deliberately avoids;
// the behavioral guarantees of the init helper are covered by the unit test in
// tests/unit-test/api/sentry_test.go.
func TestSentryMiddleware_RoundTrip(t *testing.T) {
	h := newHarnessNoDB(t)

	resp, err := http.Get(h.server.URL + "/api/v1/health")
	if err != nil {
		t.Fatalf("GET /api/v1/health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (Sentry middleware must not break the chain)", resp.StatusCode)
	}
}
