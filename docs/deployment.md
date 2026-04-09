# Infrastructure & Deployment

Sonae is designed for high availability and continuous delivery via Google Cloud Platform and GitHub.

## 🚢 Hosting Environment

- **Frontend & App Runner**: Next.js is containerized and hosted on **Google Cloud Run**.
- **Backend & Database**: Managed by **Convex**.
- **Container Registry**: Google Artifact Registry (GCR).

## 🌳 Branching Protocol

Strict adherence to branching rules is required to protect the production environment.

1.  **`dev` Branch**: Active development, feature implementation, and experimentation. This is the workspace for daily coding.
2.  **`main` Branch**: Production-ready code. Merging `dev` into `main` triggers a production deployment.

## 🚀 CI/CD Pipeline (GitHub Actions)

The deployment sequence is managed by `.github/workflows/deploy.yml`.

### Sequence:
1.  **Testing Firewall**: Runs `vitest` (frontend) and `convex-test` (backend). Deployment halts if any test fails.
2.  **Convex Synchrony**: Executes `npx convex deploy` to push schema and background adjustments.
3.  **Container Build**: Builds the Docker image and pushes it to the registry.
4.  **Cloud Run Rollout**: Deploys the new container image to Google Cloud Run.

## 🔐 Required GitHub Secrets

The automation requires the following secrets to be configured in GitHub Actions:

- `CONVEX_DEPLOY_KEY`: Required for schema synchronization.
- `GCP_PROJECT_ID`, `GCP_SERVICE_ACCOUNT_KEY`: Required for Cloud Run deployment.

---

> [!CAUTION]
> **Vercel Prohibited**: Never deploy Sonae to Vercel. The infrastructure relies exclusively on the Google Cloud / Convex synchrony.
