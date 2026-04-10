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

echo "${BOLD}${BLUE}🔱 Sonae Bespoke Installation Orchestrator${RESET}"
echo "-----------------------------------------------"

# 1. Inputs
read "CLIENT_NAME?Enter Client Name (slug, e.g. acme): "
read "BILLING_ID?Enter GCP Billing Account ID: "
read "CLIENT_DOMAIN?Enter Client Domain (e.g. app.acme.com): "
read "CONVEX_URL?Enter Production Convex URL (e.g. https://xyz.convex.cloud): "
read "CONVEX_DEPLOY_KEY?Enter Convex Deploy Key: "
read "CONVEX_DEPLOYMENT?Enter Convex Deployment Name: "
read "GOOGLE_CLIENT_ID?Enter Google OAuth Client ID: "
read "GOOGLE_CLIENT_SECRET?Enter Google OAuth Client Secret: "
read "RESEND_API_KEY?Enter Resend API Key: "
read "RESEND_FROM?Enter Resend From Email (e.g. ai@acme.com): "

PROJECT_ID="sonae-prod-$CLIENT_NAME"
CONVEX_SITE_URL="${CONVEX_URL/convex.cloud/convex.site}" 

# 2. GCP Provisioning
echo "\n${BOLD}${BLUE}Step 1: Provisioning GCP Resources...${RESET}"
./provision-gcp.zsh "$PROJECT_ID" "$BILLING_ID"

# 3. Extracting GCP Credentials for Convex
GCP_KEY_FILE="gcp-key-$PROJECT_ID.json"
echo "\n${BOLD}${BLUE}Step 2: Extracting AI Credentials from Service Account...${RESET}"
GCP_CLIENT_EMAIL=$(jq -r '.client_email' "$GCP_KEY_FILE")
GCP_PRIVATE_KEY=$(jq -r '.private_key' "$GCP_KEY_FILE")

# 4. Convex Environment Synchronization
echo "\n${BOLD}${BLUE}Step 3: Synchronizing Convex Environment Variables...${RESET}"

# AI / Vertex Configuration
npx convex env set GOOGLE_CLOUD_PROJECT "$PROJECT_ID" --prod
npx convex env set GOOGLE_CLOUD_LOCATION "us-central1" --prod
npx convex env set GOOGLE_CLIENT_EMAIL "$GCP_CLIENT_EMAIL" --prod
npx convex env set GOOGLE_PRIVATE_KEY "$GCP_PRIVATE_KEY" --prod

# Auth Configuration
npx convex env set AUTH_GOOGLE_ID "$GOOGLE_CLIENT_ID" --prod
npx convex env set AUTH_GOOGLE_SECRET "$GOOGLE_CLIENT_SECRET" --prod
npx convex env set SITE_URL "https://$CLIENT_DOMAIN" --prod
npx convex env set CONVEX_SITE_URL "$CONVEX_SITE_URL" --prod

# Resend Configuration
npx convex env set RESEND_API_KEY "$RESEND_API_KEY" --prod
npx convex env set RESEND_FROM_EMAIL "$RESEND_FROM" --prod

# 5. GitHub Secret Injection
echo "\n${BOLD}${BLUE}Step 4: Configuring GitHub Secrets...${RESET}"
./provision-github.zsh "$PROJECT_ID" "$GCP_KEY_FILE" "$CONVEX_DEPLOY_KEY" "$CONVEX_URL" "$CONVEX_DEPLOYMENT"

echo "\n${GREEN}${BOLD}✅ Bespoke Installation for $CLIENT_NAME initialized!${RESET}"
echo "-----------------------------------------------"
echo "Next Steps:"
echo "1. ${YELLOW}GCP Console:${RESET} Manually configure OAuth Consent Screen for '$PROJECT_ID'."
echo "2. ${YELLOW}Resend:${RESET} Ensure '$CLIENT_DOMAIN' is verified in Resend Dashboard."
echo "3. ${YELLOW}Code:${RESET} Update SUPER_ADMIN email in 'convex/auth.ts'."
echo "4. ${YELLOW}Deploy:${RESET} Merge 'dev' to 'main' and push."
echo "-----------------------------------------------"
