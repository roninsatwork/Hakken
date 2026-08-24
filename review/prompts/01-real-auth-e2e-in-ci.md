# Put the real-auth e2e suite into CI

## Context

Browser e2e tests currently run against a mocked Convex backend on a dev-mode server: `next.config.ts` (lines ~34 and ~43) aliases `convex/react` to `src/e2e/convexReactMock.tsx` when `NEXT_PUBLIC_E2E_AUTH_ENABLED=1`, and `playwright.config.ts` starts `npm run dev` with a placeholder Convex URL. So CI's "browser tests pass" never exercises the real client↔Convex integration or a production build. A real-integration config exists (`playwright.real-auth.config.ts`, run via `npm run test:e2e:real-auth` with seeding helpers in `scripts/local-test-auth.mjs`), but it is not in any CI workflow. This is the single biggest honesty gap in an otherwise real gate pipeline.

## Task

Wire a small, curated subset of the real-auth Playwright suite into CI so at least the core journeys (login, assistant chat send/receive, one admin table screen) run against a real Convex deployment on every PR into `main` (not every dev push — CI minutes are metered, see "What A Push Costs" in `AGENTS.md`).

1. Read `playwright.real-auth.config.ts`, `scripts/local-test-auth.mjs`, `docs/developer/deployment.md`, and `.github/workflows/ci.yml` to understand the existing seeding and gate structure.
2. Decide and document the backing deployment: a dedicated Convex preview/test deployment whose URL and deploy key come from GitHub secrets. Do not point CI at production.
3. Add a `real-auth-smoke` job to `ci.yml` gated to PRs into `main` (alongside the existing `full-gate` job), tagged specs only (e.g. `@real-auth-smoke` grep), with seeding before and cleanup after.
4. Keep runtime under ~5 minutes; document the job and its secrets in `docs/developer/deployment.md`.

## Constraints

- Do not weaken or remove the existing mocked e2e suite — it stays the fast deterministic layer.
- Do not push or merge; leave the branch for the user to review. Every push to `dev` costs metered CI minutes.
- Any new secrets must be named in the docs but never committed.

## Acceptance

- `npm run test:e2e:real-auth -- --grep @real-auth-smoke` passes locally against the test deployment.
- The new CI job appears only on PRs into `main` and blocks the merge on failure.
- `docs/developer/deployment.md` explains the job, its deployment, and its secrets.
