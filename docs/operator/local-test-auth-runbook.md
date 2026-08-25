# Local Test Auth Runbook

Use this runbook when an operator or developer needs real Convex Auth browser sessions for local Playwright checks without using production identities. The local test auth flow is for local development and test verification only. It must never be enabled for production or customer environments.

Implementation source of truth:

- `scripts/local-test-auth.mjs`
- `convex/localTestAuth.ts`
- `src/app/local-test-auth/page.tsx`
- `src/app/local-test-auth/LocalTestAuthClient.tsx`
- `convex/localTestAuth.test.ts`
- `docs/developer/route-protection-and-authentication.md`

## When To Use It

Use local test auth when you need browser storage states for:

- super-admin checks that should land in `/admin`
- company-admin checks that should land in `/app`
- standard-user checks that should land in `/app`
- real-auth E2E work where the app should exercise Convex Auth instead of the separate mocked E2E cookie helper

Do not use it for customer onboarding, production support, demo tenant seeding, or data migration. For seeded demo product data, use [Local Demo Seed Runbook](./local-demo-seed-runbook.md) instead.

## Safety Gates

Local test auth fails closed unless all required controls are present:

- `LOCAL_TEST_AUTH_ENABLED` must be `1` for the local Next.js app so `/local-test-auth` renders the client flow.
- `LOCAL_TEST_AUTH_ENABLED` must be `1` for the local Convex environment so the `local-test` credentials provider and seed/authorize functions are available.
- `LOCAL_TEST_AUTH_SECRET` must be configured in the local Convex environment.
- The secret passed to the script or `/local-test-auth` route must match `LOCAL_TEST_AUTH_SECRET`.
- `LOCAL_TEST_AUTH_ENVIRONMENT` must not be `production` in either the local Next.js app or local Convex environment.
- The browser route must be opened on `localhost`, `127.0.0.1`, or `::1`.

Keep the local test auth secret local. Do not commit it, paste it into docs, share it in support channels, or reuse a production secret.

## Prerequisites

1. Confirm the current branch is `dev`.
2. Install dependencies with the repository Node version.
3. Start the local Convex service with local test auth enabled.
4. Start the web app with local test auth enabled, or set `LOCAL_TEST_AUTH_BASE_URL` to the local app port you are using.
5. Configure the local Convex deployment with:

```bash
LOCAL_TEST_AUTH_ENABLED=1
LOCAL_TEST_AUTH_SECRET=replace-with-local-secret
```

The web app only needs the enable flag and non-production environment guard:

```bash
LOCAL_TEST_AUTH_ENABLED=1 npm run dev
```

Only set `LOCAL_TEST_AUTH_ENVIRONMENT` when you intentionally need the production guard to block local test auth. If it is set to `production` for either process, local test auth is unavailable.

## Seed The Local Identities

From the repository root:

```bash
LOCAL_TEST_AUTH_SECRET=replace-with-local-secret npm run auth:local:seed
```

If the local Convex URL is not discoverable from `.env.local`, pass it explicitly:

```bash
LOCAL_TEST_AUTH_CONVEX_URL=http://127.0.0.1:3210 LOCAL_TEST_AUTH_SECRET=replace-with-local-secret npm run auth:local:seed
```

The seed creates or updates one deterministic company and three deterministic users.
## Clear The Seeded Data

The seeded identities are fixtures and are meant to persist; the threads,
messages and login rows a test run leaves behind are not. To clear that data
without removing the identities:

```bash
LOCAL_TEST_AUTH_SECRET=replace-with-local-secret npm run auth:local:cleanup
```

It queues the same purge the platform runs when a user is deleted, so the three
users and `Local Test Company` survive and stay signed-in-able. CI runs this
after every real-auth job, passing or failing.


Seeded company:

- `Local Test Company`

Seeded users:

- `local-super-admin@sonae.test` as `SUPER_ADMIN`, with no required company assignment
- `local-company-admin@sonae.test` as `ADMIN` for `Local Test Company`
- `local-user@sonae.test` as `USER` for `Local Test Company`

The seed is idempotent. Re-running it updates the deterministic rows instead of creating duplicate users.

## Create Browser Storage States

After the identities are seeded and the local web app is running, create Playwright storage states:

```bash
LOCAL_TEST_AUTH_SECRET=replace-with-local-secret npm run auth:local:state
```

The script opens `/local-test-auth` for each role, signs in through the `local-test` credentials provider, waits for the expected redirect, and writes storage states under `e2e/.auth/`.

Default output files:

- `e2e/.auth/super-admin.json`
- `e2e/.auth/company-admin.json`
- `e2e/.auth/user.json`

To generate only selected roles, append role names:

```bash
LOCAL_TEST_AUTH_SECRET=replace-with-local-secret npm run auth:local:state -- super-admin company-admin
```

If the web app is not running on `http://localhost:3100`, set the base URL:

```bash
LOCAL_TEST_AUTH_BASE_URL=http://localhost:3000 LOCAL_TEST_AUTH_SECRET=replace-with-local-secret npm run auth:local:state
```

The real-auth Playwright lane is configured in `playwright.real-auth.config.ts` and exposed through:

```bash
npm run test:e2e:real-auth
```

That lane starts the local app on port `3100` with `LOCAL_TEST_AUTH_ENABLED=1` and runs `e2e/local-real-auth-smoke.spec.ts` projects for public, super-admin, and user checks. The smoke spec signs in dynamically through `/local-test-auth`; it does not require pre-generated storage states. You still need to seed the deterministic local users first with `npm run auth:local:seed`.

## Manual Route Check

The script-driven state command is the preferred path, but the route can also be checked manually on localhost:

```text
/local-test-auth?role=company-admin&secret=replace-with-local-secret&redirectTo=/app
```

Valid roles are `super-admin`, `company-admin`, and `user`. `redirectTo` must be a local path beginning with `/` and cannot begin with `//`; invalid redirects fall back to `/app`.

The route shows a loading state while creating the local test session. If a safety gate fails, it shows `Local test auth unavailable` with an error message.

## Expected Failures

Common failure messages:

- `LOCAL_TEST_AUTH_SECRET is required.`: pass the script environment variable.
- `Local test auth is disabled.`: set `LOCAL_TEST_AUTH_ENABLED=1` in the local Convex environment and restart affected services.
- `Local test auth secret is not configured.`: configure `LOCAL_TEST_AUTH_SECRET` in the local Convex environment.
- `Invalid local test auth secret.`: the script or route secret does not match the Convex environment secret.
- `Local test auth is not available in production.`: the production guard is active; do not bypass it.
- `Local test auth is only available on localhost.`: open the route from localhost, `127.0.0.1`, or `::1`.
- `Local test user has not been seeded.`: run `npm run auth:local:seed` before creating storage state.
- `Local test tenant user is missing a company.`: rerun the seed so tenant roles are assigned to `Local Test Company`.

If the state command cannot connect to Convex, confirm `npm run convex:dev` is running and set `LOCAL_TEST_AUTH_CONVEX_URL` explicitly. If it cannot reach the web app, confirm the Next.js dev server is running and set `LOCAL_TEST_AUTH_BASE_URL` to the active port.

## Cleanup And Reuse

The seeded users are local test identities. Re-running the seed is the normal repair path. If you need a fully clean state, reset the local Convex deployment and regenerate storage states.

Do not commit `e2e/.auth/` storage state files, generated local secrets, or local environment files. Treat browser storage states as local test artifacts, not durable documentation or product data.
