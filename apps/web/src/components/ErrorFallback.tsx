// Full-screen fallback rendered by the top-level Sentry <ErrorBoundary> when the
// app tree throws. It intentionally does NOT use Layout/NavBar: those depend on
// the router, which lives inside <App> and may be exactly what failed. So it is
// self-contained, built from the design-system tokens and the shared `.btn`
// primitives, with safe-area padding and a full-width, thumb-reachable Reload
// CTA (per .claude/rules/native-mobile-ux.md).
export function ErrorFallback() {
  return (
    <div className="error-fallback" role="alert">
      <div className="error-fallback-body">
        <h1 className="error-fallback-title">Something went wrong</h1>
        <p className="error-fallback-text">
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </div>
  )
}
