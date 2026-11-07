package api

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
)

// TestSentryRouteName_E2E verifies the sentryRouteName middleware (wired by
// router.New) rewrites the Sentry transaction name to chi's matched route
// pattern — "GET /api/v1/routines/{id}" — instead of the raw path containing the
// resource id. Without the middleware the name would be the raw
// "GET /api/v1/routines/<uuid>", so per-id cardinality would make the data
// ungroupable.
//
// It installs a Sentry client whose BeforeSendTransaction records the
// transaction name and drops the event (nothing leaves the process), samples
// everything, and issues one request to a parameterized route. The request is
// unauthenticated: chi still matches the route (so the pattern resolves) before
// RequireAuth returns 401, and the middleware renames the transaction after the
// chain returns. The global client is restored in t.Cleanup.
func TestSentryRouteName_E2E(t *testing.T) {
	var mu sync.Mutex
	var names []string

	prev := sentry.CurrentHub().Client()
	t.Cleanup(func() { sentry.CurrentHub().BindClient(prev) })

	if err := sentry.Init(sentry.ClientOptions{
		Dsn:           "https://publickey@o0.ingest.sentry.io/0",
		EnableTracing: true,
		TracesSampler: sentry.TracesSampler(func(sentry.SamplingContext) float64 { return 1.0 }),
		BeforeSendTransaction: func(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
			mu.Lock()
			names = append(names, event.Transaction)
			mu.Unlock()
			return nil // observe only; never send
		},
	}); err != nil {
		t.Fatalf("sentry init: %v", err)
	}

	h := newHarnessWithDB(t) // skips when no TEST_DATABASE_URL

	const id = "00000000-0000-4000-8000-000000000000"
	resp, err := http.Get(h.server.URL + "/api/v1/routines/" + id)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	resp.Body.Close()

	sentry.Flush(2 * time.Second)

	mu.Lock()
	defer mu.Unlock()
	const want = "GET /api/v1/routines/{id}"
	for _, n := range names {
		if n == want {
			return
		}
	}
	t.Fatalf("captured transaction names = %v, want one equal to %q", names, want)
}
