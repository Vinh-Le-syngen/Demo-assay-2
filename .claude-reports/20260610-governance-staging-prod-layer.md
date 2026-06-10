# Staging→Production Governance Layer

**Date:** 2026-06-10
**Status:** SUCCESS (protections live; governance docs merged to staging and promoted to main; CODEOWNERS bound)

## What Was Done
- Confirmed repo is a **private personal-account repo** (`sinuhearroyo-pixel/sys`), not a GitHub Org.
- Branch protection on **`main`**: require PR + 1 approval + code-owner review + conversation resolution; force-push/delete blocked; admin not enforced (owner can promote).
- Branch protection on **`staging`**: require PR + 1 approval + conversation resolution; force-push/delete blocked.
- Enabled `require_code_owner_reviews` on `main` — binds once `CODEOWNERS` reaches main.
- Verified all 4 collaborators are `write` (matches chosen model; no changes needed).
- Authored on branch `chore/governance` (off staging): `.github/CODEOWNERS`, `.github/pull_request_template.md`, `docs/GOVERNANCE.md`; added `.claude/worktrees/` to `.gitignore`.

## Decisions (from user)
- Stay on personal repo for now (no Org migration).
- Flow: feature → PR → staging; only Sinuhe promotes staging → main.

## Known Limit
- "Only owner merges to main" is not hard-locked on a personal repo (no merge restrictions). Enforced via code-owner review + protocol. Full lock requires moving to a GitHub Organization.

## Files Changed
| File | Change |
|------|--------|
| .github/CODEOWNERS | New — repo owned by @sinuhearroyo-pixel |
| .github/pull_request_template.md | New — feature + promotion checklists |
| docs/GOVERNANCE.md | New — branch/access/promotion protocol |
| .gitignore | Add `.claude/worktrees/` |

## Promotion (completed)
- PR #13 `chore/governance` → **staging** merged.
- PR #14 **staging → main** merged — promoted assay coverage floors (210 tests / 21 pkgs), noShells gate + backup checksum fix, and the governance layer to prod.
- `CODEOWNERS` now on `main` → every future `staging → main` PR requires owner (Sinuhe) review. Lock armed.
- PR #15 back-merge **main → staging** merged — branches realigned (staging ⊇ main; PR #12's 26-pkg consolidation now on both).
- README "Branching & promotion" section live on main.
