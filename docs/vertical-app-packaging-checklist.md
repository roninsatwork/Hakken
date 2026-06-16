# Vertical App Packaging Checklist

Use this checklist when turning Sonae into a new customer-specific or vertical product starter.

The goal is to make product-specific changes through configuration, translations, templates, seed data, and extension points before editing core runtime code.

## 1. Product Identity

- Set the product/platform name through system settings.
- Replace logo URLs through system settings or uploaded logo storage.
- Confirm light and dark theme tokens are set through settings rather than hardcoded CSS.
- Review System Settings > System Options > White-Label Readiness before handoff.
- Replace customer-facing product copy in `messages/en.json` and `messages/it.json`.
- Keep English and Italian locale dictionaries in parity.
- Set the system email sender name/address or configure `RESEND_FROM_EMAIL` as the deployment override.
- Confirm generated emails use the intended sender name and verified domain.

## 2. Navigation And Module Shape

- Decide which modules should be visible for the vertical product.
- Pick the closest module preset in System Settings > System Options before editing navigation.
- Keep platform-owner surfaces super-admin-only.
- Hide temporary or diagnostic routes unless `diagnosticRoutingEnabled` is intentionally enabled.
- Add new routes only after role and tenant behavior is clear.
- Keep tenant-facing routes separate from platform maintenance/admin surfaces.

## 3. App Kits And Build Plans

- Pick the closest starter app kit in `convex/appTemplates.ts`.
- Update or add template metadata for:
  - agents
  - starter prompts
  - suggested connectors
  - knowledge scopes
  - workflows and schedules
  - eval fixtures
  - release-gate expectations
  - developer follow-up items
  - implementation code pointers
- Keep created resources draft or inactive until a developer/operator review is complete.
- Confirm build-plan handoff tasks name the files and product decisions still required.

## 4. Knowledge And Demo Data

- Replace sample knowledge with vertical-specific source documents.
- Mark demo/sample records clearly.
- Keep local demo seed data idempotent.
- Do not use production credentials in demo seed paths.
- Confirm knowledge quality checks show ready documents, current embeddings, and no stale source failures.

## 5. Providers, Models, And Tools

- Run `npm run setup:validate` for local development.
- Run `npm run setup:validate -- --profile=production` before production handoff.
- Configure at least one live model provider for production.
- Set model defaults from stored configuration, not hardcoded runtime literals.
- Install connector definitions and configure secret references outside source control.
- Keep write, destructive, and external tools approval-gated unless explicitly reviewed.

## 6. Release And Operations

- Run the release gate for every agent that will become active.
- Create or update eval fixtures for vertical-specific failure modes.
- Confirm System Health has no stuck runs, stale approvals, failed tools, or provider failure clusters.
- Export the System Health report for deployment handoff.
- Confirm plan quotas and agent run budgets match the expected commercial model.

## 7. Fresh Deployment Smoke

Run these checks before calling the vertical starter ready:

```bash
npm run setup:validate -- --profile=production
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Then manually verify:

- Login works with the intended auth provider.
- The first super-admin can reach admin surfaces.
- Tenant admins see only their company data.
- Model defaults resolve for chat, agent, workflow, report, and embedding use cases.
- A draft agent passes its smoke eval.
- A release candidate can be reviewed in Developer Ship Checks.
- System Health reports the intended scope and no unexpected critical rules.
