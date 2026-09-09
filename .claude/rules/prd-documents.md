# PRD Documents

**All Product Requirement Documents (PRDs) live in the root [`prd/`](../../prd/)
directory — nowhere else.** A PRD captures the problem, goals, design, and
rollout plan for a substantial change *before* implementation, so the approach
can be reviewed and agreed on up front. Do not scatter PRDs under
[`documentations/`](../../documentations/), app folders, or alongside code — if
a document is a PRD, it belongs in `prd/`.

See [`prd/README.md`](../../prd/README.md) for the canonical index, status
values, and the authoritative copy of these conventions.

## Naming convention

```
prd/NNNN-short-kebab-title.md
```

- `NNNN` — a zero-padded, monotonically increasing sequence number (`0001`,
  `0002`, …). Pick the next unused number by checking the highest existing file
  in `prd/`.
- `short-kebab-title` — a short, descriptive kebab-case slug of the feature.

## Document structure

Every PRD starts with a numbered title and a metadata table:

```markdown
# PRD NNNN — Human Readable Title

| Field | Value |
|-------|-------|
| Author | <person> |
| Status | Draft |
| Created | YYYY-MM-DD |
| Updated | YYYY-MM-DD |
| App | <affected app: api / web / mobile> |
```

- Additional metadata rows (Related PRs, Related docs, Source inputs, …) may be
  appended after the standard fields.
- `Status` must be one of the values defined in `prd/README.md`: **Draft**,
  **Approved**, **Implemented**, **Superseded**.
- Follow the standard fields above so every PRD is scannable the same way.

## When you add or move a PRD

1. Place (or move) the file into `prd/` using the naming convention above.
2. Give it the numbered title + metadata table structure.
3. **Update the index table in [`prd/README.md`](../../prd/README.md)** with a
   new row (`#`, Title, Status, App) — an unindexed PRD is easy to miss.
