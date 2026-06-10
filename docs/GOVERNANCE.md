# sys — Repository Governance

How the team works the `sys` monorepo: branches, access, and the promotion
protocol from staging to production. This is the source of truth; if a tool
setting and this doc disagree, fix one of them.

Last updated: 2026-06-10

---

## 1. Environments / branches

| Branch        | Role                  | Who writes                          | Protection |
|---------------|-----------------------|-------------------------------------|------------|
| `main`        | **Production** — released, tagged | **Sinuhe only**, via promotion PR | PR + 1 approval + **code-owner (Sinuhe) review** + conversations resolved; no force-push, no delete |
| `staging`     | **Integration / pre-prod** | Whole team, via PR            | PR + 1 approval + conversations resolved; no force-push, no delete |
| `feature/*` `fix/*` `chore/*` `docs/*` | Short-lived work | Author | none (delete after merge) |

`main` is always the released state. `staging` is where the team's work
integrates and bakes before Sinuhe promotes it.

---

## 2. Access model (personal-account repo)

The repo lives under a personal account, so access is by **direct
collaborator role**, not GitHub Teams. Roles in use:

| Person                | GitHub login        | Role  | Can |
|-----------------------|---------------------|-------|-----|
| Sinuhe (owner)        | `sinuhearroyo-pixel`| Admin | everything; sole promoter to `main` |
| Vinh Le               | `Vinh-Le-syngen`    | Write | push branches, open PRs, merge into `staging` |
| Thong Ngo             | `thongngo1803`      | Write | same |
| Trong Tri             | `trongtri-syngen`   | Write | same |
| Dieu Vo               | `dieuvo-syngen`     | Write | same |

Write **cannot** change repo settings, branch protection, or delete the repo.
Only Sinuhe (Admin) can.

> **Known limit of this setup.** GitHub's "restrict who can merge a branch"
> control only exists for Organization-owned repos. On a personal repo the
> hard lock isn't available, so the promotion rule is enforced two ways:
> (a) the **code-owner rule** makes every `staging -> main` PR require
> Sinuhe's approving review, and (b) team protocol — **only Sinuhe opens and
> merges the promotion PR.** A teammate could technically click "merge" after
> Sinuhe approves; don't. If we outgrow trust here, the fix is to move the
> repo into a GitHub Organization (Teams + locked merge).

---

## 3. Daily flow (team)

```
git switch staging && git pull
git switch -c feature/<short-name>      # branch FROM staging
# ...work, commit...
git push -u origin feature/<short-name>
gh pr create --base staging             # PR INTO staging
```

To merge a PR into `staging`:
1. CI is green.
2. One teammate approves.
3. All review conversations resolved.
4. Author (or reviewer) merges. Delete the branch.

**Never** open a PR directly into `main`. Never push to `staging` or `main`
directly — both reject non-PR pushes.

---

## 4. Promotion flow (Sinuhe only — production release)

```
gh pr create --base main --head staging --title "promote: staging -> main (2026-06-10)"
```

1. Sinuhe reviews the full `staging…main` diff and confirms version bumps /
   changesets are correct.
2. Branch protection requires Sinuhe's **code-owner approval** — no one else
   can satisfy it.
3. Sinuhe merges (merge commit, not squash, to preserve staging history).
4. Tag + release from `main` (changesets / release workflow).
5. If `main` moved via hotfix, back-merge `main -> staging` so they don't drift.

**Cadence:** promote on demand when staging is green and a coherent set of
changes is ready — not per-commit. Aim for small, frequent promotions over
big-bang ones.

---

## 5. Hotfixes

Production-critical fix that can't wait for the normal staging bake:

```
git switch -c fix/<name> main           # branch FROM main
gh pr create --base main                # PR INTO main — needs Sinuhe's review
```

After it merges to `main`, immediately open `main -> staging` to back-merge.

---

## 6. Rules of thumb

- One change = one branch = one PR. Keep them small.
- Add a changeset (`pnpm changeset`) for anything that changes a published
  `@sys/*` package's behavior.
- Don't merge your own promotion to `main` if you're not Sinuhe.
- Resolve every review thread before merge (enforced).
- Force-push and branch deletion are blocked on `main`/`staging` — don't fight
  it, open a new PR.
