# Product Requirement Documents (PRD)

This directory holds Product Requirement Documents for gym-assistant. Each PRD
captures the problem, goals, design, and rollout plan for a substantial change
**before** implementation, so the approach can be reviewed and agreed on up
front.

## Naming convention

```
prd/NNNN-short-kebab-title.md
```

`NNNN` is a zero-padded sequence number (`0001`, `0002`, …). Keep the title
short and descriptive. See [`.claude/rules/prd-documents.md`](../.claude/rules/prd-documents.md)
for the full document structure.

## Index

| # | Title | Status | App |
|---|-------|--------|-----|
| [0001](0001-workout-tracking-foundation.md) | Workout Tracking Foundation | Draft | api, web |
| [0002](0002-session-lifecycle-and-metrics.md) | Session Lifecycle, Exercise Types & Metrics | Draft | api, web |
| [0003](0003-native-mobile-profile-screen.md) | Native-Mobile Profile Screen (Replace Header Dropdown) | Implemented | web |
| [0004](0004-detail-page-edit-delete.md) | Edit & Delete on Detail Pages | Approved | web |
| [0005](0005-bottom-tab-bar-and-clean-header.md) | Bottom Tab Bar & Clean Native Header | Approved | web |
| [0006](0006-exercise-catalog.md) | Exercise Catalog (Master Data) | Implemented | api, web |
| [0007](0007-analytics-dashboard.md) | Analytics Dashboard (Progress at a Glance) | Implemented | api, web |
| [0008](0008-user-profile-enrichment.md) | User Profile Enrichment (Identity, Health Data & Avatar) | Implemented | api, web |
| [0009](0009-muscle-group-diagram.md) | Muscle-Group Diagram on the Exercise Info Tab | Implemented | web |
| [0010](0010-per-set-weight-unit-input.md) | Per-Set Weight-Unit Input on the Running Session | Approved | web |

## Status values

- **Draft** — under review, not yet approved for implementation.
- **Approved** — signed off; implementation may proceed.
- **Implemented** — shipped; the PRD is retained as a design record.
- **Superseded** — replaced by a later PRD (link to it).
