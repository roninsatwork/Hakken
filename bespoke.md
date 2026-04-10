# Bespoke Deployment Guide: Sonae Platform

This document outlines the process for deploying a fresh, isolated white-label instance of the Sonae Platform for a specific client.

## 🛠️ Prerequisites

Before starting, ensure you have the following tools and information:
*   **CLIs:** `gcloud`, `gh` (GitHub CLI), `npx convex`, `jq`.
*   **Authentication:** 
    *   Logged into GCP: `gcloud auth login`
    *   Logged into GitHub: `gh auth login`
    *   Logged into Convex: `npx convex login`
*   **Mandatory Info:** An active **GCP Billing Account ID**.

---

## 🏗️ 1. Infrastructure Preparation

### A. Google Cloud Platform (GCP)
1.  **Create Project:** Create a new project named `sonae-[client-name]`.
2.  **Enable APIs:** Enable the following services:
    *   Compute Engine API
    *   Cloud Run API
    *   Artifact Registry API
    *   Cloud Build API
    *   **Vertex AI API** (Required for LLM processing)
3.  **Create Service Account (`github-deployer`):**
    *   Assign Roles:
        *   `Cloud Run Admin`
        *   `Artifact Registry Administrator`
        *   `Storage Admin`
        *   `Service Account User`
        *   **`Vertex AI User`** (Crucial for Sonae AI features)
    *   **Generate Key:** Create a new JSON key. This key is used for both GitHub Actions and backend AI authentication.
4.  **Create Artifact Registry:** Repository named `sonae-repo` in the desired region (e.g., `us-central1`).
5.  **OAuth Consent Screen:** 
    *   Configure as "External".
    *   Add scopes: `openid`, `email`, `profile`.
6.  **Credentials:**
    *   Create **OAuth 2.0 Client ID** (Web application).
    *   **Authorized Redirect URIs:** 
        *   `https://[client-domain]/api/auth/callback/google`
        *   `https://[convex-deployment-name].convex.site/api/auth/callback/google`

### B. Resend Configuration (Email)
1.  **Verify Domain:** Add the client's sending domain to Resend.
2.  **DNS Records:** Add the required MX and SPF records to the client's DNS provider.
3.  **API Key:** Generate a new API Key with "Sending" permissions.
4.  **From Email:** Ensure the `RESEND_FROM_EMAIL` matches a verified domain (e.g., `Sonae <ai@client-domain.com>`).

---

## ⚙️ 2. Convex Environment Matrix

All variables below must be set in **Convex Dashboard > Settings > Environment Variables** for the **Production** deployment.

| Variable | Source | Purpose |
| :--- | :--- | :--- |
| `AUTH_GOOGLE_ID` | GCP Credentials | OAuth Login |
| `AUTH_GOOGLE_SECRET` | GCP Credentials | OAuth Login |
| `RESEND_API_KEY` | Resend | Magic Link Emails |
| `RESEND_FROM_EMAIL` | Resend | Sender Identity |
| `GOOGLE_CLOUD_PROJECT` | GCP Project ID | Vertex AI Context |
| `GOOGLE_CLOUD_LOCATION` | us-central1 (or other) | Vertex AI Region |
| `GOOGLE_CLIENT_EMAIL` | Service Account JSON | AI Authentication |
| `GOOGLE_PRIVATE_KEY` | Service Account JSON | AI Authentication |
| `SITE_URL` | Client Domain | Auth Redirects |
| `CONVEX_SITE_URL` | Convex Settings | Auth Callbacks |

---

## 🔐 3. GitHub Configuration

Add these to **GitHub Settings > Secrets and variables > Actions**:
*   `GCP_PROJECT`: GCP Project ID.
*   `GCP_CREDENTIALS`: Full content of the Service Account JSON key.
*   `CONVEX_DEPLOY_KEY`: From Convex Settings.
*   `CONVEX_DEPLOYMENT`: Convex deployment name (e.g. `prod-sonae-client`).
*   `NEXT_PUBLIC_CONVEX_URL`: Convex Production URL.

---

## 🚀 4. Initial Deployment & Sonae Polish

1.  **Hardcoded Admin Update:** In `convex/auth.ts`, update the `isSuperAdmin` check to the client's primary email.
2.  **Code Check:** Ensure no hardcoded strings from previous clients remain in the UI.
3.  **Deployment:** Merge `dev` to `main`. `git push origin main`.

---

## 🤖 5. Automated Deployment (Recommended)

The scripts in `bespoke-installation/` automate the bridge between GCP, Convex, and GitHub.

### 🏃 Execution
```zsh
cd bespoke-installation
./master-setup.zsh
```

### 🧠 Automation Logic
The orchestrator now:
1.  **Provisions GCP**: Creates project, SA, and registers APIs.
2.  **Parses JSON**: Automatically extracts `private_key` and `client_email` from the GCP Key.
3.  **Syncs Convex**: Injects ALL Vertex AI and OAuth variables into Convex via CLI.
4.  **Injects GitHub**: Configures all secrets for the CI/CD pipeline.

> [!IMPORTANT]
> Manual step remaining post-script: **GCP OAuth Consent Screen** configuration and **Resend Domain Verification**.
