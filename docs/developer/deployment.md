# Infrastructure & Deployment

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

The deployment sequence is managed by `.github/workflows/deploy.yml`.

### Sequence:
1.  **Testing Firewall**: Runs `npm audit --audit-level=high`, `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run build`. Deployment halts if any check fails.
2.  **Convex Synchrony**: Executes `npx convex deploy` to push schema and background adjustments.
3.  **Container Build**: Builds the Docker image and pushes it to the registry.
4.  **Cloud Run Rollout**: Deploys the new container image to Google Cloud Run.

## Pre-Deployment Setup Validation

Before handing a fresh environment to operators, run the production setup validator from an environment that has the same runtime variables available:

```bash
npm run setup:validate -- --profile=production
```

The validator checks:

- Convex deployment URL and deployment name.
- Public app URL and bootstrap super-admin fallback.
- At least one production auth provider.
- At least one live AI provider credential group.
- Optional ingestion providers such as Firecrawl and Apify.

It reports pass, warning, and failure rows without printing secret values. Use `-- --profile=production --strict` when warnings should block handoff.

## 🔐 Required GitHub Secrets

The automation requires the following secrets to be configured in GitHub Actions:

- `CONVEX_DEPLOY_KEY`: Required for schema synchronization.
- `GCP_CREDENTIALS`: Required for Google Cloud authentication.
- `GCP_PROJECT`: Required for Artifact Registry and Cloud Run deployment.
- `NEXT_PUBLIC_CONVEX_URL`: Passed to the Docker build and Cloud Run service.
- `CONVEX_DEPLOYMENT`: Passed to the Docker build and Cloud Run service.

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
