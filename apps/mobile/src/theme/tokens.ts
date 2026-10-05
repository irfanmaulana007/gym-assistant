// Design tokens — ported verbatim from the web design system
// (apps/web/src/styles.css `:root`). This is the single source of visual truth
// for the native app; screens and components build from these tokens and never
// inline raw values (per .claude/rules/native-mobile-ux.md).
//
// The values here MUST stay in lockstep with the web `:root` tokens. The
// mobile ↔ web parity is asserted by a unit test
// (tests/unit-test/mobile/theme.test.ts) that reads styles.css and compares.
//
// The muscle / usage hexes additionally mirror muscleDiagram.ts
// (PRIMARY_HEX / SECONDARY_HEX / USAGE_TIER_HEXES) so the SVG diagrams and the
// legend swatches never drift (the PRD 0009 / 0011 constraint).

export const color = {
  bg: '#0b0f17',
  bgElevated: '#0f1420',
  surface: '#151b28',
  surface2: '#1d2534',
  surface3: '#29323f',
  surfacePress: '#232c3d',
  // RN has no color-mix(); these are the web rgba() tokens resolved literally.
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  text: '#f3f6fc',
  textMuted: '#8a97ac',
  textFaint: '#5d6879',
  primary: '#2fd477',
  primaryPress: '#22b463',
  primaryInk: '#04150b',
  primarySoft: 'rgba(47, 212, 119, 0.14)',
  danger: '#ff5b60',
  dangerSoft: 'rgba(255, 91, 96, 0.12)',
  accent: '#6aa8ff',

  // Muscle-diagram legend colors — mirror --muscle-primary / --muscle-secondary
  // and muscleDiagram.ts PRIMARY_HEX / SECONDARY_HEX.
  musclePrimary: '#dc2626',
  muscleSecondary: '#f59e0b',

  // Muscle-usage intensity scale (yellow → orange → red), least → most trained.
  // Mirrors --muscle-usage-1..4 and (reversed) USAGE_TIER_HEXES.
  muscleUsage1: '#fde047',
  muscleUsage2: '#f59e0b',
  muscleUsage3: '#f97316',
  muscleUsage4: '#dc2626',
} as const

// Spacing scale (px) — --sp-1 … --sp-12.
export const sp = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
} as const

export const gap = sp[4]

// Radius scale.
export const radius = {
  sm: 8,
  base: 14,
  lg: 20,
  pill: 999,
} as const

// Elevation — RN shadow objects approximating the web box-shadows. iOS uses the
// shadow* props; Android uses elevation.
export const shadow = {
  level1: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  menu: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  cta: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const

// Layout.
export const layout = {
  maxWidth: 480,
  headerH: 52,
  bottomNavH: 58,
} as const

// Motion — durations (ms) and the shared easing bezier control points.
export const motion = {
  durFast: 120,
  durBase: 200,
  // cubic-bezier(0.2, 0.8, 0.2, 1)
  easeBezier: [0.2, 0.8, 0.2, 1] as const,
} as const

// Typography — the web uses the -apple-system stack; on iOS that resolves to San
// Francisco, which RN picks up as the platform default (fontFamily undefined).
export const font = {
  family: undefined as string | undefined, // iOS system font (San Francisco)
  baseSize: 16,
  lineHeight: 1.4,
} as const

export type ColorToken = keyof typeof color
