# Native Mobile UX

**The web app's mobile view must look and behave like a native mobile app — not
a shrunk-down desktop website.** `apps/web` is mobile-first (single column,
`--max-width: 480px`, safe-area insets, thumb-reachable targets). Every new
surface should feel like it belongs in an iOS/Android app, using the design
tokens and native-style primitives already in `apps/web/src/styles.css`.

This rule complements [`development-best-practices.md`](development-best-practices.md)
and the mobile-first principles in
[`apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md).

## Do

- **Push full screens for navigation.** Account/profile/settings and other
  secondary surfaces are their own routes with a top nav bar + back chevron —
  the way a native app pushes a screen. Prefer this over overlays for anything
  with more than a couple of actions.
- **Use sheets for quick, contextual actions.** When an overlay is genuinely the
  right call, use a native-style **sheet** — a bottom sheet (or a panel sliding
  in from an edge) with a scrim — not a desktop popover anchored to a control.
- **Keep primary actions thumb-reachable.** Sticky bottom CTAs, large tap
  targets (≥ 44px), one-handed flows.
- **Build from the design system.** Reuse the tokens (`--sp-*`, `--radius*`,
  `--surface*`, `--safe-top/--safe-bottom`, motion tokens) and existing
  primitives (`Layout`, `NavBar`, grouped inset lists `.list-grouped`,
  `.nav-row`, `Button`). Never inline raw values.

## Don't

- **No desktop-style dropdown / popover menus** anchored to a header control
  (e.g. an avatar that opens a floating menu). This is the canonical
  anti-pattern — navigate to a screen or open a sheet instead.
- **No hover-dependent affordances.** Touch has no hover; don't hide actions
  behind hover states.
- **No multi-column desktop layouts** as the baseline. Enhance for wider
  viewports only after the mobile layout works.

## Reference implementation

The account control follows this rule: the header avatar
(`apps/web/src/components/ProfileButton.tsx`) navigates to a full **Profile**
screen (`apps/web/src/features/profile/ProfilePage.tsx`) that hosts the
identity and the logout action — replacing the earlier header dropdown.
