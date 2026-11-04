/**
 * The OAuth sign-in page. Plain server-rendered HTML with no scripts; every
 * interpolated value is HTML-escaped. Served with a strict CSP (see
 * http.ts → sendLoginPage).
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface LoginPageOptions {
  /** Sealed login state (hidden field). */
  loginToken: string
  /** Display name of the client asking for access (from DCR). */
  clientName?: string
  /** Pre-fill the identifier after a failed attempt. */
  identifier?: string
  error?: string
}

export function renderLoginPage(opts: LoginPageOptions): string {
  const client = opts.clientName ? escapeHtml(opts.clientName) : 'An MCP client'
  const error = opts.error
    ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in · Gym Assistant</title>
<style>
  :root { color-scheme: light dark; --bg:#f5f5f7; --card:#fff; --text:#1c1c1e; --muted:#6e6e73; --accent:#0a84ff; --err:#d70015; --border:#d1d1d6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#000; --card:#1c1c1e; --text:#f2f2f7; --muted:#98989d; --border:#38383a; --err:#ff453a; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px;
         background:var(--bg); color:var(--text); font:16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { width:100%; max-width:380px; background:var(--card); border-radius:16px; padding:24px; }
  h1 { font-size:22px; margin:0 0 4px; }
  p.sub { color:var(--muted); margin:0 0 20px; font-size:14px; }
  label { display:block; font-size:14px; margin:12px 0 6px; }
  input { width:100%; height:44px; padding:0 12px; border:1px solid var(--border); border-radius:10px; background:transparent; color:inherit; font-size:16px; }
  button { width:100%; height:48px; margin-top:20px; border:0; border-radius:12px; background:var(--accent); color:#fff; font-size:17px; font-weight:600; }
  .error { color:var(--err); font-size:14px; margin:0 0 8px; }
  .note { color:var(--muted); font-size:12px; margin-top:16px; }
</style>
</head>
<body>
<main>
  <h1>Gym Assistant</h1>
  <p class="sub">${client} wants <strong>read-only</strong> access to your profile and workout history.</p>
  ${error}
  <form method="post" action="/oauth/login">
    <input type="hidden" name="login_token" value="${escapeHtml(opts.loginToken)}">
    <label for="identifier">Email or username</label>
    <input id="identifier" name="identifier" autocomplete="username" required value="${escapeHtml(opts.identifier ?? '')}">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in &amp; allow</button>
  </form>
  <p class="note">Nothing can be changed through this connection. Your password is sent only to Gym Assistant and is never stored.</p>
</main>
</body>
</html>`
}
