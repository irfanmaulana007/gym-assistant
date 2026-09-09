// Package handler holds HTTP handlers: decode/validate a request, call a
// service, encode the response or an error envelope. No business logic, no SQL.
package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

// Pinger is the minimal database dependency the health handler needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// HealthHandler reports service liveness and database reachability.
type HealthHandler struct {
	db Pinger
}

// NewHealthHandler builds a HealthHandler. db may be nil (readiness will report
// the database as unconfigured rather than panicking).
func NewHealthHandler(db Pinger) *HealthHandler {
	return &HealthHandler{db: db}
}

type healthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
}

// Live is a cheap liveness probe: the process is up and serving.
func (h *HealthHandler) Live(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, healthResponse{Status: "ok", Database: "not_checked"})
}

// Ready reports readiness, including a bounded database ping. Returns 503 when
// the database is unreachable so orchestrators can hold traffic.
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	dbStatus := "unconfigured"
	code := http.StatusOK
	if h.db != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := h.db.Ping(ctx); err != nil {
			dbStatus = "unreachable"
			code = http.StatusServiceUnavailable
		} else {
			dbStatus = "ok"
		}
	}
	status := "ok"
	if code != http.StatusOK {
		status = "degraded"
	}
	httpx.JSON(w, code, healthResponse{Status: status, Database: dbStatus})
}
