// Unit tests for the Sentry init helper. They assert the helper is a safe no-op
// when no DSN is configured and that it wires up a Sentry client when a DSN is
// supplied. No network: sentry.Init only builds the client/transport; nothing is
// sent unless an event is captured and flushed.
package api_test

import (
	"testing"

	"github.com/getsentry/sentry-go"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/observability"
)

// TestInitSentry_NoDSNIsNoop verifies that an empty DSN leaves Sentry
// unconfigured (the service must still boot without Sentry) and returns a
// callable, non-nil flush.
func TestInitSentry_NoDSNIsNoop(t *testing.T) {
	before := sentry.CurrentHub().Client()

	flush, err := observability.InitSentry("", "test")
	if err != nil {
		t.Fatalf("InitSentry with empty DSN returned error: %v", err)
	}
	if flush == nil {
		t.Fatal("InitSentry returned a nil flush func")
	}
	flush() // must not panic even when nothing was initialized

	if after := sentry.CurrentHub().Client(); after != before {
		t.Fatal("InitSentry with an empty DSN must not configure a Sentry client")
	}
}

// TestInitSentry_WithDSNConfiguresClient verifies that a valid DSN installs a
// Sentry client on the current hub and returns a non-nil flush.
func TestInitSentry_WithDSNConfiguresClient(t *testing.T) {
	const dsn = "https://publickey@o0.ingest.sentry.io/0"

	flush, err := observability.InitSentry(dsn, "test")
	if err != nil {
		t.Fatalf("InitSentry with a valid DSN returned error: %v", err)
	}
	if flush == nil {
		t.Fatal("InitSentry returned a nil flush func")
	}
	defer flush()

	if sentry.CurrentHub().Client() == nil {
		t.Fatal("InitSentry with a DSN must configure a Sentry client on the current hub")
	}
}
