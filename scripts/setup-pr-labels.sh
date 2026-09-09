#!/usr/bin/env bash
#
# setup-pr-labels.sh
#
# Creates (or updates) the standard PR labels for this repository so every pull
# request carries exactly one clean, human-readable label describing what kind
# of change it is. The label is derived from the PR title's type bracket
# ([scope][type] Description). See .claude/rules/pr-labeling.md.
#
# Safe to run repeatedly: `gh label create --force` upserts each label, so
# re-running only reconciles names/colors/descriptions.
#
# Usage:
#   bash scripts/setup-pr-labels.sh
#
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) is required but not installed." >&2
  exit 1
fi

# label <name> <hex-color> <description>
label() {
  gh label create "$1" --color "$2" --description "$3" --force
}

echo "==> Creating PR labels (one per PR, derived from the title type)"
label "Feature"       "0e8a16" "New feature (feat)"
label "Improvement"   "a2eeef" "Enhancement or refactor with no new feature (refactor, perf)"
label "Bug fix"       "d73a4a" "Bug fix (fix)"
label "Chore"         "cfd3d7" "Maintenance, tooling, CI, dependencies (chore, ci, test)"
label "Documentation" "0075ca" "Documentation only (docs)"
label "Migration"     "5319e7" "Database migration (migration)"

echo "==> Done. PR labels are in sync."
