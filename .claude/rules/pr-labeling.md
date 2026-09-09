# PR Labeling

**Every pull request MUST carry exactly one label** describing what kind of
change it is. The label is derived directly from the PR title's type bracket,
so a well-formed title already tells you which label to apply. This keeps the
PR list clean, scannable, and filterable in the GitHub UI.

We deliberately keep this to a single, flat, human-readable set — the scope
(api / web / mobile / …) already lives in the title brackets, so it does not
need its own labels.

## Labels

| Label | Title type bracket(s) | When |
|-------|----------------------|------|
| `Feature` | `feat` | New feature |
| `Improvement` | `refactor`, `perf` | Enhancement or refactor with no new feature |
| `Bug fix` | `fix` | Bug fix |
| `Chore` | `chore`, `ci`, `test` | Maintenance, tooling, CI, dependencies, tests |
| `Documentation` | `docs` | Documentation only |
| `Migration` | `migration` | Database migration |

## Deriving the label from the title

PR titles follow `[scope][type] Description` (see
[`git-workflow.md`](git-workflow.md)). To pick the label:

1. **Take the type** — the **last** bracket before the description
   (ignore scope brackets like `[api]`).
2. **Map it** to a label via the table above.

If a PR is primarily a migration, prefer `Migration` even when the type bracket
says something else.

### Examples

| Title | Label |
|-------|-------|
| `[api][feat] Add workout-logging endpoint` | `Feature` |
| `[api][migration] Add workouts table` | `Migration` |
| `[web][refactor] Extract the chart hook` | `Improvement` |
| `[docs] Add reproduce-first bug-fixing rule` | `Documentation` |
| `[scripts][chore] Bump tooling versions` | `Chore` |
| `[mobile][fix] Fix set-timer drift` | `Bug fix` |

## Applying the label

The label set is defined once in
[`scripts/setup-pr-labels.sh`](../../scripts/setup-pr-labels.sh) — run it once
per repo (or clone) to create every label:

```bash
bash scripts/setup-pr-labels.sh
```

When creating a PR, pass the derived label:

```bash
gh pr create --title "<title>" --body "<body>" --label "Feature"
```

If the label does not yet exist on the remote (e.g. the bootstrap script was
never run), run `scripts/setup-pr-labels.sh` and retry — never skip labeling.
To label an existing PR: `gh pr edit <number> --add-label "Feature"`.
