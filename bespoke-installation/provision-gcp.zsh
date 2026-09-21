#!/usr/bin/env zsh

# provision-gcp.zsh
# Automates the creation of a GCP Project, enabling APIs, and setting up Service Accounts.

set -e

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <PROJECT_ID> <BILLING_ACCOUNT_ID> [REGION]"
    echo "Example: $0 hakken-client-abc 012345-6789AB-CDEF01 us-central1"
    exit 1
fi

PROJECT_ID=$1
BILLING_ACCOUNT_ID=$2
REGION=${3:-us-central1}
SERVICE_ACCOUNT_NAME="github-deployer"
REPO_NAME="sonae-repo"

echo "🚀 Starting GCP Provisioning for Project: $PROJECT_ID..."

# 1. Create Project
echo "🏗️ Creating project $PROJECT_ID..."
gcloud projects create "$PROJECT_ID" --name="Hakken Platform - $PROJECT_ID"

# 2. Link Billing
echo "💳 Linking billing account $BILLING_ACCOUNT_ID..."
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID"

# 3. Enable Required APIs
echo "🔌 Enabling required APIs..."
gcloud services enable \
    compute.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    iam.googleapis.com \
    aiplatform.googleapis.com \
    --project "$PROJECT_ID"

# 4. Create Service Account for GitHub Actions
echo "🆔 Creating Service Account: $SERVICE_ACCOUNT_NAME..."
gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="GitHub Actions Deployer" \
    --project "$PROJECT_ID"

# 5. Assign Roles
echo "🔑 Assigning IAM roles..."
ROLES=(
    "roles/run.admin"
    "roles/artifactregistry.admin"
    "roles/storage.admin"
    "roles/iam.serviceAccountUser"
    "roles/browser"
    "roles/aiplatform.user"
)

for ROLE in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="$ROLE" \
        --quiet
done

# 6. Generate Key
echo "🎫 Generating Service Account Key..."
gcloud iam service-accounts keys create "gcp-key-$PROJECT_ID.json" \
    --iam-account="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --project "$PROJECT_ID"

# 7. Create Artifact Registry
echo "📦 Creating Artifact Registry: $REPO_NAME..."
gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project "$PROJECT_ID"

echo "✅ GCP Provisioning Complete!"
echo "📄 Service Account Key saved to: gcp-key-$PROJECT_ID.json"
echo "⚠️  REMEMBER: Configure the OAuth Consent Screen manually in the GCP Console."
