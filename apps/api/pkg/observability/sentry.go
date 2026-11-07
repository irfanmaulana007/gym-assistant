// Package observability wires self-monitoring (currently Sentry error and
// performance monitoring) into the API. It is deliberately a thin, dependency-
// light wrapper so the rest of the codebase never imports the Sentry SDK
// directly and the whole thing degrades to a no-op when unconfigured.
package observability

import (
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
)

// DefaultTracesSampleRate is a sensible default for a low-traffic personal app:
// sample a fraction of transactions for performance monitoring while always
// capturing errors.
const DefaultTracesSampleRate = 0.2

// healthTxnSuffixes are the liveness/readiness probe paths. They fire on a timer
// from the orchestrator and carry no useful performance signal, so they are
// never traced — that would just burn quota on noise.
var healthTxnSuffixes = []string{"/healthz", "/readyz"}

// TracesSampler is the Sentry performance sampling decision for a transaction.
// Precedence:
//
//  1. Health probes (/healthz, /readyz) are never traced — they fire on a timer
//     and carry no useful performance signal.
//  2. An inherited sampling decision is honoured so a distributed trace is not
//     split (head-based sampling): if the parent already decided, follow it.
//     ParentSampled covers both a local parent and a remote decision carried in
//     an incoming sentry-trace header.
//  3. Otherwise sample at DefaultTracesSampleRate.
//
// The transaction name at sampling time is "<METHOD> <path>" (e.g. "GET
// /healthz"), set by the HTTP integration before the router rewrites it to the
// route pattern.
func TracesSampler(ctx sentry.SamplingContext) float64 {
	if ctx.Span != nil {
		for _, suffix := range healthTxnSuffixes {
			if strings.HasSuffix(ctx.Span.Name, suffix) {
				return 0.0
			}
		}
	}

	switch ctx.ParentSampled {
	case sentry.SampledTrue:
		return 1.0
	case sentry.SampledFalse:
		return 0.0
	}

	return DefaultTracesSampleRate
}

// flushTimeout bounds how long InitSentry's returned flush waits for buffered
// events to drain on shutdown.
const flushTimeout = 2 * time.Second

// InitSentry initializes the Sentry SDK from the given DSN.
//
// When dsn is empty it is a safe no-op: it configures nothing and returns a
// flush func that does nothing, so the service boots normally without Sentry.
// This keeps Sentry strictly opt-in via the SENTRY_DSN environment variable.
//
// The returned flush should be deferred by the caller (main) so buffered events
// are drained on graceful shutdown.
func InitSentry(dsn, environment string) (flush func(), err error) {
	if dsn == "" {
		return func() {}, nil
	}

	err = sentry.Init(sentry.ClientOptions{
		Dsn:           dsn,
		Environment:   environment,
		EnableTracing: true,
		// TracesSampler takes precedence over TracesSampleRate; it lets us skip
		// the health probes and honour inherited decisions (see TracesSampler).
		TracesSampler: sentry.TracesSampler(TracesSampler),
	})
	if err != nil {
		return func() {}, err
	}

	return func() { sentry.Flush(flushTimeout) }, nil
}
