// Package middleware holds cross-cutting HTTP concerns: authentication and
// request scoping.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

type contextKey string

const userIDKey contextKey = "userID"

// TokenVerifier verifies a bearer token and returns its subject (user ID).
type TokenVerifier interface {
	Verify(token string) (string, error)
}

// RequireAuth returns middleware that rejects requests without a valid bearer
// token and injects the authenticated user ID into the request context. The
// user ID always comes from the verified token — never from client input.
func RequireAuth(verifier TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authz := r.Header.Get("Authorization")
			const prefix = "Bearer "
			if !strings.HasPrefix(authz, prefix) {
				httpx.Error(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "missing or malformed Authorization header", nil)
				return
			}
			token := strings.TrimSpace(authz[len(prefix):])
			userID, err := verifier.Verify(token)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "invalid or expired token", nil)
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserID extracts the authenticated user ID injected by RequireAuth. The bool is
// false when the request was not authenticated.
func UserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey).(string)
	return id, ok && id != ""
}
