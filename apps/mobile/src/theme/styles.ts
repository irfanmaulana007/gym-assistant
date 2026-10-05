// Shared StyleSheet built from the design tokens — the RN equivalent of the
// reusable classes in apps/web/src/styles.css (.card, .nav-row, .btn, .input,
// .list-grouped, .stat, .badge, .segmented, …). Components compose these and
// never inline raw values (native-mobile-ux rule).

import { StyleSheet } from 'react-native'
import { color, radius, shadow, sp } from './tokens'

export const g = StyleSheet.create({
  main: { flex: 1, backgroundColor: color.bg },
  content: { padding: sp[4], gap: sp[4] },

  // Typography.
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: color.text },
  h2: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5, color: color.text },
  title: { fontSize: 17, fontWeight: '600', color: color.text },
  body: { fontSize: 16, color: color.text },
  muted: { color: color.textMuted },
  faint: { color: color.textFaint },
  small: { fontSize: 13 },
  center: { textAlign: 'center' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.textFaint,
    paddingHorizontal: sp[1],
  },

  // Layout primitives.
  stack: { gap: sp[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp[3] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp[3] },
  grow: { flex: 1, minWidth: 0 },
  wrap: { flexWrap: 'wrap' },

  // Cards & lists.
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.base,
    padding: sp[4],
  },
  listGrouped: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.base,
    overflow: 'hidden',
  },
  listDivider: { borderTopWidth: 1, borderTopColor: color.border },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp[3],
    padding: sp[4],
    minHeight: 64,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: color.text },
  rowSub: { color: color.textMuted, fontSize: 13, marginTop: 2 },

  // Detail rows (settings-style).
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp[3],
    padding: sp[4],
  },
  detailLabel: { color: color.textMuted, fontSize: 15 },
  detailValue: { fontWeight: '600', color: color.text, textAlign: 'right' },

  // Badges.
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: sp[2],
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: color.textMuted },
  badgeActive: { backgroundColor: color.primarySoft },
  badgeActiveText: { color: color.primary },

  // Stats grid.
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp[3] },
  stat: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.base,
    padding: sp[4],
  },
  statValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: color.text },
  statLabel: { color: color.textMuted, fontSize: 13, marginTop: 2 },

  // Empty state.
  empty: { alignItems: 'center', paddingVertical: sp[8], paddingHorizontal: sp[4], gap: sp[3] },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: color.textMuted, textAlign: 'center' },

  // Form fields.
  field: { gap: sp[2] },
  label: { fontSize: 13, fontWeight: '500', color: color.textMuted, paddingLeft: 2 },
  input: {
    backgroundColor: color.bgElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.base,
    color: color.text,
    paddingHorizontal: sp[4],
    minHeight: 50,
    fontSize: 16,
  },
  inputFocused: { borderColor: color.primary },
  errorText: { color: color.danger, fontSize: 14 },

  // Shadows.
  shadowCard: shadow.level1,
})

export const hairline = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border }
