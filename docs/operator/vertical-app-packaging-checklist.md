# Vertical App Packaging Checklist

Use this checklist when turning Hakken into a new customer-specific or vertical product starter.

First create the code copy using [Build a new application from Hakken](./cloning-hakken.md).
The default keeps the framework and Arcade; the other four application areas are opt-in.

The goal is to make product-specific changes through configuration, translations, templates, seed data, and extension points before editing core runtime code.

## 1. Product Identity

- Set the product/platform name through system settings.
- Replace logo URLs through system settings or uploaded logo storage.
- Confirm light and dark theme tokens are set through settings rather than hardcoded CSS.
- Use [Product Setup](./product-setup.md) to preview and apply the clone's product defaults. Review System Settings > Identity and Aesthetics for stored branding overrides, and the configured email sender separately.
- Replace customer-facing product copy in `messages/en.json` and `messages/it.json`.
- Keep English and Italian locale dictionaries in parity.
- Set the system email sender name/address or configure `RESEND_FROM_EMAIL` as the deployment override.
- Confirm generated emails use the intended sender name and verified domain.

## 2. Navigation And Module Shape

- Decide which modules should be visible for the vertical product.
- Set company capabilities in the company Features screen.
- Add product navigation in `src/ui/components/layout/SidebarNavTrees.tsx`; there is no Navigation Profiles setup step.
- Keep platform-owner surfaces super-admin-only.
- Hide temporary or diagnostic routes unless `diagnosticRoutingEnabled` is intentionally enabled.
- Add new routes only after role and tenant behavior is clear.
- Keep tenant-facing routes separate from platform maintenance/admin surfaces.
- Treat navigation hiding as presentation only; server authorization and tenant isolation remain the real access boundary.

## 3. Custom Domains And Public Surfaces

- Record the public app origin in `sonae.product.json` and check the hosting/domain configuration outside the app.
- Confirm the primary production app host with the hosting provider.
- Confirm widget allowed domains are restricted and do not include wildcard-only public exposure.
- Confirm the branded email sender domain is verified or `RESEND_FROM_EMAIL` is set.
- Validate DNS and TLS outside the app before customer handoff.
- Confirm apex, www, and legacy-route redirect behavior.
- Confirm any custom domain maps to the correct tenant before runtime navigation hiding.

## 4. Starter Agents

- Pick the closest agent archetype in `convex/agentTemplates.ts`, or add one for the vertical.
- Build each starter agent from the guided builder and configure:
  - starter prompt
  - suggested connectors and bound tools
  - knowledge scopes
  - workflows and schedules
  - eval fixtures
  - release-gate expectations
- Keep created resources draft or inactive until a developer/operator review is complete.
- Record the handoff tasks that name the files and product decisions still required.

## 5. Knowledge And Demo Data

- Replace sample knowledge with vertical-specific source documents.
- Mark demo/sample records clearly.
- Keep local demo seed data idempotent.
- Do not use production credentials in demo seed paths.
- Confirm knowledge quality checks show ready documents, current embeddings, and no stale source failures.

## 6. Providers, Models, And Tools

- Run `npm run setup:validate` for local development.
- Run `npm run setup:validate -- --profile=production` before production handoff.
- Configure the providers and feature credentials selected in `sonae.product.json`. Knowledge embeddings, voice and telephony require Vertex independently of the text-model provider.
- Set model defaults from stored configuration, not hardcoded runtime literals.
- Install connector definitions and configure secret references outside source control.
- Keep write, destructive, and external tools approval-gated unless explicitly reviewed.

## 7. Release And Operations

- Run the release gate for every agent that will become active.
- Create or update eval fixtures for vertical-specific failure modes.
- Confirm System Health has no stuck runs, stale approvals, failed tools, or provider failure clusters.
- Export the System Health report for deployment handoff.
- Confirm plan quotas and agent run budgets match the expected commercial model.
- Record this checklist, the product configuration and the actual verification results in the product handoff notes.

## 8. Fresh Deployment Smoke

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
- System Health reports the intended scope and no unexpected critical rules.
