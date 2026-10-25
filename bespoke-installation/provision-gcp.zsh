#!/usr/bin/env zsh

# provision-gcp.zsh
# Automates the creation of a GCP Project, enabling APIs, and setting up Service Accounts.

set -e

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <PROJECT_ID> <BILLING_ACCOUNT_ID> [REGION] [KEY_DIRECTORY]"
    echo "Example: $0 hakken-client-abc 012345-6789AB-CDEF01 us-central1 /secure/temporary/directory"
    exit 1
fi

PROJECT_ID=$1
BILLING_ACCOUNT_ID=$2
REGION=${3:-us-central1}
KEY_DIRECTORY=${4:-$(mktemp -d "${TMPDIR:-/tmp}/hakken-provision.XXXXXX")}
DEPLOYER_ACCOUNT_NAME="github-deployer"
RUNTIME_ACCOUNT_NAME="hakken-runtime"
REPO_NAME="hakken-repo"

if [[ ! -d "$KEY_DIRECTORY" ]]; then
    echo "❌ Error: Key directory does not exist: $KEY_DIRECTORY"
    exit 1
fi

DEPLOYER_KEY_FILE="$KEY_DIRECTORY/gcp-deployer-key-$PROJECT_ID.json"
RUNTIME_KEY_FILE="$KEY_DIRECTORY/gcp-runtime-key-$PROJECT_ID.json"

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
echo "🆔 Creating deployment Service Account: $DEPLOYER_ACCOUNT_NAME..."
gcloud iam service-accounts create "$DEPLOYER_ACCOUNT_NAME" \
    --display-name="GitHub Actions Deployer" \
    --project "$PROJECT_ID"

echo "🆔 Creating runtime Service Account: $RUNTIME_ACCOUNT_NAME..."
gcloud iam service-accounts create "$RUNTIME_ACCOUNT_NAME" \
    --display-name="Hakken Runtime" \
    --project "$PROJECT_ID"

# 5. Assign Roles
echo "🔑 Assigning IAM roles..."
ROLES=(
    "roles/run.admin"
    "roles/artifactregistry.writer"
)

for ROLE in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$DEPLOYER_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="$ROLE" \
        --quiet
done

# The deployed service runs as the narrow runtime identity. The deployer may
# attach that one identity, rather than impersonating every service account in
# the project.
gcloud iam service-accounts add-iam-policy-binding \
    "$RUNTIME_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --member="serviceAccount:$DEPLOYER_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --project "$PROJECT_ID" \
    --quiet

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user" \
    --quiet

# 6. Generate Key
echo "🎫 Generating separate deployment and runtime keys..."
gcloud iam service-accounts keys create "$DEPLOYER_KEY_FILE" \
    --iam-account="$DEPLOYER_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --project "$PROJECT_ID"
gcloud iam service-accounts keys create "$RUNTIME_KEY_FILE" \
    --iam-account="$RUNTIME_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --project "$PROJECT_ID"
chmod 600 "$DEPLOYER_KEY_FILE" "$RUNTIME_KEY_FILE"

# 7. Create Artifact Registry
echo "📦 Creating Artifact Registry: $REPO_NAME..."
gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project "$PROJECT_ID"

echo "✅ GCP Provisioning Complete!"
echo "📄 Deployment key: $DEPLOYER_KEY_FILE"
echo "📄 Runtime key: $RUNTIME_KEY_FILE"
echo "⚠️  Remove that temporary directory as soon as its keys have been installed. master-setup.zsh does this automatically."
echo "⚠️  REMEMBER: Configure the OAuth Consent Screen manually in the GCP Console."
