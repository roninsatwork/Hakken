# Infrastructure And Deployment

Sonae is designed for high availability and continuous delivery via Google Cloud Platform and GitHub.

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

- `.github/workflows/ci.yml` runs on pushes and pull requests targeting `dev` or `main`.
- `.github/workflows/deploy.yml` runs only on pushes to `main` and deploys production after its own gate passes.

Both workflows use Node `24.18.0` and `npm ci`. Both currently install `@rollup/rollup-linux-x64-gnu --no-save` after `npm ci` as a workaround for the npm optional dependency issue that can affect Rollup-based builds in CI.

### CI Workflow

The `CI` workflow has two jobs.

**Quick Checks** — every push and PR to `dev`, and every PR to `main`:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:coverage` (runs the full unit/integration suite)
4. `npm run coverage:check`

**Full Gate** — only on PRs into `main`, adding the browser suite:

1. `npm run test:e2e`
2. `npm run test:coverage`
3. `npm run coverage:check`

Coverage is enforced on `dev` too, not just on the way to `main`, because `dev`
previously accumulated changes with no coverage enforcement at all.

Failed Playwright runs upload `playwright-report/`. Coverage runs upload `coverage/`.

### Coverage Scope

`npm run coverage:check` gates on **platform code only**. The movement demo
(`src/app/(dashboard)/demos`, `src/lib/movements`, `convex/movements*`,
`scripts/movement-debug`) is reported alongside but not gated.

That split exists because the demo is roughly half of non-test `src/` and is
better covered than the platform is (74% versus 62% lines as of 2026-07-25), so
a single repo-wide number would let platform coverage fall while the headline
figure stayed healthy. Thresholds live in `coverage-thresholds.json`; `current`
is the gate and may never be set below `floor`, so the ratchet only turns one
way.

### Production Deploy Workflow

The deployment sequence is managed by `.github/workflows/deploy.yml`:

1. Testing firewall: `npm audit --omit=dev --audit-level=high`, `npm run check:guards`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run coverage:check`, and `npm run build`. The guards and the coverage gate are the same ones every PR passes — production is never held to a lower bar than a review branch.
2. Convex synchrony: `npx convex deploy` with `CONVEX_DEPLOY_KEY`.
3. Container build: Docker image built with `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_SITE_URL`, and `CONVEX_DEPLOYMENT` build args.
4. Registry push: image pushed to Google Artifact Registry.
5. Cloud Run rollout: image deployed to the `sonae-app` service in `us-central1` with port `3000`.

Every image is tagged twice: with the commit SHA and with `latest`. Cloud Run is
deployed from the **SHA tag**, so each revision records exactly which image is
serving traffic and previous images remain addressable.

The audit step is scoped with `--omit=dev` because the gate exists to block
shipping a vulnerable artifact, and devDependencies are not part of the deployed
image. It is not a blanket `npm audit`: the ESLint 9 toolchain transitively pins
`minimatch@3` -> `brace-expansion@1`, and advisory GHSA-mh99-v99m-4gvg has no
patched 1.x release. ESLint 10 resolves it, but `eslint-plugin-react` and
`eslint-plugin-jsx-a11y` still cap their peer range at ESLint 9, so the dev chain
cannot currently be made clean. `.github/workflows/security-audit.yml` runs
weekly and reports the full tree so the debt is tracked rather than hidden;
promote its full-tree step to blocking once those plugins support ESLint 10.

## Health Checks

- `GET /api/health` — liveness. No network calls, safe to poll frequently. This
  is what the container `HEALTHCHECK` uses; a failure means restarting the
  container is reasonable.
- `GET /api/health?deps=1` — readiness. Also confirms the Convex deployment
  answers over HTTP. Use this for external monitoring. A failure here is *not*
  fixed by a restart.

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

- `VOICE_RELAY_URL` for the relay endpoint.
- `VOICE_RELAY_SECRET` for signing relay tickets.
- `TELEPHONY_STREAM_URL` when the same relay is used for phone-call media
  streaming.

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

## Connector OAuth And Gmail

The Gmail mailbox connector needs connector OAuth configuration in addition to
normal outbound email settings. The app can install the connector without these
values, but the Connect mailbox flow will refuse to start until the provider is
fully configured.

Required for the Google Gmail connector:

- `CONNECTOR_GOOGLE_CLIENT_ID`
- `CONNECTOR_GOOGLE_CLIENT_SECRET`
- `CONNECTOR_TOKEN_ENCRYPTION_KEY`

The connector OAuth validator treats partial configuration as a setup problem:
all three values must be present or all three must be absent. A connected
mailbox also needs the `google-gmail` connector installed for the tenant, the
Convex site origin reachable for `/api/connectors/oauth/authorize` and
`/api/connectors/oauth/callback`, and a dedicated Gmail account approved through
Google's consent screen. See [Gmail Mailbox](./gmail-mailbox.md) for the runtime
contract.

## Rolling Back

Find the SHA you want (the deploy job's summary prints the deployed SHA, and
`git log main` gives you the previous one), then point the service at it:

```bash
gcloud run services update sonae-app --region us-central1 --image us-central1-docker.pkg.dev/$GCP_PROJECT/sonae-repo/sonae-app:<PREVIOUS_SHA>
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
table, so a run resumes from its cursor instead of restarting.

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

Run one (safe to re-run; migrations must be idempotent):

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

## Pre-Deployment Setup Validation

Before handing a fresh environment to operators, run the production setup validator from an environment that has the same runtime variables available:

```bash
npm run setup:validate -- --profile=production
```

The validator is implemented in `scripts/validate-setup.mjs`. It reads `.env`, then `.env.local`, then the current process environment, with later sources taking precedence. It validates shape and presence only; it does not contact providers or print secret values.

The validator checks:

- Convex deployment URL and deployment name.
- Public app URL and bootstrap super-admin fallback.
- At least one production auth provider.
- At least one live AI provider credential group.
- Optional ingestion providers such as Firecrawl and Apify, with `APIFY_WEBHOOK_SECRET` required when `APIFY_API_TOKEN` is configured.

For production, `NEXT_PUBLIC_APP_URL` and `INITIAL_SUPER_ADMIN_EMAIL` are required. Production validation fails when `NEXT_PUBLIC_CONVEX_URL` or `NEXT_PUBLIC_APP_URL` points at localhost, or when `CONVEX_DEPLOYMENT` starts with `anonymous:`. It warns when the Convex URL does not look like a hosted `.convex.cloud` URL.

Auth provider readiness accepts either complete Google OAuth credentials (`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`) or `RESEND_API_KEY`. Partial Google OAuth configuration is a failure. AI provider readiness accepts complete Google Vertex credentials (`GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`), OpenAI credentials (`OPENAI_API_KEY`, `OPEN_AI_API_KEY`, or `OPENAI_KEY`), or `ANTHROPIC_API_KEY`. The validator warns when a Google private key does not look like a service-account key.

It reports pass, warning, and failure rows without printing secret values. Use `-- --profile=production --strict` when warnings should block handoff.

## 🔐 Required GitHub Secrets

The automation requires the following secrets to be configured in GitHub Actions:

- `CONVEX_DEPLOY_KEY`: Required for schema synchronization.
- `GCP_CREDENTIALS`: Required for Google Cloud authentication.
- `GCP_PROJECT`: Required for Artifact Registry and Cloud Run deployment.
- `NEXT_PUBLIC_CONVEX_URL`: Passed to the Docker build and Cloud Run service.
- `CONVEX_SITE_URL`: Passed to the Docker build and Cloud Run service for HTTP action links.
- `CONVEX_DEPLOYMENT`: Passed to the Docker build and Cloud Run service.

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
> **Vercel Prohibited**: Never deploy Sonae to Vercel. The infrastructure relies exclusively on the Google Cloud / Convex synchrony.
