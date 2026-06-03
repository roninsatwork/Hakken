# E2E Browser Coverage

Run the browser regression suite with:

```bash
npm run test:e2e
```

The Playwright config starts the app on `http://localhost:3100` with deterministic e2e auth enabled:

```bash
E2E_AUTH_ENABLED=1 NEXT_PUBLIC_E2E_AUTH_ENABLED=1 npm run dev -- -p 3100
```

## Role Projects

The suite uses Playwright projects instead of ad hoc login steps:

- `setup` creates storage states in `e2e/.auth/`.
- `unauthenticated` verifies protected route redirects and public login access.
- `super-admin` verifies authenticated admin routes, tables, AI controls, user management, widget/workflow journeys, role behavior, and exports.
- `user` verifies authenticated assistant and profile journeys.

The generated `e2e/.auth/*.json` files are ignored by git.

## Deterministic Auth Harness

When `E2E_AUTH_ENABLED=1`, the proxy accepts a test-only `sonae_e2e_auth` cookie and routes users by role. The Next config also aliases `convex/react` to a local e2e mock so browser tests can render authenticated admin and app surfaces without external Convex Auth state.

Authenticated specs should not skip when redirected to login. The shared `skipWhenRedirectedToLogin` helper now asserts that role projects stayed authenticated, so CI fails if deterministic auth regresses.

## Coverage Shape

Unauthenticated coverage:

- Protected admin and app routes redirect to `/login`.
- High-value admin, workflow, AI, table, chat-log, and settings routes return non-5xx responses.
- Movement demo routes redirect cleanly to `/login` without non-5xx responses.
- `/login` remains publicly accessible.

Authenticated coverage:

- Admin route rendering for AI, workflow, users, companies, and agents pages.
- Admin table pagination and search behavior.
- Workflow designer and schedule route rendering.
- AI models and tools route rendering.
- AI model Active and Inactive filter behavior.
- Connector listing with deterministic tool metadata.
- User management search and edit dialog controls.
- Company widget edit, publish, and integration snippet copy behavior.
- Workflow create/detail, schedule manual dispatch, and workflow log visibility.
- Role-based admin access behavior.
- Dashboard export flow.
- End-user assistant and profile flows.
- Movement library, capture shell, detail viewer, and play avatar lobby with deterministic movement fixture data.

The browser suite is expected to run with no expected skips.
