---
product: Hakken
documentation_type: Developer guide
feature_area: build, CI, container release and deployment evidence
audience: developers and release operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/deployment.md
last_reviewed: '2026-10-26T10:49:59+00:00'
reviewed_against: current implementation
status: Current
---
# Infrastructure And Deployment

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** build, CI, container release and deployment evidence
> **Reviewed:** 26 October 2026, 10:49:59 GMT (Europe/London)
> **Source path:** `docs/developer/deployment.md` · **Status:** Current

Hakken has a GitHub-driven release path that deploys a Next.js container to Google Cloud Run and separately deploys its Convex backend. This guide describes repository configuration, not a verified live deployment or high-availability guarantee.

## 🚢 Hosting Environment

- **Frontend & App Runner**: Next.js is containerized and hosted on **Google Cloud Run**.
- **Backend & Database**: Managed by **Convex**.
- **Container Registry**: Google Artifact Registry.

## 🌳 Branching Protocol

Strict adherence to branching rules is required to protect the production environment.

1.  **`dev` Branch**: Active development, feature implementation, and experimentation. This is the workspace for daily coding.
2.  **`main` Branch**: Production-ready code. Pushing to `main` triggers a production deployment.

## 🚀 CI/CD Pipeline (GitHub Actions)

Two GitHub Actions workflows protect the repository:

- `.github/workflows/ci.yml` runs on pushes to `dev`, pull requests targeting `dev` or `main`, and an on-demand real-auth lane.
- `.github/workflows/deploy.yml` runs only on pushes to `main` and deploys production after its own gate passes.

Both workflows use Node `24.22.1` and `npm ci`. Both currently install `@rollup/rollup-linux-x64-gnu --no-save` after `npm ci` as a workaround for the npm optional dependency issue that can affect Rollup-based builds in CI.

Both restore `node_modules` from a cache keyed on `package-lock.json`, so `npm
ci` only runs when the lockfile actually moves; CI caches the Playwright browser
on the same key. The rollup binary is installed before the cache is written, so
a hit already contains it — if that workaround ever changes, bump the `-v1-`
suffix in the cache keys, or a stale cache will keep serving the old tree and
the failure will look unrelated to whatever you changed.

### CI Workflow

The `CI` workflow defines Checks, an on-demand Real Auth Smoke job, and a main-PR Full Gate. Their conditions decide which execute.

**Checks** — every push and PR to `dev`, and every PR to `main`:

1. `npm run check:guards`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:coverage` (runs the full unit/integration suite)
5. `npm run coverage:check`
6. `npm run test:e2e:smoke` (the `@smoke` browser subset)

This was two jobs — checks in one, the browser subset in another — until each
was found paying its own checkout, Node setup and package restore for a single
push. One runner gets ready once. Everything browser-related runs last so a
failing lint never pays to fetch a browser it will not open. The trade is
wall-clock, taken deliberately: the browser subset waits for the unit suite
instead of running beside it.

**Full Gate** — only on PRs into `main`, adding the browser suite:

1. `npm run test:e2e`

Coverage is not repeated here: the Checks job runs the full unit suite with
coverage and enforces the thresholds on every PR — including PRs into `main` —
and both jobs block the merge, so a second run on the same commit bought
nothing but metered minutes. Deduplicated 2026-08-26.

Coverage is enforced on `dev` too, not just on the way to `main`, because `dev`
previously accumulated changes with no coverage enforcement at all.

**Real Auth Smoke** — on demand only, against a real Convex deployment. Press
"Run workflow" on the Actions tab; nothing triggers it automatically. It gated
PRs into `main` until 2026-08-26, when Anthony declined the deployment it needs
(see "Its deployment and secrets" below) and it was unhooked rather than left
to fail every PR for want of two secrets. The same specs run locally at no
cloud cost with `npm run test:e2e:real-auth`. Steps, when it does run:

1. `npx convex env set` (enable local test auth on the test deployment)
2. `npx convex deploy` (push the PR's functions to the test deployment)
3. `npm run auth:local:seed`
4. `npm run test:e2e:real-auth -- --grep @real-auth-smoke`
5. `npm run auth:local:cleanup` (runs even when the tests fail)

Every other browser job runs against a mocked backend: `next.config.ts` aliases
`convex/react` to `src/e2e/convexReactMock.tsx` when `E2E_AUTH_ENABLED=1`, `E2E_AUTH_ENVIRONMENT=local` and the build is non-production, so those jobs prove the screens render but
never prove the wiring between the screens and Convex. This job is the only one
that signs in through real Convex Auth, writes through real mutations, and reads
back through real reactive queries. The mocked suite stays as the fast
deterministic layer; this one is the honesty check on top of it.

The tagged subset is deliberately small — an unauthenticated redirect, a
super-admin sign-in, a standard-user sign-in, one real admin table, and one
assistant round trip. Adding `@real-auth-smoke` to a spec in
`e2e/local-real-auth-smoke.spec.ts` is what puts it in CI; specs in that file
without the tag stay local-only.

**The assistant round trip is weaker than its name.** It asserts the composer
accepts a message, the browser lands on the thread URL, the message appears,
and the writing indicator is visible. It does **not** assert that a reply
arrives: the indicator it waits for (`AssistantStagePill`) renders whenever the
last message is the user's own, so it is already true the moment the message
round-trips, and it *disappears* when the reply lands. Send is covered; receive
is not. Asserting the reply itself is the obvious strengthening, and it needs a
live run of the lane to verify rather than a guess — do that before trusting
this spec as loop coverage. (It would not cost provider credit: with no AI
provider configured the runtime writes its own "Core Offline" notice into the
thread, which is a real assistant message.)

#### Its deployment and secrets

The job needs a **dedicated Convex test deployment**. Never production, never the
staging deployment, and — asked directly on 2026-08-26 — never `dev` either: the
job deploys the pull request's functions over whatever it points at, seeds
identities into it, clears data out of it, and leaves the test-login door
switched on there permanently. Pointed at `dev` that lands on Anthony's own
working data while he is using it.

**Historical decision, 2026-08-26; current remote configuration unverified.** A dedicated deployment is a second
paid deployment plus its own auth keys, and the check it buys duplicates one
Anthony performs by hand before he ships. He declined it on 2026-08-26 and the
job was switched to manual. Nothing below is wrong — it is what to do if that
decision is ever revisited.

Two repository secrets, added under Settings → Secrets and variables → Actions:

| Secret | What it is |
|---|---|
| `CONVEX_TEST_DEPLOYMENT_URL` | The test deployment's URL, used as `NEXT_PUBLIC_CONVEX_URL` |
| `CONVEX_TEST_DEPLOY_KEY` | That deployment's deploy key, used as `CONVEX_DEPLOY_KEY` |

There is no third secret for `LOCAL_TEST_AUTH_SECRET`. The job mints a fresh
random one per run, masks it, and sets it on the deployment, so no long-lived
test credential exists to leak or to rotate.

The job fails when those secrets are absent rather than skipping. A run that
quietly passes while unconfigured is the problem this job was added to fix, and
pressing "Run workflow" is an explicit request for the check — so it says so
instead of pretending. No pull request is affected either way: since 2026-08-26
nothing triggers this job automatically.

If "Real Auth Smoke" was ever added as a **required status check** in the
repository's branch-protection settings, remove it there — a required check
that no longer runs leaves pull requests waiting on it forever. That setting
lives in GitHub, not in this repository, so it cannot be verified from here.

Failed Playwright runs upload `playwright-report/`. Coverage runs upload `coverage/`.

### Coverage Scope

`npm run coverage:check` gates on **platform code only**. The checker retains historical movement-demo exclusion patterns (`src/app/(dashboard)/demos`, `src/lib/movements`, `convex/movements*`, `scripts/movement-debug`) and would report matching files separately. Those routes/modules are not present in this copy; retained patterns do not establish a current demo feature.

The current configured platform thresholds are 80% lines, 77% statements, 65% branches and 72% functions. These are thresholds in `coverage-thresholds.json`, not measurements from this documentation run. The checker refuses a missing summary or a vacuous platform set, and warns when coverage output is at least one day old. Its stale-data warning does not itself fail the check. `current` cannot be set below `floor`; `nextRatchet` is a future target, not an automatically applied floor.

### Production Deploy Workflow

The deployment sequence is managed by `.github/workflows/deploy.yml`:

1. Testing firewall: `npm audit --omit=dev --audit-level=high` always, then `npm run check:guards`, `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run coverage:check` — but only when nothing can vouch for the code already. `main` only ever carries commit SHAs that were already checked on `dev` against the same files, so repeating them buys no new information and costs about eleven minutes a release. When nothing can be found the deploy runs them itself, so the bar never drops; it is only ever paid for once. The audit is never skipped: an advisory published since the dev run applies to code that has not changed.

   The question the deploy asks is about the **code**, not the commit. CI skips
   pushes that touch only documents, so a release whose newest commit is a plan
   or a note has no run of its own — and the first version of this step made
   such a release pay in full, which on a repository where plans are written
   constantly was most releases. The step now walks back up to 50 commits for
   one that did run, then asks whether anything CI actually reads has changed
   since. If only documents have, the earlier pass still stands. **The two
   filters in that step (`^docs/` and `\.md$`) mirror the `paths-ignore` list
   in `ci.yml` and must be changed together** — widening one without the other
   would let unchecked code through. The walk is why the deploy checks out with
   `fetch-depth: 50` rather than the default single commit.
2. Convex synchrony: `npx convex deploy` with `CONVEX_DEPLOY_KEY`.
3. Container build: Docker image built by buildx with `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONTACT_URL`, `CONVEX_SITE_URL`, `CONVEX_DEPLOYMENT` and `BUILD_SHA` build args. Layers are cached between releases in the registry under a third tag, `:buildcache`, so the `npm ci` layer is reused whenever the lockfile has not moved. That tag is machine-written and carries no releases — never deploy it, and do not prune it unless you want the next build to start cold.
4. Registry push: buildx publishes straight to Google Artifact Registry with `--push`, so the image is never loaded into the local daemon only to be uploaded again.
5. Cloud Run rollout: image deployed to the `hakken-app` service in `us-central1` with port `3000`.

There is no `npm run build` step on the runner. It produced a `.next/` that
nothing read — `.dockerignore` excludes `.next` from the build context, and the
image builds the app itself in its builder stage — so it was about five minutes
a release spent on output that was thrown away.

The Docker build command sets `NODE_OPTIONS=--max-old-space-size=4096` so
Next's TypeScript worker has the same 4 GiB heap allowance as the normal
`npm run typecheck`. The container's default 2 GiB heap was exhausted during the
2026-09-13 release. This setting applies only to the build command; the
separate runtime stage does not inherit it, and type checking remains enabled.

The build context excludes TypeScript tests at every depth with
`**/*.test.ts` and `**/*.test.tsx`. Docker's `*.test.ts` pattern only matches
the context root, leaving nested tests to import development helpers that
the image excludes. CI continues to test and type-check the complete
checkout; the image checks the application files it ships.

Deploys are serialised: `concurrency: deploy-to-cloud-run` with
`cancel-in-progress: false`. Two pushes to `main` minutes apart used to start
two full deploys side by side, which doubled the billed minutes and let the
older one finish last and win the service. Queued rather than cancelled, because
a half-finished deploy is worse than a slow one. The job also carries a
45-minute timeout; without one, a wedged deploy runs to GitHub's six-hour
default and bills the whole way.

Every image is tagged twice: with the commit SHA and with `latest`. Cloud Run is
deployed from the **SHA tag**, so each revision records exactly which image is
serving traffic and previous images remain addressable.

The production audit is scoped with `--omit=dev --audit-level=high` and always runs, even when previous CI covers unchanged source. The weekly security-audit workflow separately reports the full dependency tree. Workflow comments explain historical dev-tool advisory debt; they are not a current vulnerability assessment, and this review neither queried advisories nor ran an audit. Keep live dependency security findings separate from the source-level description of the release gate.

## Health Checks

- `GET /api/health` — liveness. No network calls, safe to poll frequently. This
  is what the container `HEALTHCHECK` uses; a failure means restarting the
  container is reasonable.
- `GET /api/health?deps=1` — readiness. Also confirms the Convex deployment
  answers over HTTP within its two-second request timeout. Any HTTP response, including an error status, counts as reachable. This proves a network path, not successful authenticated queries, healthy database contents or provider availability. A restart does not repair an external outage.

Both return `version` (the commit SHA the image was built from) so a running
container can be tied back to an exact revision. Neither returns configuration
values, only whether they are present. Both report `e2eBackdoorExposed`, which
is `true` only if the e2e auth backdoor is somehow enabled in production — treat
that as an incident.

## Error Monitoring

The Next.js application has optional Sentry monitoring through `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/lib/errorMonitoring.ts`, and `src/lib/initErrorMonitoring.ts`. It is off by default: without `NEXT_PUBLIC_SENTRY_DSN`, initialization is a no-op and errors remain in application logs. When enabled, browser, server, edge/request, and existing `reportError` funnel events are captured. Default PII collection stays disabled; `reportError` context must still never contain customer data, request bodies, credentials, or secrets.

Runtime variables are:

- `NEXT_PUBLIC_SENTRY_DSN` to enable monitoring
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, where only `production` selects production and other values resolve to development
- `NEXT_PUBLIC_SENTRY_RELEASE` for commit or image correlation
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, a fraction from 0 to 1; invalid values resolve to 0 and tracing defaults off

Readable production stack traces additionally need the build-time `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`. `next.config.ts` uploads source maps only when all three are present. Their absence must not fail local or CI builds; error events can still arrive with minified stacks.

These public runtime variables must be available while building the browser bundle, not added only after the image is built. The current deploy workflow does not pass Sentry variables into the Docker build or Cloud Run service, so a production operator must extend the deployment environment deliberately before treating monitoring as active. Verify one controlled non-sensitive error in the Sentry project after rollout and confirm its environment and release tags.

## Spoken Channels Configuration

Live voice and inbound phone calls need runtime configuration beyond normal
text chat. The app can still run without these variables, but spoken surfaces
will refuse sessions or show configuration errors until the required provider
and relay values are present.

Google live voice relay sessions require:

- `VOICE_RELAY_URL` for the relay endpoint, using its `/` or `/live` browser path.
- `VOICE_RELAY_SECRET` for encrypting/authenticating relay tickets and relay-only platform requests.
- `TELEPHONY_STREAM_URL` when the same relay is used for phone-call media
  streaming; this URL must use the relay's `/twilio` path.

Inbound Twilio-style calls require:

- `TWILIO_AUTH_TOKEN`, or `CONNECTOR_SECRET_TWILIO_AUTH_TOKEN` when the secret is
  managed through the connector-secret path.
- `TELEPHONY_PUBLIC_URL` for the inbound voice webhook URL.
- `TELEPHONY_STATUS_PUBLIC_URL` for the call-status callback URL.
- `TELEPHONY_NUMBER_OWNERS` to map phone numbers to company ownership.

Optional admission controls are `TELEPHONY_MAX_CONCURRENT_CALLS`, which defaults
to 4, and `TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR`, which defaults to 6.

Real-time spoken sessions also require a configured `realtime` model default.
Google live-audio sessions use the relay path. OpenAI realtime sessions need an
`OPENAI_API_KEY` and a compatible realtime model. See
[Spoken Channels](./spoken-channels.md) for the product and implementation
contract.

Receptionist screens use the same live relay and `realtime` model default as
spoken channels, but the current kiosk action only opens Google Vertex
speech-to-speech relay sessions. Missing relay values or an incompatible model
produce visitor-safe unavailable copy on `/kiosk/[widgetId]`.

## Widget Embedding Configuration

Public embedded widget sessions require a shared signing secret:

- `WIDGET_EMBED_SIGNING_SECRET`

The Next.js runtime that serves `/w/[widgetId]` uses this value to mint a signed
embed pass over the widget id, request referrer host, and issue time. Convex
uses the same value inside `createWidgetThread` to verify that pass before
opening an anonymous widget conversation. If the value is missing in either
runtime, the widget page may render but conversation creation fails closed.

Per-widget `frame-ancestors` enforcement also requires
`NEXT_PUBLIC_CONVEX_URL` at request time so `src/proxy.ts` can read the widget's
allowed domains before serving `/w/[widgetId]`.

## Residual Connector OAuth And Gmail Retirement

The Gmail mailbox surface and polling are retired; see the [retirement note](./gmail-mailbox.md). Do not configure a fresh mailbox or advertise a Connect mailbox workflow from this deployment guide. Generic OAuth infrastructure and provider requirement names remain, including `CONNECTOR_GOOGLE_CLIENT_ID`, `CONNECTOR_GOOGLE_CLIENT_SECRET` and `CONNECTOR_TOKEN_ENCRYPTION_KEY`. Their presence does not prove an offered Gmail catalog item or running inbox watcher. Partial provider groups can still be reported by setup validation. The current connector runtime is covered in [AI Tools And Connectors](./ai-tools-and-connectors.md).

## Rolling Back

Find the SHA you want (the deploy job's summary prints the deployed SHA, and
`git log main` gives you the previous one), then point the service at it:

```bash
gcloud run services update hakken-app --region us-central1 --image us-central1-docker.pkg.dev/$GCP_PROJECT/hakken-repo/hakken-app:<PREVIOUS_SHA>
```

Confirm the rollback took effect:

```bash
curl -s https://<service-url>/api/health?deps=1
```

The reported `version` should match `<PREVIOUS_SHA>`.

**Important caveat: this rolls back the application, not the database.**
`npx convex deploy` runs before the image is built and pushes schema changes
that are not versioned with the image. If a release included a schema or data
migration, rolling the image back leaves the app running against a newer schema.

Keep rollback viable by making schema changes **backwards compatible**: add
fields as optional, backfill them with a migration, and only make them required
in a later release once no running version writes rows without them. A release
that follows that rule is safe to roll back; one that does not is forward-only.

## Data Migrations

Schema deploys never touch existing rows, so adding a field to live data needs a
backfill. `convex/dataMigrations.ts` holds a registry of named migrations, each
processing one page per transaction and recording progress in the `dataMigrations`
table, so ordinary scheduled batches continue from a saved cursor. Restarting a failed migration through the maintenance script resets it to the beginning; that is different from normal continuation.

**Preferred: run them from the admin UI.** Settings → Scripts → *Apply pending
data migrations* starts every registered migration that has not completed, and
records the run with its actor in the maintenance script history and audit log.
Re-run it to see progress; it will not restart a migration already in flight.

The CLI equivalents are available for automation or when the admin UI is not
reachable.

List what is registered and what has run:

```bash
npx convex run dataMigrations:listStatus '{}'
```

Start one only after inspecting its current runner and prerequisites (ordinary completed/running runs are returned unchanged unless forced):

```bash
npx convex run dataMigrations:run '{"name":"2026-07-25-swarm-logs-company-id"}'
```

Rules for adding a migration:

- Name it `YYYY-MM-DD-short-description`; the name is the ledger's identity, so
  never rename or reuse one.
- Make it idempotent — skip rows already in the target state. A resumed or
  retried run must be safe.
- Leave rows alone when the source data is genuinely absent rather than
  inventing a value.
- A completed migration will not re-run without `force: true`.
- Script SUCCESS can mean the background worker was scheduled, not that the migration completed. Check the named ledger and the [maintenance orchestration guide](./maintenance-scripts.md). Failed or stalled worker recovery and historical input retention require their own review.

## Pre-Deployment Setup Validation

Before handing a fresh environment to operators, run the production setup validator from an environment that has the same runtime variables available:

```bash
npm run setup:validate -- --profile=production
```

The validator is implemented in `scripts/validate-setup.mjs`. It reads `.env`, then `.env.local`, then the current process environment, with later sources taking precedence. It validates shape and presence only; it does not contact providers or print secret values.

The validator derives provider requirements from `hakken.product.json`, `scripts/provider-requirements.mjs` and optional billing configuration. Selected production capabilities require their configured credential groups; partial groups can fail even when the capability was not selected. It checks key presence and specific URL/email/billing-mode shapes, not that arbitrary stored credentials authenticate. Product selection and backend-saved settings can differ, so this does not replace the owning feature's operator acceptance.

Production requires public HTTPS URLs without embedded credentials for the checked origins, rejects loopback addresses and anonymous local Convex deployment names, and compares configured app origins where applicable. It validates a bootstrap email when provided and checks an explicitly configured sender's shape. Billing-enabled validation checks origin agreement and Stripe key mode without making a payment request. Missing local optional capabilities can be warnings instead of failures. `--strict` makes warnings block setup handoff.

`verify:deployment` is a separate command that calls the selected Convex environment through the CLI and checks setting names. It is not purely local setup validation and was not run here. Neither command proves live Google/Stripe acceptance, rename cutover, current auth sessions or a functioning voice relay. Runtime variables belong in the correct Next.js, Convex or relay service rather than being assumed propagated from one environment to all three.

## 🔐 Required GitHub Secrets

The automation requires the following secrets to be configured in GitHub Actions:

- `CONVEX_DEPLOY_KEY`: Required for schema synchronization.
- `GCP_CREDENTIALS`: Required for Google Cloud authentication.
- `GCP_PROJECT`: Required for Artifact Registry and Cloud Run deployment.
- `NEXT_PUBLIC_CONVEX_URL`: Passed to the Docker build and Cloud Run service.
- `CONVEX_SITE_URL`: Passed to the Docker build and Cloud Run service for HTTP action links.
- `CONVEX_DEPLOYMENT`: Passed to the Docker build and Cloud Run service.
- `NEXT_PUBLIC_CONTACT_URL`: Optional public contact destination passed into the browser build; absent uses the app fallback.
- `SOCKET_SECURITY_API_KEY`: Used by the separate dev-push dependency scan in CI, not by the production app.

The Cloud Run environment currently receives only `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_SITE_URL`, and `CONVEX_DEPLOYMENT` from this workflow. Runtime secrets for auth, AI providers, Resend, Firecrawl, Apify, and platform alerts must be configured in the target Convex/Cloud Run environment as appropriate; do not assume adding a GitHub secret automatically exposes it to the running service.

## Fresh Deployment Smoke Checklist

After deployment:

- Sign in with the intended auth provider.
- Confirm the first super-admin can reach `/admin`.
- Confirm tenant admins see only their own company data.
- Confirm model defaults resolve for chat, agent, workflow, report, and embedding use cases.
- Run one draft-agent smoke eval before activating the agent.
- Open System Health and confirm there are no unexpected critical alert rules.
- Export the System Health report and attach it to the deployment handoff.

---

> [!CAUTION]
> **Vercel Prohibited**: Never deploy Hakken to Vercel. The infrastructure relies exclusively on the Google Cloud / Convex synchrony.

## Release Evidence And Failure Boundaries

Direct pushes to `dev` also run the Socket dependency security scan before the normal gates. It installs the isolated `tools/socket-ci` dependency tree and calls its CLI with `SOCKET_SECURITY_API_KEY`; pull requests do not run that secret-dependent step. The root package cache and the Socket tool installation are separate. Documentation-only dev pushes skip CI under the current path filters, but pull requests do not skip merely because they contain Markdown.

The deploy's reuse check reads up to one hundred workflow runs and walks at most fifty ancestors. It accepts a successful CI result for the current SHA, or an ancestor whose difference is limited to `docs/` and Markdown paths. If it cannot establish coverage, it runs its listed source gates itself. The filter is source-based; it is not a claim that the current SHA underwent a fresh browser or live-provider test. Branch-protection configuration and required-check settings are external state and were not queried in this review.

Backend deployment happens before Docker build and frontend release. If a later image build or Cloud Run update fails, the backend may already be newer. Image rollback changes the frontend image only; it does not reverse data migrations, backend deployment or supplier-side state. The Docker image's SHA tag is an addressable release handle, not proof that a registry retention policy will keep it forever. Confirm availability before any separately authorized recovery action.

The runner image uses a non-root user, standalone Next output and port 3000. Its liveness probe does not request dependencies. Default health can return 200 with absent Convex configuration because that mode skips the dependency check; inspect the configured flags as well as the status. Readiness's network result is intentionally weaker than an authenticated backend smoke test. No health URL was requested here.

This source review covered workflow triggers/steps, Docker stages and exclusions, package/version gates, coverage configuration, mocked versus real-auth lanes, health implementation, setup validation and the existing migration/runtime configuration references. It did not install dependencies, run application gates, inspect GitHub secrets, deploy, query a live service or perform rollback. PRODUCT.md section 33's external rename cutover remains a separate acceptance concern. The voice relay lives under `services/voice-relay` and is excluded from this frontend Docker context; this app deployment does not implicitly release that service.
