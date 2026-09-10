# PRD 0003 — Native-Mobile Profile Screen (Replace Header Dropdown)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Implemented |
| Created | 2026-09-10 |
| Updated | 2026-09-10 |
| App | web |
| Related rule | [`.claude/rules/native-mobile-ux.md`](../.claude/rules/native-mobile-ux.md) |

## 1. Summary

The web app's mobile view should feel like a **native mobile app**, not a
shrunk-down desktop site. The top-right account control was a **desktop-style
dropdown/popover** anchored to the avatar — a web pattern that is out of place
on a phone.

This change **replaces that dropdown with a full Profile screen**: tapping the
avatar in the nav bar navigates to `/profile`, a native-style screen (top nav
bar + back chevron) that shows the signed-in identity and hosts the **Logout**
action. It also codifies the underlying principle as a repo rule so future UI
work follows the native-mobile pattern by default.

## 2. Problem & motivation

- A floating popover menu anchored to a header control is a desktop affordance.
  Native mobile apps push a screen (or open a sheet) for account/settings.
- Logout — a meaningful, occasional action — was buried in a transient popover.
  A dedicated Profile screen is more discoverable and gives room to grow
  (units preference, theme, etc.) without cramming a popover.

## 3. Goals

- Remove the header dropdown/popover entirely.
- Tapping the avatar navigates to a full **Profile** screen.
- The Profile screen shows the user's name + email and hosts **Logout**.
- Establish a durable **native-mobile-UX rule** (no desktop dropdowns; push
  screens or use sheets) referenced from the root and web `CLAUDE.md`.

## 4. Non-goals

- No API changes — profile is composed entirely from the existing `me` /
  auth data. No new endpoints or schema.
- No new account settings (units, theme, password change) yet — the screen is
  structured to accommodate them later.

## 5. Design

- **`ProfileButton`** (`apps/web/src/components/ProfileButton.tsx`) — replaces
  `ProfileMenu`. Renders the initials avatar; `onClick` navigates to `/profile`.
  No popover, no menu state.
- **`ProfilePage`** (`apps/web/src/features/profile/ProfilePage.tsx`) — a
  protected route at `/profile` using the shared `Layout` (title "Profile",
  back → Workouts). Centered identity header (large avatar, name, email), an
  "Account" grouped inset list (email, member-since), and a destructive
  **Logout** button that calls `useAuth().logout()`. `ProtectedRoute` redirects
  to `/login` once the session clears.
- **Styling** reuses existing design tokens and primitives in `styles.css`; the
  dead `.menu*` popover styles are removed and replaced with `.profile-*` rules.

## 6. Testing

- **Unit** (`tests/unit-test/web/`): `ProfileButton.test.tsx` (avatar shows
  initials; tap navigates to the profile screen, never opens a menu) and
  `ProfilePage.test.tsx` (identity renders; logout clears the token).
- **E2E** (`tests/e2e/web/navigation.spec.ts`): register → tap avatar → Profile
  screen shows identity + logout → logout returns to `/login`. `auth.spec.ts`
  updated to the same flow.

## 7. Rollout

Pure web UI change, no migration or API coordination. Ships behind the standard
`lint` / `typecheck` / `build` + unit + e2e gates.
