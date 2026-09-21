> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Roadmap And Technical Debt

This document is the durable index for current Hakken roadmap and technical-debt priorities. Treat implementation and tests as the source of truth, then use the linked active plans for detailed execution order.

## Current Operating Rules

- Daily development happens on `dev`; `main` is production-only.
- Preserve tenant isolation, admin versus super-admin boundaries, and configuration-driven AI model selection.
- Keep English and Italian locale dictionaries in parity.
- Keep admin tables and feeds at 15 rows per page unless a product requirement says otherwise.
- Do not use native browser dialogs in app UI.
- Keep the temporary movement demo frozen unless the user explicitly reopens it or a quality gate is broken by it.
- Do not treat an active plan as proof of current behaviour; verify the code before acting.

## Current Debt And Follow-Up Areas

### Documentation And Drift Checks

Several broad developer guides have been refreshed, but the documentation library should keep being audited against implementation. The highest-value recurring work is to convert repo rules and known drift checks into automated tests or scripts.

Current automated guardrails include:

- Locale parity in `src/i18n.test.ts`.
- Native-dialog, admin-pagination, broad-read, provider-language, and related drift checks in `src/quality-drift.test.ts`.
- Local environment validation through `npm run verify:env`.

Continue using [Future Agent Maintenance Plan](../../developer/future-agent-maintenance-plan.md) for coding-agent maintenance priorities.

### Provider-Neutral AI Platform

Hakken is moving toward a provider-neutral AI platform while still retaining provider-specific adapters and real provider model IDs where appropriate. Generic runtime paths should resolve models through stored configuration and provider-aware helpers, not hardcoded model literals.

Use [Model Provider Agnostic Platform Plan](./model-provider-agnostic-plan.md) as the locked plan for provider records, model catalogue shape, defaults by use case, adapters, provider health, and analytics dimensions. Current implementation already exposes provider distribution in analytics surfaces, but the model/provider migration remains an active roadmap area.

The AI connector marketplace contains more external-system scaffold definitions than registered runtime handlers. `workflow.task.create`, `http.request`, `notification.send`, `slack.message.send`, and `google_drive.search` have normalized not-implemented stub handlers. Gmail is now implemented through the `google-gmail` OAuth connector and registered `gmail.read` / `gmail.reply` handlers. Newer generated mappings for Calendar, Outlook, Teams, Notion, HubSpot, Salesforce, Zendesk, Jira, Linear, GitHub, Stripe, Airtable, and Shopify still fail through the unknown-handler path. Either register explicit not-implemented stubs for every scaffolded mapping or keep those generated tools visibly labeled/disabled until concrete handlers exist.

### Analytics And Scale Hardening

The analytics and platform-scale plans have moved many hot paths toward snapshot-first, indexed, paginated, or bounded reads. Keep this work protected rather than reopening completed phases casually.

Current implemented direction includes:

- `analyticsDailySnapshots` for historical analytics rollups.
- Live-day overlays for current activity.
- Provider and model distributions in AI cost and dashboard views.
- `inventoryRollups` for global inventory/MRR rollup data.
- Drift tests for broad-read classifications and deleted legacy modules.

Use [Analytics Scale Optimization Plan](./analytics-scale-optimization-plan.md), [Platform Scale Hardening Plan](./platform-scale-hardening-plan.md), and [Post Scale Hardening Plan](./post-scale-hardening-plan.md) for remaining operational follow-up, production smoke checks, backfills, and dependency cleanup.

### Workflow Runtime And Scheduler Hardening

Workflow runtime contracts are an ongoing maintenance area. Current implementation includes scheduled workflows, agent schedules, `nextRunAt`, and indexed due-schedule dispatch. Database SELECT nodes have been hardened toward explicit indexed query contracts according to the post-scale plan.

Keep future workflow work focused on typed payloads, clear runtime validation errors, tenant-scoped execution, and regression coverage in workflow and scheduler tests.

### Releases And Run Observability

Agent version snapshots store enabled skill bindings and `skillSetHash`, but the current release snapshot comparison in `convex/releases.ts` does not include skills in `versionHashComparisons` or detail summaries. Until that is implemented, release reviewers must inspect agent skill bindings directly when enabled skills change between candidates.

### Auth, Login, And Local E2E Support

Authentication remains a high-risk operating area. The app supports Google and Resend providers through Convex Auth, plus a guarded local-test credentials provider when local test auth is explicitly enabled. Keep invite-only behaviour and privilege boundaries intact.

Use [Auth Login Hardening Plan](./auth-login-hardening-plan.md) and [Local Real Auth E2E Plan](./local-real-auth-e2e-plan.md) for diagnostics, provider verification, local seeded auth, and end-to-end coverage.

### System Settings And Branding

`systemSettings.fontFamily` remains a legacy schema field. New UI should use `headingFontFamily` and `bodyFontFamily`; code should preserve the legacy field only for compatibility with existing records.

System settings, white-label presets, audit retention, and purge controls are documented in the developer and operator docs. Future work should avoid spreading branding logic outside the settings service/context and shared UI primitives.

### Plans And Locale Parity

Plan catalog docs now match the current implementation: most plan-management copy is localized, but the plan table still renders the `Active` and `Inactive` status labels as English literals in `src/app/(dashboard)/admin/settings/plans/page.tsx`. If implementation work touches the plan catalog, move those labels into the English and Italian dictionaries and keep the locale-parity gate green.

Locale loading is cookie-backed through `src/i18n/request.ts`, and profile preferences can switch between English and Italian by writing the `locale` cookie. The root app layout currently keeps `<html lang="en">` hardcoded even when the resolved `next-intl` locale is Italian. Future i18n/accessibility work should bind the resolved locale to the HTML `lang` attribute and keep `src/i18n.test.ts` green.

### Knowledge And Upload Policy

Knowledge ingestion, document uploads, widget uploads, and report attachment behaviour are now documented with current upload-policy boundaries. Continue keeping frontend extension checks, Convex upload URL issuance, ownership checks, widget quotas, and knowledge indexing rules aligned.

Manual or background knowledge indexing should be treated as current implementation unless code changes introduce a new watcher or realtime sync pattern. Do not describe a watcher as live behaviour until it exists.

The shared upload policy accepts Excel document MIME types, and agent runtime attachments parse Excel through `convex/utils/fileParser.ts`. Persisted admin/thread knowledge ingestion in `convex/knowledgeActions.ts` does not yet use that Excel parser; it has dedicated PDF and DOCX extraction and otherwise falls back to UTF-8 decoding. Future implementation work should either add spreadsheet extraction to knowledge ingestion or narrow the accepted persisted-knowledge upload policy.

### Movement Demo

The movement demo is temporary and frozen. Documentation may describe its current routes, storage formats, tracking pipeline, and debug tools, but implementation refactors belong outside this automation unless the user explicitly reopens the demo.

The mirror and replay proof plans are the controlling documents when the user explicitly reopens movement behaviour. Do not treat solver labels, selected frames, or UI verdicts as rendered-avatar acceptance. Replay Studio is the recorded-motion source of truth; targeted and fast-subset proof tiers support active repair, while the current all-nine rendered proof tier is required before claiming global shared-avatar acceptance. Game Studio live-camera checks confirm the Replay-proven shared pipeline instead of replacing it.

Relevant plans remain active for context:

- [Movement Demo Client Pitch Excellence Plan](./movement-demo-client-pitch-excellence-plan.md)
- [Movement Demo Refactor Plan](./movement-demo-refactor-plan.md)
- [Movement Demo Whole Body Tracking Plan](./movement-demo-whole-body-tracking-plan.md)
- [Movement Mirror Methodology Implementation Plan](./movement-mirror-methodology-implementation-plan.md)
- [Replay Studio Agent Repair Harness Plan](./replay-studio-agent-repair-harness-plan.md)
- [Replay Studio Avatar-Follow Observability Plan](./replay-studio-avatar-follow-observability-plan.md)
- [Replay Avatar-Follow Correction Plan](./replay-avatar-follow-correction-plan.md)
- [Replay Lab Visual Acceptance Tightening Plan](./replay-lab-visual-acceptance-tightening-plan.md)

## Roadmap Index

Use the active plans in `docs/plans/active/` as the detailed queue. Current priority families are:

- Provider-neutral AI platform and model/provider runtime cleanup.
- Post-scale operational verification, production smoke checks, inventory rollup backfill, and dependency cleanup.
- Auth/login diagnostics and local real-auth E2E support.
- Workflow runtime contract hardening and tests.
- Test coverage, code-quality, and large-page decomposition.
- Agent learning, scheduler, skills, release, and platform expansion plans.

## Verification Expectations

Before asking to merge or push, follow the repo gate in `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For documentation-only upkeep, at minimum run a Markdown local-link check and `git diff --check`.
