# Local Demo Seed Runbook

Use this runbook when an operator needs a local, no-production-credentials demo tenant for trying the governed agentic app foundation. The seed is for local development and demo preparation only. It must not be used to prepare production customer data.

Implementation source of truth:

- `scripts/local-demo-seed.mjs`
- `convex/localDemoSeed.ts`
- `convex/localDemoSeed.test.ts`
- `docs/developer/new-agentic-app-setup-checklist.md`
- `docs/developer/agentic-starter-framework-overview.md`

## When To Use It

Use the local demo seed when you need to show or test:

- a seeded demo company
- deterministic demo admin users
- model/provider defaults without relying on production credentials
- starter tenant knowledge
- the `knowledge.search` AI tool
- a draft demo agent with linked knowledge and eval fixtures

Do not use it for production setup, customer onboarding, migration, or support-data repair.

## Safety Gates

The seed fails closed unless all required controls are present:

- `LOCAL_DEMO_SEED_ENABLED` must be `1`.
- `LOCAL_DEMO_SEED_SECRET` must be configured.
- The secret passed to the mutation must match `LOCAL_DEMO_SEED_SECRET`.
- `LOCAL_DEMO_SEED_ENVIRONMENT` must not be `production`.

The script also requires a Convex URL. It resolves the URL in this order:

1. `LOCAL_DEMO_SEED_CONVEX_URL`
2. `NEXT_PUBLIC_CONVEX_URL`
3. `NEXT_PUBLIC_CONVEX_URL` from `.env.local`
4. `http://127.0.0.1:3210`

Keep the seed secret local. Do not commit it to the repository, paste it into docs, or reuse a production secret.

## Prerequisites

1. Confirm the current branch is `dev`.
2. Install dependencies with the Node version required by the repository.
3. Start the local Convex service with `npm run convex:dev`.
4. Confirm the web app can reach the same Convex deployment if the demo will be viewed in the browser.
5. Configure Convex environment values for the local deployment:

```bash
LOCAL_DEMO_SEED_ENABLED=1
LOCAL_DEMO_SEED_SECRET=replace-with-local-secret
```

Only set `LOCAL_DEMO_SEED_ENVIRONMENT` when you intentionally need the production guard to block seeding.

## Run The Seed

From the repository root:

```bash
LOCAL_DEMO_SEED_SECRET=replace-with-local-secret npm run demo:local:seed
```

If the local Convex URL is not discoverable from `.env.local`, pass it explicitly:

```bash
LOCAL_DEMO_SEED_CONVEX_URL=http://127.0.0.1:3210 LOCAL_DEMO_SEED_SECRET=replace-with-local-secret npm run demo:local:seed
```

The script prints created or updated state for the company, users, models, defaults, tool, agent, knowledge, and eval fixtures.

## Seeded Records

The seed is idempotent. Re-running it updates existing deterministic records instead of creating duplicate demo foundations.

Seeded company:

- `Hakken Demo Company`

Seeded users:

- `demo-super-admin@sonae.test` as `SUPER_ADMIN`
- `demo-company-admin@sonae.test` as `ADMIN` for the demo company

Seeded provider and models:

- Google Vertex provider metadata with local-demo sync status
- default generation model using the system failsafe model id
- embedding model `text-embedding-004`
- global defaults for `agent`, `workflow`, `chat`, `report`, and `embedding`

Seeded agent foundation:

- `Demo Knowledge Assistant`
- template id `internal-knowledge-assistant`
- inactive draft status
- inherited model selection
- tenant-scoped starter knowledge
- `knowledge.search` tool binding
- active starter eval fixtures from the template

## Post-Run Checks

After the seed completes:

1. Open the admin dashboard with the demo super-admin or company-admin identity supported by the local auth setup.
2. Confirm the demo company exists.
3. Confirm the demo company admin is scoped to the demo company.
4. Confirm AI model defaults exist for agent, workflow, chat, report, and embedding.
5. Open the demo agent and confirm it is inactive.
6. Confirm readiness shows linked knowledge, one tool binding, active eval fixtures, and a smoke-eval warning.
7. Open knowledge management and confirm the demo handbook is ready.

Do not activate the demo agent until smoke evals are run and reviewed.

## Expected Failures

Common failure messages:

- `LOCAL_DEMO_SEED_SECRET is required.`: pass the script environment variable.
- `Local demo seed is disabled.`: set `LOCAL_DEMO_SEED_ENABLED=1` in the Convex environment for the local deployment.
- `Local demo seed secret is not configured.`: configure `LOCAL_DEMO_SEED_SECRET` in the Convex environment.
- `Invalid local demo seed secret.`: the script secret does not match the Convex environment secret.
- `Local demo seed is not available in production.`: the production guard is active; do not bypass it for production.

If the script cannot connect to Convex, confirm `npm run convex:dev` is running and set `LOCAL_DEMO_SEED_CONVEX_URL` explicitly.

## Cleanup And Reuse

The seed is designed for repeatable local use, not cleanup. Re-running it updates the deterministic demo records and only creates missing eval fixtures. If you need a clean demo database, reset the local Convex deployment rather than deleting individual records manually.

Before using the seeded state in a customer-facing recording or rehearsal, replace or clearly explain fake records and local-only identities. The seeded users, handbook, and connector tasks are sample data.
