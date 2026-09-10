package middleware

import (
	"net/http"
	"strings"
)

// CORS returns middleware that adds cross-origin response headers for the
// browser origins in allowedOrigins. A request whose Origin is not allowed gets
// no CORS headers, so the browser blocks it. Preflight OPTIONS requests are
// answered directly with 204 (they never reach a route handler).
//
// The API authenticates with bearer tokens rather than cookies, so credentials
// are intentionally not enabled; this keeps "*" a usable wildcard value.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	wildcard := false
	for _, o := range allowedOrigins {
		o = strings.TrimSpace(o)
		switch {
		case o == "*":
			wildcard = true
		case o != "":
			allowed[o] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if _, ok := allowed[origin]; origin != "" && (wildcard || ok) {
				h := w.Header()
				if wildcard {
					h.Set("Access-Control-Allow-Origin", "*")
				} else {
					h.Set("Access-Control-Allow-Origin", origin)
					// Response varies by Origin, so caches must key on it.
					h.Add("Vary", "Origin")
				}
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "300")
			}

			// Preflight requests carry no body and expect no route handling.
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
