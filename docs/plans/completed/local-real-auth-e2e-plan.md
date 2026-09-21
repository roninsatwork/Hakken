> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Local Real Auth E2E Plan

This plan documents how to add a local-only, real-session browser authentication lane for Hakken Playwright tests.

The goal is to let headless browsers sign in through Convex Auth itself, save Playwright `storageState`, and run selected browser tests against real authenticated sessions. This should complement, not immediately replace, the current mocked e2e harness.

## Core Principle

Do not forge app sessions in Playwright.

Instead:

1. Playwright opens a hidden localhost-only route.
2. The route calls the real Convex Auth client with `signIn("local-test", { role, secret, redirectTo })`.
3. Convex Auth creates a normal session.
4. Playwright saves the browser state to `e2e/.auth/*.json`.
5. Real-auth e2e specs use those storage states.

This tests browser authentication, middleware, Convex Auth sessions, and backend authorization guards without depending on Google OAuth, magic links, or live email delivery.

## Current Hakken Baseline

Hakken already has two useful pieces:

- Convex Auth is configured in `convex/auth.ts` with Google and Resend providers.
- Playwright is configured in `playwright.config.ts`.

Hakken also has a deterministic mocked e2e lane:

- `e2e/auth.setup.ts` writes role cookies such as `sonae_e2e_auth`.
- `src/proxy.ts` trusts that cookie only when `E2E_AUTH_ENABLED=1`.
- `next.config.ts` aliases `convex/react` to `src/e2e/convexReactMock.tsx` when e2e auth is enabled.

That mocked lane is valuable for fast UI coverage and should remain in place while this real-auth lane is introduced. The new lane should run without `E2E_AUTH_ENABLED=1` and without the Convex React mock.

## Non-Drift Rules

- Keep Hakken invite-only for normal providers.
- Do not weaken production Google or Resend auth behavior.
- Do not accept local-test auth unless `LOCAL_TEST_AUTH_ENABLED=1`.
- Require `LOCAL_TEST_AUTH_SECRET` for every local-test sign-in.
- Reject local-test auth when `LOCAL_TEST_AUTH_ENVIRONMENT=production`.
- Only allow the browser route from localhost origins: `localhost`, `127.0.0.1`, or `::1`.
- Only allow known deterministic roles.
- Keep generated storage states out of git.
- Do not expand or refactor the frozen movement demo while adding this lane.
- Keep existing mocked e2e coverage working unless the user explicitly asks to migrate it.

## Roles

Use Hakken's existing role vocabulary:

- `super-admin` maps to `SUPER_ADMIN`.
- `company-admin` maps to `ADMIN`.
- `user` maps to `USER`.

Suggested deterministic local users:

- `local-super-admin@sonae.test`
- `local-company-admin@sonae.test`
- `local-user@sonae.test`

Suggested deterministic company:

- `Local Test Company`

The company admin and standard user should share the same local company so tenant-scoped UI and Convex guards can be tested.

## Phase 1: Backend Local Test Auth

Status: Implemented.

Goal: add the backend pieces needed for Convex Auth to create a normal local test session.

Implement:

- Add `convex/localTestAuth.ts`.
- Define a role map for `super-admin`, `company-admin`, and `user`.
- Add a guarded validator that checks:
  - `LOCAL_TEST_AUTH_ENABLED === "1"`
  - `LOCAL_TEST_AUTH_SECRET` exists and matches the provided secret
  - `LOCAL_TEST_AUTH_ENVIRONMENT !== "production"`
  - role is one of the known local test roles
- Add a seed mutation that creates or updates:
  - deterministic local company
  - deterministic local users
  - correct roles and company assignments
- Keep seed logic idempotent.
- Avoid changing invite provisioning semantics for Google and Resend.

Acceptance:

- Re-running the seed command does not create duplicates.
- Local users have the expected roles and tenant assignments.
- Invalid secret, disabled env, production env, and unknown role all fail closed.

## Phase 2: Convex Auth Provider

Status: Implemented.

Goal: register a local credentials provider that returns seeded user IDs only when the backend guard passes.

Implement:

- Import `ConvexCredentials` from `@convex-dev/auth/providers/ConvexCredentials`.
- Add a provider with `id: "local-test"` in `convex/auth.ts`.
- In `authorize`, call the local-test validator.
- Return `{ userId }` for the seeded user.
- Return `null` or throw for disabled, invalid, or unknown requests.

Important implementation note:

The existing `createOrUpdateSonaeAuthUser` callback is invite-oriented. The local credentials provider should not become a general user creation path. It should only sign in deterministic seeded users.

Acceptance:

- `signIn("local-test", ...)` creates a Convex Auth session for seeded local users.
- Normal Google and Resend providers behave as before.
- Production builds do not enable the provider accidentally.

## Phase 3: Hidden Frontend Sign-In Route

Status: Implemented.

Goal: let Playwright use the real browser client to create sessions.

Implement:

- Add `src/app/local-test-auth/page.tsx`.
- The page should:
  - run on the client
  - parse `role`, `secret`, and optional `redirectTo`
  - verify the current browser origin is localhost
  - call `signIn("local-test", { role, secret, redirectTo })`
  - show a minimal in-app failure state if sign-in fails
- Avoid native browser dialogs.
- Keep user-facing copy minimal because this route is test-only.

Acceptance:

- Visiting `/local-test-auth?role=user&secret=...&redirectTo=/app` on localhost signs in and redirects.
- Visiting the route from a non-localhost origin refuses to sign in.
- Missing secret or unknown role fails closed.

## Phase 4: Scripts And Package Commands

Status: Implemented.

Goal: make the lane repeatable for agents and local developers.

Implement:

- Add `scripts/local-test-auth.mjs`.
- The script should:
  - read `LOCAL_TEST_AUTH_SECRET`
  - use `LOCAL_TEST_AUTH_BASE_URL`, defaulting to `http://localhost:3100`
  - launch headless Chromium
  - visit `/local-test-auth` once per role
  - wait until the expected authenticated route is reached
  - save storage states into `e2e/.auth/`
- Add package scripts:
  - `auth:local:seed`
  - `auth:local:state`
  - optionally `test:e2e:real-auth`
- Ensure `e2e/.auth/` remains ignored.

Suggested local flow:

```bash
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npm run convex:dev
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npm run auth:local:seed
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npm run dev -- -p 3100
LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth LOCAL_TEST_AUTH_BASE_URL=http://localhost:3100 npm run auth:local:state
```

Acceptance:

- The script creates:
  - `e2e/.auth/super-admin.json`
  - `e2e/.auth/company-admin.json`
  - `e2e/.auth/user.json`
- Storage states are not committed.
- Re-running the script refreshes the states cleanly.

## Phase 5: Playwright Real-Auth Project

Status: Implemented for the first smoke slice.

Goal: add a small real-auth browser suite without destabilizing the broad mocked suite.

Implement:

- Add either a second Playwright config or dedicated projects in the current config.
- The real-auth lane must run without:
  - `E2E_AUTH_ENABLED=1`
  - `NEXT_PUBLIC_E2E_AUTH_ENABLED=1`
  - the `convex/react` mock alias
- Prefer a narrow first spec, for example `e2e/local-real-auth-smoke.spec.ts`.
- Use `storageState` files generated by `auth:local:state`.

First tests to add:

- Unauthenticated `/admin` redirects to `/login`.
- Local super admin reaches `/admin`.
- Local standard user reaches `/app`.
- Local standard user is redirected away from `/admin`.
- One authenticated page performs a real Convex query that depends on `auth.getUserId(ctx)`.

Acceptance:

- The first real-auth suite passes locally.
- Existing `npm run test:e2e` mocked coverage still passes.
- Failures distinguish auth setup problems from page rendering problems.

## Phase 6: Gradual Migration Candidates

Goal: move only the tests that benefit from real auth into the new lane.

Good candidates:

- Auth redirect tests.
- Admin route access tests.
- Tenant isolation smoke tests.
- User profile/settings smoke tests.
- One or two high-value Convex mutation journeys.

Poor first candidates:

- Broad admin table rendering that depends on large deterministic mock data.
- Expensive AI/provider workflows.
- Movement demo tests, unless the user explicitly reopens that area.

Acceptance:

- The mocked suite remains the fast broad UI safety net.
- The real-auth suite becomes the auth and authorization confidence lane.
- No test depends on external Google OAuth, Resend delivery, or a real inbox.

## Security Review Checklist

Before merging implementation, confirm:

- `LOCAL_TEST_AUTH_ENABLED` is required in backend provider logic.
- `LOCAL_TEST_AUTH_SECRET` is required and compared server-side.
- `LOCAL_TEST_AUTH_ENVIRONMENT=production` is rejected.
- The frontend route checks localhost before calling `signIn`.
- Unknown roles are rejected.
- The seed mutation creates only deterministic local identities.
- The provider does not accept arbitrary emails.
- `e2e/.auth/` is ignored.
- No generated storage states, local secrets, screenshots, reports, or caches are committed.

## Verification Gates

Run the standard local gates before asking the user to merge or push:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

For this feature specifically, also run:

```bash
npm run auth:local:seed
npm run auth:local:state
npm run test:e2e:real-auth
```

If `test:e2e:real-auth` is not added in the first implementation slice, document the exact Playwright command used for the real-auth smoke test.

## Open Questions

- Should the real-auth lane use port `3100` like the current Playwright web server, or switch to `3000` for easier local parity?
- Should local test users live in the same Convex deployment used for local development, or should the team standardize on a dedicated anonymous/local Convex deployment?
- Should `auth:local:seed` seed only users and company, or also minimal system settings/model defaults needed by authenticated app pages?
- Should CI run the real-auth lane immediately, or should it start as a local-only smoke until the Convex environment is stable in CI?

## Recommended First Slice

Build the smallest useful version:

1. Add backend local-test auth guard and seed mutation.
2. Register `ConvexCredentials({ id: "local-test" })`.
3. Add `/local-test-auth`.
4. Add storage-state generation.
5. Add one smoke spec covering super-admin, user, and admin denial.

Do not migrate the broad mocked e2e suite in the first slice. Let the new lane prove itself first.
