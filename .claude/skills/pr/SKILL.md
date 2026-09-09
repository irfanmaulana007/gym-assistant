---
name: pr
description: Create a pull request to the main branch with a detailed, structured description (summary, changes, test plan), auto-creating a feature branch off main when the working tree is on main, and following the project's git workflow. Use when the user asks to open or create a PR for the current changes.
---

# Create Pull Request

Create a pull request to main branch with a detailed description.

## Instructions

1. First, check the current branch:
   ```bash
   git branch --show-current
   ```

2. If on `main` branch:
   - First, pull the latest main: `git pull origin main`
   - Check `git status` and `git log --oneline -5` to understand the current state
   - If there are staged/unstaged changes or unpushed commits, **auto-create a feature branch**:
     - Derive a branch name from the changes (e.g., `feat/short-description` or `fix/short-description`)
     - Run `git checkout -b <branch-name>` to create and switch to the new branch
     - Continue with the PR flow
   - If there are no changes at all (clean working tree, no unpushed commits), inform the user there's nothing to create a PR for

3. Get the commits that will be included in the PR (commits since diverging from main):
   ```bash
   git log main..HEAD --oneline
   ```

4. Get the full diff to understand all changes:
   ```bash
   git diff main...HEAD
   ```

4b. Determine scope by checking which directories have changes:
   ```bash
   git diff main...HEAD --name-only
   ```
   Map changed top-level directories to scope brackets:
   - `apps/api/` → `[api]`
   - `apps/web/` → `[web]`
   - `apps/mobile/` → `[mobile]`
   - `tests/` → `[tests]`
   - `.claude/` → `[claude]`
   - `documentations/` → `[docs]`
   - `prd/` → `[prd]`

   Include every scope that has changes (e.g. both `[api][web]`).

5. Analyze ALL commits and the full diff thoroughly, then generate a well-structured PR description:

   **Title Guidelines:**
   - Format: `[scope][type] Description`
   - **Scope**: `[api]`, `[web]`, `[mobile]`, etc. — based on which folders have changes; combine multiple (e.g. `[api][web]`)
   - **Type**: `[feat]`, `[fix]`, `[refactor]`, `[chore]`, `[docs]`, `[test]`
   - **Description**: Concise summary of the change
   - Examples:
     - `[web][feat] Add dark mode toggle`
     - `[api][fix] Fix workout timezone calculation`
     - `[api][web][feat] Log workout sessions end to end`

   **Summary Section:**
   - Write 2-4 bullet points capturing the HIGH-LEVEL purpose of the PR
   - Focus on WHAT was achieved and WHY, not implementation details
   - Each bullet should be a complete, standalone statement
   - Start with action verbs (Add, Implement, Fix, Update, Remove, Refactor)

   **Changes Section:**
   - Group changes by file or logical area
   - Use format: `**\`path/to/file.ts\`**: Description of what changed`
   - Be specific about what was added, modified, or removed
   - Mention new functions, components, or configurations by name
   - Include relevant technical details (new dependencies, API changes, etc.)
   - For large PRs, organize under subheadings (e.g., "### Backend", "### Frontend")

   **Test Plan Section:**
   - Provide step-by-step instructions to verify the changes work
   - Use checkbox format for actionable test steps
   - Include setup steps if needed (env vars, dependencies, etc.)
   - Cover both happy path and edge cases where relevant
   - For bug fixes, describe how to verify the bug is fixed

   **Optional Sections (include when relevant):**
   - **Breaking Changes**: List any breaking changes prominently at the top
   - **Screenshots**: For UI changes, mention screenshots should be added
   - **Related Issues**: Reference related issues with `Fixes #123` or `Related to #456`

6. Show the user the generated PR title and description.

7. Push the branch (if not already pushed) and create the PR:
   ```bash
   git push -u origin <branch-name>
   gh pr create --title "<title>" --body "<body>"
   ```
   If this repo has PR labels configured, add exactly one `--label` derived from the
   title's **type** bracket (the last bracket before the description):
   - `feat` → `Feature`
   - `refactor`, `perf` → `Improvement`
   - `fix` → `Bug fix`
   - `chore`, `ci`, `test` → `Chore`
   - `docs` → `Documentation`

   If the label does not exist on the remote, skip it rather than failing the PR.

## PR Description Template

```markdown
## Summary
- [High-level description of what this PR achieves]
- [Another key change or improvement]
- [Why this change was needed - the motivation]

## Changes
- **`path/to/file1.ts`**: [Specific description of changes in this file]
- **`path/to/file2.tsx`**: [What was added/modified/removed]
- **`path/to/config.json`**: [Configuration changes]

## Test Plan
- [ ] [Setup step if needed, e.g., "Set `ENV_VAR=value` in `.env`"]
- [ ] [First verification step]
- [ ] [Second verification step]
- [ ] [Edge case or error scenario to test]

---
Generated with [Claude Code](https://claude.ai/code)
```

## Notes
- Always target `main` branch
- Review ALL commits, not just the latest one - the PR description should reflect the entire changeset
- Be specific with file paths and function/component names
- Mention any breaking changes prominently at the TOP of the description
- For UI changes, suggest adding screenshots
- Keep descriptions scannable - use formatting (bold, code blocks) effectively
- **PR Title Format**: `[scope][type] Description`
  - Always include scope and type brackets
  - Scope is determined by which folders have changes (`api`, `web`, `mobile`, etc.)
