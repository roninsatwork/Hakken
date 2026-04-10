#!/usr/bin/env zsh

# provision-github.zsh
# Automates setting up GitHub Secrets for the deployment pipeline.

set -e

if [[ $# -lt 5 ]]; then
    echo "Usage: $0 <PROJECT_ID> <GCP_KEY_FILE> <CONVEX_DEPLOY_KEY> <NEXT_PUBLIC_CONVEX_URL> <CONVEX_DEPLOYMENT>"
    exit 1
fi

PROJECT_ID=$1
GCP_KEY_FILE=$2
CONVEX_DEPLOY_KEY=$3
NEXT_PUBLIC_CONVEX_URL=$4
CONVEX_DEPLOYMENT=$5

if [[ ! -f "$GCP_KEY_FILE" ]]; then
    echo "❌ Error: GCP Key file $GCP_KEY_FILE not found."
    exit 1
fi

echo "🔐 Injecting GitHub Secrets for Project: $PROJECT_ID..."

# Check if authenticated with gh
if ! gh auth status > /dev/null 2>&1; then
    echo "❌ Error: Not authenticated with GitHub CLI. Run 'gh auth login' first."
    exit 1
fi

# Set Secrets
echo "📤 Setting GCP_PROJECT..."
gh secret set GCP_PROJECT --body "$PROJECT_ID"

echo "📤 Setting GCP_CREDENTIALS..."
gh secret set GCP_CREDENTIALS < "$GCP_KEY_FILE"

echo "📤 Setting CONVEX_DEPLOY_KEY..."
gh secret set CONVEX_DEPLOY_KEY --body "$CONVEX_DEPLOY_KEY"

echo "📤 Setting NEXT_PUBLIC_CONVEX_URL..."
gh secret set NEXT_PUBLIC_CONVEX_URL --body "$NEXT_PUBLIC_CONVEX_URL"

echo "📤 Setting CONVEX_DEPLOYMENT..."
gh secret set CONVEX_DEPLOYMENT --body "$CONVEX_DEPLOYMENT"

echo "✅ GitHub Secrets successfully configured!"
