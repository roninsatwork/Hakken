#!/usr/bin/env zsh

# master-setup.zsh
# Primary orchestrator for bespoke client installation.

set -e

# Load styles
BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RESET="\033[0m"

echo "${BOLD}${BLUE}🔱 Hakken Bespoke Installation Orchestrator${RESET}"
echo "-----------------------------------------------"

# 1. Inputs
read "CLIENT_NAME?Enter Client Name (slug, e.g. acme): "
read "BILLING_ID?Enter GCP Billing Account ID: "
read "CLIENT_DOMAIN?Enter Client Domain (e.g. app.acme.com): "
read "GITHUB_REPOSITORY?Enter GitHub repository (owner/repository): "
read "CONVEX_URL?Enter Production Convex URL (e.g. https://xyz.convex.cloud): "
read -s "CONVEX_DEPLOY_KEY?Enter Convex Deploy Key: "
echo
read "CONVEX_DEPLOYMENT?Enter Convex Deployment Name: "
read "GOOGLE_CLIENT_ID?Enter Google OAuth Client ID: "
read -s "GOOGLE_CLIENT_SECRET?Enter Google OAuth Client Secret: "
echo
read -s "RESEND_API_KEY?Enter Resend API Key: "
echo
read "RESEND_FROM?Enter Resend From Email (e.g. ai@acme.com): "
read "SUPER_ADMIN_EMAIL?Enter the client's super-admin email (first sign-in with this address becomes SUPER_ADMIN): "

# A full deploy key starts `<type>:<deployment-name>|...`. Check the public
# prefix before any cloud resource or secret is changed; never print the token.
if [[ "$CONVEX_DEPLOY_KEY" != *:*\|* ]]; then
    echo "Invalid Convex deploy key: expected a full deployment-scoped key."
    exit 1
fi
DEPLOY_KEY_PREFIX=${CONVEX_DEPLOY_KEY%%|*}
DEPLOY_KEY_TARGET=${DEPLOY_KEY_PREFIX#*:}
if [[ "$DEPLOY_KEY_TARGET" != "$CONVEX_DEPLOYMENT" ]]; then
    echo "Convex target mismatch: the deploy key is for '$DEPLOY_KEY_TARGET', not '$CONVEX_DEPLOYMENT'."
    exit 1
fi
echo "Convex writes are bound to deployment: $DEPLOY_KEY_TARGET"
echo "GitHub writes are bound to repository: $GITHUB_REPOSITORY"

PROJECT_ID="hakken-prod-$CLIENT_NAME"
CONVEX_SITE_URL="${CONVEX_URL/convex.cloud/convex.site}" 
export CONVEX_DEPLOY_KEY

CREDENTIAL_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/hakken-provision.XXXXXX")
GCP_DEPLOYER_KEY_FILE="$CREDENTIAL_DIRECTORY/gcp-deployer-key-$PROJECT_ID.json"
GCP_RUNTIME_KEY_FILE="$CREDENTIAL_DIRECTORY/gcp-runtime-key-$PROJECT_ID.json"
trap 'rm -f -- "$GCP_DEPLOYER_KEY_FILE" "$GCP_RUNTIME_KEY_FILE"; rmdir -- "$CREDENTIAL_DIRECTORY" 2>/dev/null || true' EXIT

# 2. GCP Provisioning
echo "\n${BOLD}${BLUE}Step 1: Provisioning GCP Resources...${RESET}"
./provision-gcp.zsh "$PROJECT_ID" "$BILLING_ID" "us-central1" "$CREDENTIAL_DIRECTORY"

# 3. Extracting GCP Credentials for Convex
echo "\n${BOLD}${BLUE}Step 2: Extracting AI Credentials from Service Account...${RESET}"
GCP_CLIENT_EMAIL=$(jq -r '.client_email' "$GCP_RUNTIME_KEY_FILE")
GCP_PRIVATE_KEY=$(jq -r '.private_key' "$GCP_RUNTIME_KEY_FILE")

# 4. Convex Environment Synchronization
echo "\n${BOLD}${BLUE}Step 3: Synchronizing Convex Environment Variables...${RESET}"

# AI / Vertex Configuration
set_convex_env() {
    local name=$1
    local value=$2
    print -rn -- "$value" | npx convex env set "$name" --prod
}

set_convex_env GOOGLE_CLOUD_PROJECT "$PROJECT_ID"
set_convex_env GOOGLE_CLOUD_LOCATION "us-central1"
set_convex_env GOOGLE_CLIENT_EMAIL "$GCP_CLIENT_EMAIL"
set_convex_env GOOGLE_PRIVATE_KEY "$GCP_PRIVATE_KEY"

# Auth Configuration
set_convex_env AUTH_GOOGLE_ID "$GOOGLE_CLIENT_ID"
set_convex_env AUTH_GOOGLE_SECRET "$GOOGLE_CLIENT_SECRET"
set_convex_env SITE_URL "https://$CLIENT_DOMAIN"
set_convex_env CONVEX_SITE_URL "$CONVEX_SITE_URL"

# Resend Configuration
set_convex_env RESEND_API_KEY "$RESEND_API_KEY"
set_convex_env RESEND_FROM_EMAIL "$RESEND_FROM"

# First admin. The old runbook said to edit convex/auth.ts by hand; that
# setting no longer exists there, and following it left a deployment with no
# reachable admin. convex/authUserProvisioning.ts promotes the first sign-in
# from this address to SUPER_ADMIN, invite-only rules untouched.
set_convex_env INITIAL_SUPER_ADMIN_EMAIL "$SUPER_ADMIN_EMAIL"

# 5. GitHub Secret Injection
echo "\n${BOLD}${BLUE}Step 4: Configuring GitHub Secrets...${RESET}"
./provision-github.zsh "$PROJECT_ID" "$GCP_DEPLOYER_KEY_FILE" "$CONVEX_URL" "$CONVEX_DEPLOYMENT" "$GITHUB_REPOSITORY"
unset CONVEX_DEPLOY_KEY

# 6. Coverage check. The script above sets the core keys; the backend reads
# ~44. This names anything required that is still missing and lists which
# optional features stay off, instead of letting them fail silently later.
echo "\n${BOLD}${BLUE}Step 5: Verifying deployment environment coverage...${RESET}"
(cd .. && npm run verify:deployment -- --prod)

echo "\n${GREEN}${BOLD}✅ Bespoke Installation for $CLIENT_NAME initialized!${RESET}"
echo "-----------------------------------------------"
echo "Next Steps:"
echo "1. ${YELLOW}GCP Console:${RESET} Manually configure OAuth Consent Screen for '$PROJECT_ID'."
echo "2. ${YELLOW}Resend:${RESET} Ensure '$CLIENT_DOMAIN' is verified in Resend Dashboard."
echo "3. ${YELLOW}Sign-in:${RESET} '$SUPER_ADMIN_EMAIL' becomes SUPER_ADMIN on first sign-in (INITIAL_SUPER_ADMIN_EMAIL is already set)."
echo "4. ${YELLOW}Deploy:${RESET} Merge 'dev' to 'main' and push."
echo "-----------------------------------------------"
