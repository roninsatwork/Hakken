# Sonae Agent Handoff

This is the repo-level handoff for future coding agents. Treat this file as the first local project guide to read after the user's latest instructions.

## Current Branch Rules

- Daily development happens on `dev`.
- `main` is production. A push to `main` triggers `.github/workflows/deploy.yml`.
- Before editing, run `git branch --show-current`. If it is `main`, switch to `dev` before making changes.
- Do not push after every small task. Batch related fixes, verify them, then push only when the user asks.
- After merging or pushing to `main`, switch back to `dev` before continuing feature or cleanup work.

## Verification Gates

Run these before asking the user to merge or push:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

The GitHub Actions production gate also runs:

```bash
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run test:run
npm run build
```

If the local frontend is running on port 3000, stop it before `npm run build`, then restart both services afterwards:

```bash
npm run dev
npm run convex:dev
```

## Movement Demo Freeze

Do not refactor, redesign, or expand the movement demo unless the user explicitly asks or a quality gate is broken by it.

Frozen areas:

- `src/app/(dashboard)/demos/movements/**`
- `src/app/(dashboard)/demos/movement-capture/page.tsx`

The user considers this demo temporary and expects to delete it after the client has seen it. Focus maintainability work elsewhere.

## Project Guardrails

- Keep English and Italian locale dictionaries in parity: `messages/en.json` and `messages/it.json`.
- Do not use native browser dialogs (`alert`, `confirm`, `prompt`) in app UI. Use in-app feedback or the existing Sonae modal patterns.
- Administrative tables and feeds should use 15 rows per page unless a specific product requirement says otherwise.
- Preserve tenant isolation in Convex queries and mutations. Scope non-super-admin access by company.
- Mutations that manage users must prevent privilege escalation. Admins must not create, edit, or delete super-admin privileges.
- Resolve AI model choices from stored configuration instead of hardcoding model literals in runtime paths.
- Avoid committing generated reports, build output, local caches, or scratch artifacts.

## Code Quality Priorities

1. Turn drift checks into automated tests or scripts so future regressions are caught before review.
2. Promote cleaned lint categories back to hard errors now that `npm run lint:all` is clean.
3. Extract repeated admin table/search/pagination structure outside the frozen movement demo.
4. Consolidate app feedback banners, confirmation flows, and empty/error states into shared UI primitives.
5. Add Convex auth helper functions for common `requireUser`, `requireAdmin`, and `requireSuperAdmin` patterns.
6. Normalize Convex error handling and typed row contracts in admin and AI surfaces.
7. Continue splitting workflow editor/runtime types and helpers, but leave movement demo code alone.
8. Add regression tests for auth redirects, locale parity, no-native-dialog drift, and 15-row admin pagination.

See `docs/future-agent-maintenance-plan.md` for the fuller plan.
