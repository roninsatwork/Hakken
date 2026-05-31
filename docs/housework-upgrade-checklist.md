# Housework Upgrade Checklist

This checklist covers the final low-risk housework pass before switching back to feature work.

## Rules

- Work on `dev`.
- Do not touch the movement demo unless a required gate is broken:
  - `src/app/(dashboard)/demos/movements/**`
  - `src/app/(dashboard)/demos/movement-capture/page.tsx`
  - `convex/movements.ts`
- Do not commit until the user explicitly says `commit`.
- Do not push until the user explicitly says `push`.
- Keep this pass focused on repo clarity, handoff clarity, scripts, and CI/deploy understanding.
- Avoid product behavior changes unless they are needed to keep checks passing.

## Phase 1: Root Repo Hygiene

Status: Complete.

Goal:

- Remove or relocate stale scratch files so the repo root only contains intentional project files.

Scope to review:

- `patch.js`
- `patch_freeze.js`
- `patch_legs.js`
- `patch_spine_legs.js`
- `parse-glb.js`
- `parse-glb2.js`
- `test.js`
- `test-gltf.js`
- `test_mrr.js`
- `test_convex_type.txt`
- `checkApify.mjs`
- `checkItem.mjs`
- `.DS_Store`
- `tsconfig.tsbuildinfo`
- any other root-level scratch artifact found during the audit

Checklist:

- [x] Identify which files are stale scratch artifacts.
- [x] Identify which files are still useful developer tools.
- [x] Move useful tools into a clearer location such as `scripts/` if needed.
- [x] Delete stale scratch artifacts only after confirming they are not referenced.
- [x] Update `.gitignore` if generated artifacts can reappear.
- [x] Run `git status --short`.
- [x] Run `git diff --check`.
- [x] Run a focused check if any package/script references change.
- [x] Provide a diff summary for review.

Acceptance:

- Repo root is easier to scan.
- No required project file is removed.
- Generated or local-only artifacts are ignored where appropriate.

## Phase 2: Handoff Documentation Alignment

Status: Complete.

Goal:

- Make the development workflow obvious from the main docs, with `AGENTS.md` as the agent source of truth.

Scope:

- `AGENTS.md`
- `README.md`
- `docs/index.md`
- `docs/getting-started.md`
- `docs/deployment.md`
- `docs/current-cleanup-checklist.md`
- `docs/future-agent-maintenance-plan.md`
- `GEMINI.md`

Checklist:

- [x] Confirm `AGENTS.md` is the clearest first-read file for future coding agents.
- [x] Confirm `GEMINI.md` only acts as a legacy pointer.
- [x] Make `README.md` point to the right docs for local dev, deployment, and agent handoff.
- [x] Make `docs/index.md` list the current docs in a useful order.
- [x] Make `docs/deployment.md` clearly explain `dev` versus `main`.
- [x] Keep the completed 6-phase cleanup checklist marked complete.
- [x] Avoid duplicating long instructions across multiple docs.
- [x] Run `git diff --check`.
- [x] Provide a diff summary for review.

Acceptance:

- A future agent can understand where to start in under a minute.
- A developer can understand local dev, checks, and deployment without reading stale notes.
- No docs contradict the branch, commit, push, or movement-demo rules.

## Phase 3: Package Script And Tooling Clarity

Status: Complete.

Goal:

- Make the package scripts match how we actually build, test, and deploy the app.

Scope:

- `package.json`
- `package-lock.json` only if scripts or dependencies genuinely change
- `eslint.config.mjs`
- `vitest.config.ts`
- `playwright.config.ts`
- related docs that mention commands

Checklist:

- [x] Review all `package.json` scripts.
- [x] Confirm `dev`, `convex:dev`, `check`, `build`, `lint`, `lint:all`, `typecheck`, and test scripts are clear.
- [x] Remove or rename confusing scripts only if they are unused.
- [x] Confirm docs mention the same commands as `package.json`.
- [x] Avoid dependency changes unless clearly needed.
- [x] Run `npm run lint:all`.
- [x] Run `npm run check`.
- [x] Run `npm run build` if scripts/config changed in a way that could affect build.
- [x] Provide a diff summary for review.

Acceptance:

- The script set is boring and predictable.
- Local commands match CI expectations.
- No warning-only lint behavior is reintroduced by accident.

## Phase 4: CI And Deploy Sanity Review

Status: Complete.

Goal:

- Make it clear what runs before deployment and what triggers production.

Scope:

- `.github/workflows/**`
- `docs/deployment.md`
- `AGENTS.md`
- `README.md`

Checklist:

- [x] Review workflow triggers.
- [x] Confirm whether `main` push is the production deploy trigger.
- [x] Confirm what runs before deploy: audit, lint, typecheck, tests, build, Convex deploy.
- [x] Confirm docs match the actual workflow.
- [x] Add comments or doc notes only where they reduce confusion.
- [x] Avoid changing deploy behavior unless there is a clear mismatch or bug.
- [x] Run `git diff --check`.
- [x] Run any relevant local command if workflow scripts changed.
- [x] Provide a diff summary for review.

Acceptance:

- The team knows exactly when deploy runs.
- The team knows which local checks to run before pushing to `main`.
- CI docs and workflow behavior agree.

## Phase 5: Final Verification And Decision Point

Status: Verification complete; awaiting commit and push approval.

Goal:

- Finish the housework pass cleanly, then switch back to feature development.

Checklist:

- [x] Confirm no movement demo files changed.
- [x] Run `git status --short`.
- [x] Run `git diff --check`.
- [x] Run `npm run lint:all`.
- [x] Run `npm run check`.
- [x] Run `npm run build`.
- [x] Run `npm audit --audit-level=high`.
- [x] Provide final diff summary.
- [ ] Wait for explicit `commit` approval.
- [ ] Wait for explicit `push` approval to `dev`.
- [x] Do not push to `main` unless the user explicitly asks for deploy testing.

Acceptance:

- Repo hygiene is improved.
- Agent handoff is clearer.
- Commands and CI/deploy docs agree.
- The app remains ready for feature work.
