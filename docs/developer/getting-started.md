# Getting Started

Follow these steps to set up the Sonae development environment on your local machine.

## Prerequisites

- **Node.js**: `24.18.0` (`.nvmrc` / `.node-version`).
- **Package Manager**: `npm` (standard for this project).
- **Convex Account**: Sign up at [convex.dev](https://www.convex.dev/).

## Local Setup

1.  **Clone the Repository**:
    ```bash
    git clone <repository-url>
    cd Sonae
    ```

2.  **Install Dependencies**:
    ```bash
    nvm use
    npm ci
    ```
    Run `npm ci` before trusting local checks. The repository's `predev`, `pretest`, `prebuild`, and `preconvex:dev` hooks run `npm run verify:env`, which verifies Node `24.18.0` and installed direct dependency versions against `package-lock.json`.

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
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npm run convex:dev
LOCAL_TEST_AUTH_ENABLED=1 LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth npm run auth:local:seed
LOCAL_TEST_AUTH_ENABLED=1 npm run dev
LOCAL_TEST_AUTH_SECRET=sonae-local-test-auth LOCAL_TEST_AUTH_BASE_URL=http://localhost:3000 npm run auth:local:state
```

The `/local-test-auth` route also needs `LOCAL_TEST_AUTH_ENABLED=1` in the Next.js process; the backend provider and seed/authorize functions need it in the Convex process. The generated storage states live under `e2e/.auth/` and should not be committed. For details, read [Local Test Auth Runbook](../operator/local-test-auth-runbook.md).

## Running Tests

Sonae uses Vitest for unit/integration tests and Playwright for browser tests.

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

Before asking to merge or push implementation changes, follow the repo gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## 💡 Quick Tips

- Use the `dev` branch for all active coding.
- Push to `main` only when you intend to trigger the production deploy workflow.
- Run `npm run setup:validate -- --profile=production` before handing a new product or deployment environment to operators.
- Never use `window.alert` or `confirm`. Use the **Sonae Modal** component found in `src/ui/components/feedback`.
- Layouts are fluid by default; avoid fixed widths in your CSS/Tailwind classes.
