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

When `E2E_AUTH_ENABLED=1`, the proxy accepts a test-only `hakken_e2e_auth` cookie and routes users by role. The Next config also aliases `convex/react` to a local e2e mock so browser tests can render authenticated admin and app surfaces without external Convex Auth state.

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
- Company widget edit, publish, and integration snippet copy behavior in `e2e/admin/workflow-widget-journeys.spec.ts`.
- Workflow create/detail, schedule manual dispatch, and workflow log visibility in `e2e/admin/workflow-widget-journeys.spec.ts`.
- Role-based admin access behavior.
- Dashboard export flow.
- End-user assistant and profile flows, including `e2e/user-chat-flow.spec.ts` and `e2e/user-settings-flow.spec.ts`.
- Movement route smoke checks in `e2e/movement-demo-smoke.spec.ts`.
- Movement library, capture shell, detail viewer, play avatar lobby, and guided debug preview with deterministic movement fixture data in `e2e/movement-demo-authenticated.spec.ts`.
- Movement avatar proof evals in `e2e/movement-avatar-proof.eval.spec.ts`. These use deterministic synthetic webcam skeleton poses to drive the live player avatar path, assert the debug ownership labels for standing, side bend, hands-front, squat, and left/right leg raises, check that the player-avatar region contains visible rendered pixels, compare posture silhouettes against standing, and attach screenshots plus visual metrics to the Playwright report.

The browser suite is expected to run with no expected skips.

## Movement Avatar Eval

Run the focused avatar-following eval with:

```bash
npm run eval:movement-avatar
```

This starts the normal Playwright app server, creates deterministic auth storage state, opens `/demos/movements/squat-proof`, and feeds synthetic skeleton poses through the same `VrmAvatar` player path used during practice. The eval fails when squat and leg-raise ownership drift, when spine ownership regresses, when the proof route stops rendering the avatar canvas, when the captured screenshot does not contain enough visible player-avatar pixels in the right-side proof region, or when squat/leg-raise screenshots become visually indistinguishable from standing. Screenshots and computed visual metrics are stored as Playwright attachments under `test-results/` and surfaced in the HTML report.

## Ronin's Run 3D local browser pass

Run `npx playwright test --config=playwright.arcade.config.ts` explicitly for the
four-district first-person game. This uses a separate headless Chrome instance
and the existing deterministic auth harness on port 3100. The dedicated
`.next-arcade` output directory lets the normal local app remain running.
The routine metered CI suite does not include this pass.
After the run, `npx next typegen` restores the shared `next-env.d.ts` references
to the normal `.next` directory without stopping the local app.

The driver reads the visible minimap and sends ordinary keyboard/mouse input.
It does not access the runtime instance, teleport, remove patrols or extend power.
The four campaign checks use Playwright's controlled clock, advancing ordinary
animation callbacks while steering. This removes host mouse/DOM latency from
the route pilot without changing simulation rules. They verify complete escapes,
treasure, stable shader counts, retry and idle/pause rendering. Their
timings are not real-time performance measurements. Run these twice with
`--grep 'browser campaign' --repeat-each=2` when changing the pilot.

Separate real-time checks cover two minutes of uninterrupted Quiet rendering
and movement through a flame pickup, including sampled frame intervals and
stable shader/geometry counts. JSON samples and actual screenshots are
Playwright attachments under ignored `test-results/`. The 390 × 844 touch check
sends Chrome DevTools touch events to
the actual movement/look pads and verifies release and pause; it does not inject
game state. It remains browser emulation rather than a physical phone test.
These are automated local browser checks, not physical touch-device or wider GPU
certification. The optional Safari-engine pass uses
`npx playwright test -c playwright.arcade.webkit.config.ts --grep 'art review|browser campaign|real-time flame'`.
The Chrome touch test requires CDP and is excluded from that command. WebKit
engine coverage does not establish physical iPhone or macOS Safari acceptance.

## Local Real Auth Lane

Hakken also has a local-only real Convex Auth lane for targeted authentication and authorization smoke tests. This lane does not use the `hakken_e2e_auth` role cookie and does not alias `convex/react` to the deterministic mock.

Before running it, configure the local app shell and Convex backend with:

```bash
LOCAL_TEST_AUTH_ENABLED=1
LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth
```

Then seed deterministic users:

```bash
LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth npm run auth:local:seed
```

Run the focused real-auth suite with:

```bash
LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth npm run test:e2e:real-auth
```

The focused smoke tests in `e2e/local-real-auth-smoke.spec.ts` sign in dynamically through `/local-test-auth` at test start. They do not require pre-generated storage states.

Tests tagged `@real-auth-smoke` are the curated subset. They ran on pull
requests into `main` until 2026-08-26; CI now runs them only on demand (see
`docs/developer/deployment.md`), so locally is where they normally run:

```bash
LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth npm run test:e2e:real-auth -- --grep @real-auth-smoke
```

Adding the tag to a spec in that file is what puts it in CI; untagged specs stay
local-only. Clear the data a run leaves behind with `npm run auth:local:cleanup`.

For tests that need a reusable Playwright storage state, start the app locally and run:

```bash
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth npm run dev -- -p 3100
LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth LOCAL_TEST_AUTH_BASE_URL=http://localhost:3100 npm run auth:local:state
```

Generated storage states are written to `e2e/.auth/` and ignored by git.
