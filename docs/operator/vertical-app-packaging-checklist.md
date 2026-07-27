# Vertical App Packaging Checklist

Use this checklist when turning Sonae into a new customer-specific or vertical product starter.

The goal is to make product-specific changes through configuration, translations, templates, seed data, and extension points before editing core runtime code.

For the System Options workflow, use `docs/operator/white-label-packaging-operator-guide.md`.

## 1. Product Identity

- Set the product/platform name through system settings.
- Replace logo URLs through system settings or uploaded logo storage.
- Confirm light and dark theme tokens are set through settings rather than hardcoded CSS.
- Review System Settings > System Options > White-Label Readiness before handoff.
- Review System Settings > System Options > Brand Handoff Summary and confirm product name, logo mode, brand color, runtime sender, widget posture, diagnostics posture, production gate, and ready presets.
- Replace customer-facing product copy in `messages/en.json` and `messages/it.json`.
- Keep English and Italian locale dictionaries in parity.
- Set the system email sender name/address or configure `RESEND_FROM_EMAIL` as the deployment override.
- Confirm generated emails use the intended sender name and verified domain.

## 2. Navigation And Module Shape

- Decide which modules should be visible for the vertical product.
- Pick the closest module preset in System Settings > System Options before editing navigation.
- Review Navigation Profiles in System Settings > System Options before hiding links or changing route groups.
- Keep platform-owner surfaces super-admin-only.
- Hide temporary or diagnostic routes unless `diagnosticRoutingEnabled` is intentionally enabled.
- Add new routes only after role and tenant behavior is clear.
- Keep tenant-facing routes separate from platform maintenance/admin surfaces.
- Treat navigation hiding as presentation only; server authorization and tenant isolation remain the real access boundary.

## 3. Custom Domains And Public Surfaces

- Review System Settings > System Options > Custom Domain Readiness.
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
- Configure at least one live model provider for production.
- Set model defaults from stored configuration, not hardcoded runtime literals.
- Install connector definitions and configure secret references outside source control.
- Keep write, destructive, and external tools approval-gated unless explicitly reviewed.

## 7. Release And Operations

- Run the release gate for every agent that will become active.
- Create or update eval fixtures for vertical-specific failure modes.
- Confirm System Health has no stuck runs, stale approvals, failed tools, or provider failure clusters.
- Export the System Health report for deployment handoff.
- Confirm plan quotas and agent run budgets match the expected commercial model.
- Copy the System Settings > System Options > Packaging Checklist markdown into the release notes, build plan, or handoff page.

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
