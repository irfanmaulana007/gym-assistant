# PRD 0005 — Bottom Tab Bar & Clean Native Header

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Approved |
| Created | 2026-09-11 |
| Updated | 2026-09-11 |
| App | web |

## Problem

The web app's mobile view puts buttons in the top nav bar — the account avatar
on every screen, plus per-screen action buttons (`+` new workout day, `+` add
exercise, ✏️ edit). Real native apps keep the header clean: just a back chevron
on the left and a centered title. Actions live elsewhere — a bottom tab bar for
top-level navigation (Instagram-style) and thumb-reachable in-content controls
(a floating `+` / sticky CTA) for contextual actions.

This violates the spirit of [`native-mobile-ux.md`](../.claude/rules/native-mobile-ux.md):
a header crowded with an avatar and action buttons reads as a shrunk website,
not a native app.

## Goals

- **Clean header everywhere.** The top nav bar shows only the back chevron
  (left) and the title (center). No avatar, no action buttons on the right.
- **Bottom tab bar for top-level navigation.** A fixed bottom navigation bar
  (like Instagram) with **Home** (Workouts) and **Profile** tabs, shown on the
  root screens. The account/profile entry point moves here from the header.
- **Contextual actions stay reachable.** The `+` actions become a floating
  action button (FAB); ✏️ edit moves into the page body as an inline control.

## Non-goals

- No change to the API, data model, or any business logic.
- No new top-level destinations beyond Home and Profile (the tab set can grow in
  a later PRD, e.g. History/Stats).
- No change to pushed/detail screens' back-chevron behavior.

## Design

### Navigation model

| Screen | Route | Header | Bottom tab bar |
|--------|-------|--------|----------------|
| Workouts (home) | `/` | title only | **yes** — Home active |
| Profile | `/profile` | title only | **yes** — Profile active |
| Routine detail | `/routines/:id` | back + title | no |
| Exercise history | `/exercises/:id/history` | back + title | no |
| Active session | `/sessions/:id` | title (focused flow) | no |

Root screens (Home, Profile) show the tab bar and have **no** back chevron —
switching tabs is lateral navigation. Pushed screens hide the tab bar and show a
back chevron, exactly like a native app pushing a screen over the tab bar.
Profile is now reached by tapping the **Profile** tab (previously the header
avatar), so it no longer carries a back chevron.

### Header

`NavBar` drops its `action` and `showProfile` props and the `ProfileButton`.
The three-column grid (`left / center / right`) is kept for balance so the title
stays optically centered; the right column is empty. `ProfileButton.tsx` is
removed (its only consumer was the header).

### Bottom tab bar

A new `BottomNav` component: a `sticky`, bottom-anchored bar inside the centered
app shell (so it stays within `--max-width` on desktop), translucent/blurred to
match the top nav, honoring `--safe-bottom`. Each tab is a `Link` with an icon +
label; the active tab (matched from the current route) is tinted `--primary`.
Rendered by `Layout` when a new `bottomNav` prop is set.

### Contextual actions

Per the chosen direction (sticky bottom CTA + FAB):

- **New workout day** (Home) and **Add exercise** (Routine detail) become a
  **FAB** — a circular `--primary` button floating bottom-right, positioned
  clear of the tab bar / existing sticky "Start workout" CTA. It keeps the same
  accessible names ("New workout day", "Add exercise").
- **Edit workout day** / **Edit exercise** move into the page body as an inline
  ghost button (right-aligned `detail-actions` row), keeping the same accessible
  names ("Edit workout day", "Edit exercise").

All new surfaces are built from existing tokens (`--sp-*`, `--radius*`,
`--surface*`, `--primary`, `--safe-bottom`, motion tokens) — no inlined raw
values.

## Rollout

Single web PR. No migration, no API change, no feature flag. Existing e2e/unit
tests that drove the header avatar are updated to drive the new tab bar; tests
that relied on the action buttons' accessible names keep working because those
names are preserved on the relocated FAB/inline controls.

## Testing

- **Unit** — `BottomNav` renders Home/Profile tabs, marks the active one from
  the route, and links to `/` and `/profile`; the clean header renders no
  avatar/action.
- **E2E** — the Profile tab in the bottom bar opens the Profile screen and
  exposes logout; the header shows no avatar; contextual add/edit still work.
