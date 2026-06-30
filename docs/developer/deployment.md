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

Both workflows use Node `22.13.0` and `npm ci`. Both currently install `@rollup/rollup-linux-x64-gnu --no-save` after `npm ci` as a workaround for the npm optional dependency issue that can affect Rollup-based builds in CI.

### CI Workflow

The `CI` workflow runs:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:run`
4. `npm run test:e2e`
5. `npm run test:coverage`
6. `npm run coverage:check` when a coverage summary exists

Failed Playwright runs upload `playwright-report/`. Coverage runs upload `coverage/`.

### Production Deploy Workflow

The deployment sequence is managed by `.github/workflows/deploy.yml`:

1. Testing firewall: `npm audit --audit-level=high`, `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run build`.
2. Convex synchrony: `npx convex deploy` with `CONVEX_DEPLOY_KEY`.
3. Container build: Docker image built with `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` build args.
4. Registry push: image pushed to Google Artifact Registry.
5. Cloud Run rollout: image deployed to the `sonae-app` service in `us-central1` with port `3000`.

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
- `CONVEX_DEPLOYMENT`: Passed to the Docker build and Cloud Run service.

The Cloud Run environment currently receives only `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` from this workflow. Runtime secrets for auth, AI providers, Resend, Firecrawl, Apify, and platform alerts must be configured in the target Convex/Cloud Run environment as appropriate; do not assume adding a GitHub secret automatically exposes it to the running service.

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
