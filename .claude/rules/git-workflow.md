# Git Workflow

## Commit Message Format

```
[scope][type] Message

# Examples:
[api][feat] Add workout-logging endpoint
[web][fix] Fix mobile responsiveness on the dashboard
[mobile][refactor] Simplify the set-timer reducer
```

### Scopes
- `api` - Backend changes (`apps/api`)
- `web` - Web frontend changes (`apps/web`)
- `mobile` - Mobile app changes (`apps/mobile`)
- `migration` - Database migrations
- `scripts` - Script changes
- `docs` - Documentation / PRD changes

### Types
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring
- `perf` - Performance improvement
- `docs` - Documentation
- `test` - Tests
- `chore` - Maintenance, tooling, dependencies

## Important rules

1. **Never push directly to `main` branch** — Always create a feature branch.
2. **Agents working in a worktree auto-open a PR to `main`** — When isolated in a worktree, commit the work, push the branch, and open a PR targeting `main` without waiting for further instruction.
3. **Never commit to a merged PR branch** — If a PR is already merged, always create a new branch from `main` instead. Before committing, verify the target branch's PR is still open (`gh pr view <number> --json state`). Pushing to a merged branch has no effect — the commits will never reach `main`.
4. **Always verify current branch before committing** — Run `git branch --show-current` before `git commit`. If on `main`, stop and create a feature branch first. Never commit directly on `main`.
5. **Always open PRs as ready for review, never as draft** — When creating a PR, use plain `gh pr create` (do not pass `--draft`). If a PR was already opened as a draft, mark it ready with `gh pr ready <number>`.
