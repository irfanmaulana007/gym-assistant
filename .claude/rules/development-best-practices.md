# Development Best Practices

## Project layout

This is a monorepo with three applications under [`apps/`](../../apps/):

- `apps/api` — backend service
- `apps/web` — web frontend
- `apps/mobile` — mobile app

Shared supporting directories: [`prd/`](../../prd/) (product requirement documents), [`documentations/`](../../documentations/) (reference docs), and [`tests/`](../../tests/) (`unit-test/` and `e2e/`).

## Languages & Build

This project primarily uses TypeScript. When making changes, follow the existing patterns and tooling **of the app you are touching** — each app under `apps/` owns its own dependencies, scripts, and config. After changes, run that app's lint, type-check, and build commands (e.g. the `lint`, `typecheck`/`tsc`, and `build` scripts in its `package.json`) before considering the work done. Refer to a directory-specific `CLAUDE.md` when one exists.

## Code Quality

- Follow existing patterns in the repository as the source of truth
- Keep changes scoped to one app unless the change is genuinely cross-cutting
- Prefer the conventions already established in the app over introducing new ones

## Security

- Never hardcode secrets, API keys, or credentials — use environment variables / config
- Validate and sanitize all user inputs
- Use parameterized queries to prevent SQL injection
- Follow OWASP security guidelines

## Code Style

- Follow existing naming conventions in the codebase
- Keep functions focused and single-purpose
- Write self-documenting code with clear names
- Add comments only when the logic is not self-evident
