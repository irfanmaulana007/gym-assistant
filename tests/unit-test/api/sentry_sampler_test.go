// Unit tests for observability.TracesSampler: health-probe drop, inherited
// (parent) sampling decision, and the default rate. Pure function, no network.
package api_test

import (
	"testing"

	"github.com/getsentry/sentry-go"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/observability"
)

func TestTracesSampler(t *testing.T) {
	const normal = "GET /api/v1/routines/{id}"

	tests := []struct {
		name string
		ctx  sentry.SamplingContext
		want float64
	}{
		{
			name: "health probe /healthz is never traced",
			ctx:  sentry.SamplingContext{Span: &sentry.Span{Name: "GET /healthz"}},
			want: 0.0,
		},
		{
			name: "health probe /readyz is never traced",
			ctx:  sentry.SamplingContext{Span: &sentry.Span{Name: "GET /readyz"}},
			want: 0.0,
		},
		{
			name: "health drop wins over an inherited sampled=true decision",
			ctx: sentry.SamplingContext{
				Span:          &sentry.Span{Name: "GET /healthz"},
				ParentSampled: sentry.SampledTrue,
			},
			want: 0.0,
		},
		{
			name: "inherited sampled=true is honoured",
			ctx: sentry.SamplingContext{
				Span:          &sentry.Span{Name: normal},
				ParentSampled: sentry.SampledTrue,
			},
			want: 1.0,
		},
		{
			name: "inherited sampled=false is honoured",
			ctx: sentry.SamplingContext{
				Span:          &sentry.Span{Name: normal},
				ParentSampled: sentry.SampledFalse,
			},
			want: 0.0,
		},
		{
			name: "no inherited decision falls back to the default rate",
			ctx: sentry.SamplingContext{
				Span:          &sentry.Span{Name: normal},
				ParentSampled: sentry.SampledUndefined,
			},
			want: observability.DefaultTracesSampleRate,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := observability.TracesSampler(tt.ctx); got != tt.want {
				t.Fatalf("TracesSampler() = %v, want %v", got, tt.want)
			}
		})
	}
}
