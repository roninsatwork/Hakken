#!/usr/bin/env zsh

# provision-github.zsh
# Automates setting up GitHub Secrets for the deployment pipeline.

set -e

if [[ $# -lt 5 ]]; then
    echo "Usage: $0 <PROJECT_ID> <GCP_KEY_FILE> <NEXT_PUBLIC_CONVEX_URL> <CONVEX_DEPLOYMENT> <GITHUB_REPOSITORY>"
    exit 1
fi

PROJECT_ID=$1
GCP_KEY_FILE=$2
NEXT_PUBLIC_CONVEX_URL=$3
CONVEX_DEPLOYMENT=$4
GITHUB_REPOSITORY=$5

if [[ -z "$CONVEX_DEPLOY_KEY" ]]; then
    echo "❌ Error: CONVEX_DEPLOY_KEY must be supplied in the environment."
    exit 1
fi

if [[ ! $GITHUB_REPOSITORY =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    echo "❌ Error: GitHub repository must be an explicit owner/repository name."
    exit 1
fi

if [[ ! -f "$GCP_KEY_FILE" ]]; then
    echo "❌ Error: GCP Key file $GCP_KEY_FILE not found."
    exit 1
fi

echo "🔐 Injecting GitHub Secrets for Project: $PROJECT_ID into $GITHUB_REPOSITORY..."

# Check if authenticated with gh
if ! gh auth status > /dev/null 2>&1; then
    echo "❌ Error: Not authenticated with GitHub CLI. Run 'gh auth login' first."
    exit 1
fi

# Set Secrets
echo "📤 Setting GCP_PROJECT..."
print -rn -- "$PROJECT_ID" | gh secret set GCP_PROJECT --repo "$GITHUB_REPOSITORY"

echo "📤 Setting GCP_CREDENTIALS..."
gh secret set GCP_CREDENTIALS --repo "$GITHUB_REPOSITORY" < "$GCP_KEY_FILE"

echo "📤 Setting CONVEX_DEPLOY_KEY..."
print -rn -- "$CONVEX_DEPLOY_KEY" | gh secret set CONVEX_DEPLOY_KEY --repo "$GITHUB_REPOSITORY"

echo "📤 Setting NEXT_PUBLIC_CONVEX_URL..."
print -rn -- "$NEXT_PUBLIC_CONVEX_URL" | gh secret set NEXT_PUBLIC_CONVEX_URL --repo "$GITHUB_REPOSITORY"

echo "📤 Setting CONVEX_DEPLOYMENT..."
print -rn -- "$CONVEX_DEPLOYMENT" | gh secret set CONVEX_DEPLOYMENT --repo "$GITHUB_REPOSITORY"

echo "✅ GitHub Secrets successfully configured!"
