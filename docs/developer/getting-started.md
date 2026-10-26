---
product: Hakken
documentation_type: Developer guide
feature_area: Local development and verification
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/getting-started.md
last_reviewed: '2026-10-26T14:51:32+00:00'
reviewed_against: current implementation
status: Current
---
# Getting Started

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Local development and verification
> **Reviewed:** 26 October 2026, 14:51:32 GMT (Europe/London)
> **Source path:** `docs/developer/getting-started.md` · **Status:** Current

Follow these steps to set up the Hakken development environment on your local machine.

For a new product clone, start with [Product Setup](../operator/product-setup.md).
Then use the [Feature Generator](./feature-generator.md) to add product records,
forms, relationships and tenant access from a previewable command.
It previews product defaults and provider requirements before applying local file changes.

## Prerequisites

- **Node.js**: `24.22.1` (`.nvmrc` / `.node-version`).
- **Package Manager**: `npm` (standard for this project).
- **Convex Account**: Sign up at [convex.dev](https://www.convex.dev/).

## Local Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/roninsatwork/Hakken.git
    cd Hakken
    ```

2.  **Install Dependencies**:
    ```bash
    nvm use
    npm ci
    ```
    Run `npm ci` before trusting local checks. The repository's `predev`, `pretest`, `prebuild`, and `preconvex:dev` hooks run `npm run verify:env`, which verifies Node `24.22.1` and installed direct dependency versions against `package-lock.json`.

3.  **Environment Variables**:
    Create a `.env.local` file in the root directory. You can use `.env.example` as a template.
    ```bash
    cp .env.example .env.local
    ```
    > [!IMPORTANT]
    > Ensure `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` are correctly set for your local development.

4.  **Validate Setup**:
    ```bash
    npm run verify:env
    npm run setup:validate
    ```
    `npm run verify:env` is backed by `scripts/verify-local-environment.mjs`. It checks Node and installed direct dependency versions against `package-lock.json` so stale `node_modules` cannot make local verification look healthier than CI.

    `npm run setup:validate` is backed by `scripts/validate-setup.mjs`. It checks local Convex configuration, auth/provider readiness, and optional ingestion credentials without printing secret values.

5.  **Run Development Servers**:
    You need to run both the Next.js dev server and the Convex backend.

    - **Terminal 1 (Frontend)**:
      ```bash
      npm run dev
      ```
    - **Terminal 2 (Backend)**:
      ```bash
      npm run convex:dev
      ```

## Local Test Auth

For deterministic local E2E sessions, use the local test-auth helpers only in an explicitly configured local environment:

```bash
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_ENVIRONMENT=local LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth npm run convex:dev
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_ENVIRONMENT=local LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth npm run auth:local:seed
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_ENVIRONMENT=local npm run dev
LOCAL_TEST_AUTH_SECRET=hakken-local-test-auth LOCAL_TEST_AUTH_BASE_URL=http://localhost:3000 npm run auth:local:state
```

The `/local-test-auth` route also needs `LOCAL_TEST_AUTH_ENABLED=1` and `LOCAL_TEST_AUTH_ENVIRONMENT=local` in the Next.js process; the backend provider and seed/authorize functions need both settings in the Convex process. The generated storage states live under `e2e/.auth/` and should not be committed. For details, read [Local Test Auth Runbook](../operator/local-test-auth-runbook.md).

## Running Tests

Hakken uses Vitest for unit/integration tests and Playwright for browser tests.

- **Unit and integration tests**:
  ```bash
  npm run test:run
  ```
- **Browser tests**:
  ```bash
  npm run test:e2e
  ```
- **Full Local Check**:
  ```bash
  npm run check
  ```
- **Build Check**:
  ```bash
  npm run build
  ```
- **Coverage**:
  ```bash
  npm run test:coverage
  npm run coverage:check
  ```
  Coverage is configured in `vitest.config.ts`. The coverage run includes `src/**/*.{ts,tsx}` and `convex/**/*.ts`, excludes generated files, test files, config files, `src/e2e/**`, and seed/cron entry points, and writes text, HTML, and JSON-summary reports under `coverage/`. Thresholds are read from `coverage-thresholds.json`; `npm run coverage:check` uses the generated `coverage/coverage-summary.json` and the same threshold file so local and CI checks fail on the same floor.

Before proposing a merge or push, follow the current complete gates in [AGENTS.md](../../AGENTS.md), including coverage and browser smoke where required. The package `check` command is only part of that full gate.

## 💡 Quick Tips

- Use the `dev` branch for all active coding.
- Push to `main` only when you intend to trigger the production deploy workflow.
- Run `npm run setup:validate -- --profile=production` before handing a new product or deployment environment to operators.
- Never use `window.alert` or `confirm`. Use the **`HakkenModal`** component found in `src/ui/components/feedback`.
- Layouts are fluid by default; avoid fixed widths in your CSS/Tailwind classes.

## Establish Repository Identity Before Work

Run `git rev-parse --show-toplevel`, inspect the current branch and status, and read current AGENTS.md and PRODUCT.md before editing. The configured checkout may have a different folder spelling; origin and product files establish identity. This workspace is Hakken, with origin `roninsatwork/Hakken`; the separate Sonae repository is upstream framework work and must not be modified by a Hakken task. Do not move to another checkout just because an old guide assumes a folder name.

Development belongs on dev. Main is production and a push triggers deployment. Preserve pre-existing changes, including uncommitted documentation or another worker's source edits. A documentation pass must not stash, overwrite, commit, push, or deploy simply to make its verification easier. Network refresh, dependency installation, live operations and app startup are separate actions whose authorization comes from the task, not from this guide's example commands.

## What Environment Verification Proves

The current package engines require Node at least 24.22.1 within major 24 and npm major 11. `.nvmrc` and `.node-version` specify 24.22.1. `verify-local-environment.mjs` checks the running Node baseline and each installed direct dependency against its exact package-lock entry. It can detect missing or stale direct packages; it does not validate every transitive package, native binary, provider permission, or backend deployment.

Use `npm ci` when setting up or intentionally refreshing implementation verification. It changes the dependency tree and can require network access. A scheduled documentation task does not need to install packages or run the app merely to inspect scripts. Do not report gates as passed unless they actually ran in the required environment. Record an unrun check separately from a failed one.

`check` performs environment verification, source guards, theme record checks, lint, cold typechecking and the measured test run. Coverage thresholds, browser smoke and build have separate scripts and remain part of the current AGENTS merge/push requirements. The test-speed wrapper reads timing output; a targeted passing test is not a substitute for the full authorized gate when that gate is required. Conversely, documentation-only maintenance should use relevant Markdown/diff checks without launching application suites just to create more activity.

## Local And Production Configuration

Frontend public configuration and backend runtime configuration are different surfaces. The normal Convex client URL is not the HTTP Actions site origin. A local `.env.local` file is not proof that the selected Convex deployment has the same values. Never paste environment files or credential values into reports. The [environment reference](./convex-environment-variables.md) lists variable names and owning runtime paths.

Setup validation checks declared product/provider requirements and URL shapes with local or production profiles. Production validation has stronger origin/HTTPS and required-key expectations; strict mode can make warnings fail. It does not make paid calls to prove every integration works or repair accepted rename cutover issues. A passing configuration check, a passing local feature test, and live provider acceptance are separate evidence.

Local authentication helpers exist for explicitly local testing. Do not carry their enablement or deterministic credentials into production. The real-auth Playwright configuration and mock browser fixtures are distinct paths. Read [Local test auth](../operator/local-test-auth-runbook.md) before running either helper, and preserve its exact environment guards. This documentation review did not run seed/login/state generation or open a browser.

## Find The Existing Implementation First

Use the shared screen kit, hooks, backend service helpers and existing feature guides before adding components or queries. The frontend guide explains the fluid shell and current route layout; the backend guide explains tenant wrappers and durable action/queue boundaries. Source searches should start with `rg` and targeted reads, avoiding dumps of secret-bearing configuration.

The approved theme is recorded in `hakken.theme.json` and saved platform settings; use the drawing/screen-kit procedures rather than copying a color from a historical design. User-entered content is written in English and translated through the existing content flow, while interface dictionaries maintain parity. A new form, table, or modal must follow current AGENTS/UI conventions rather than an older setup screenshot.

Keep PRODUCT.md, dated research and verification records distinct from current implementation guides. New website and Insights code can disagree with older product-status prose; report that discrepancy rather than declaring the whole planned product delivered. The [documentation index](../index.md) is the front door and persistent review queue. This guide was refreshed from local scripts/configuration without installing dependencies, starting services, changing environment values, running gates or deploying anything.
