# Launch, Releases, And Observability Developer Guide

Launch operations connect app template catalog records, launch plans, draft agents, draft workflows, eval fixtures, agent releases, and run observability. This guide covers the implementation that exists now and should be read before changing launch operations or the run observatory. For the lower-level app kit catalog and launch plan materialization contracts, see [App Kit And Launch Plan Implementation](./app-kit-launch-plan-implementation.md). For release candidate lifecycle, scheduled activation, snapshot comparison, and rollback internals, see [Agent Release Infrastructure](./agent-release-infrastructure.md). For the sampled agent run health dashboard, see [Run Observatory](./run-observatory.md).

## Product Surface

- `src/app/(dashboard)/admin/launch/page.tsx` renders the app kit gallery, catalog registry controls, setup form, and recent launch plans.
- `src/app/(dashboard)/admin/app-kits/page.tsx` re-exports the launch page.
- `src/app/(dashboard)/admin/launch/plans/[id]/page.tsx` renders launch plan detail, readiness summaries, developer tasks, workspace actions, connector readiness, draft resources, and archive/materialize actions.
- `src/app/(dashboard)/admin/app-kits/plans/[id]/page.tsx` re-exports the launch plan detail page.
- `src/app/(dashboard)/admin/releases/page.tsx` renders agent release readiness and recent release candidates.
- `src/app/(dashboard)/admin/run-observatory/page.tsx` renders recent agent run evidence from `api.agentRuns.getRunObservatory`.

Launch and release mutations are super-admin-only. The run observatory accepts admins, but standard admins must have a company id and receive company-scoped data.

## Core Convex Modules

`convex/appTemplates.ts` owns the app kit catalog and launch plans. It defines the static `APP_TEMPLATES` catalog, default extension points, default implementation pointers, launch plan builders, catalog sync, registry updates, plan creation, plan details, workspace creation/linking, archive, and materialization.

`convex/releases.ts` owns agent release readiness, recent release summaries, latest release lookup, candidate creation, approval, cancellation, activation, scheduled activation, and rollback. Its detailed lifecycle contract is documented in [Agent Release Infrastructure](./agent-release-infrastructure.md).

`convex/agentRuns.ts` owns the run observatory query in addition to run listing, detail, analytics, approvals, replay, cancellation, and internal run writes. The observatory sampling and scoping contract is documented in [Run Observatory](./run-observatory.md).

Related modules include `convex/agents.ts` for `buildAgentReadiness`, `convex/agentVersioningService.ts` for agent version snapshots, `convex/agentEvalFixtures.ts` for seeded fixtures, `convex/agentTemplates.ts` for archetypes used during materialization, `convex/companyService.ts` for workspace record creation, and `convex/aiTools.ts` for connector readiness.

## Data Model

`appTemplateCatalogItems` stores persisted registry metadata for static app templates: template id, name, category, risk profile, lifecycle status, owner email, editorial notes, serialized source JSON, source update timestamp, sync timestamp, creator/updater, and timestamps.

`appLaunchPlans` stores launch plan records: template id, template name, category, risk profile, status, optional target company id/name, notes, serialized plan JSON, optional serialized created resource ids, creator, and timestamps. Status values are `DRAFT`, `MATERIALIZED`, and `ARCHIVED`.

`agentVersions` stores immutable snapshots for agent release review. Snapshot hashes cover prompt, tools, skills, memory, rules, model config, and policy. `agentReleases` links an agent to an agent version snapshot and stores release status, title, notes, rollback plan, owner, activation window, readiness JSON, reviewer ids, timestamps, approval comments, cancellation reasons, and rollback reasons.

`agentRuns`, `agentToolCalls`, and related run tables supply observatory data. The observatory uses run status, trigger type, company id, provider/model telemetry, costs, token counts, timings, errors, final output, tool call status, side-effect level, and handler mapping.

## App Kit Catalog

The app kit catalog is static code in `APP_TEMPLATES`. Each template includes category, name, tagline, description, risk profile, primary users, recommended connector keys, planned agents, knowledge scopes, workflows, eval fixtures, dashboard cards, publish targets, readiness checks, developer follow-ups, extension points, and implementation pointers.

`getAppTemplateGallery` returns the current static catalog to super admins. `syncAppTemplateCatalogRegistry` upserts `appTemplateCatalogItems` for every static template and stores serialized source JSON. `getAppTemplateCatalogRegistry` compares durable registry rows to the current static source so the UI can show stale registry items. `updateAppTemplateCatalogItem` updates lifecycle status, owner email, and editorial notes.

When adding or changing a template, keep the static template data operationally specific. Avoid promising integrations, workflows, or product screens that do not exist or cannot be built from current platform primitives.

## Launch Plans And Materialization

`createLaunchPlan` builds a durable plan from a template plus optional setup overrides. The plan JSON captures workspace setup, model defaults, connector bundle notes, knowledge import notes, publish surface notes, safety defaults, planned draft resources, readiness checks, extension points, and implementation pointers.

`getLaunchPlanDetails` parses plan JSON, parses created resource JSON, joins created agents/workflows/fixtures where present, loads linked workspace summary, evaluates recommended connector readiness, builds readiness summaries, developer handoff summaries, developer tasks, workspace setup actions, and surface implementation actions.

`archiveLaunchPlan` marks a plan archived and writes audit evidence. Archived plans cannot create workspaces or materialize resources. `createWorkspaceForLaunchPlan` creates a company from the plan target company name using `buildCompanyRecord`, increments global inventory totals, links the workspace, and writes audit logs. `linkWorkspaceToLaunchPlan` links an existing company and records the change.

`materializeLaunchPlan` creates inactive draft resources from a non-archived plan. It is idempotent at the plan level: if `createdResourceJson` already exists, it returns the existing resource ids. Materialization creates inactive global agents, inactive manual workflows, eval fixtures, and source run ids. Draft agents inherit model selection, use the failsafe model id until model defaults are reviewed, require human approval, and start inactive.

When extending materialization, preserve idempotency, inactive defaults, audit logs, and explicit readiness review. Do not create active agents, active workflows, external connector actions, or customer-facing surfaces directly from a launch plan without a separate product decision.

## Agent Releases

`getReleaseReadinessOverview` loads global agents, builds readiness through `buildAgentReadiness`, joins the latest release, and classifies each agent as `DRAFT_BLOCKED`, `READY_FOR_RELEASE`, `LIVE_NEEDS_ATTENTION`, or `LIVE`.

`createReleaseCandidate` is super-admin-only and only works for global agents. It rejects existing open releases, asserts readiness, creates or reuses an agent version snapshot through `ensureAgentVersionSnapshot`, stores readiness JSON, release notes, rollback plan, owner email, and activation window, then writes an audit log.

`approveReleaseCandidate` rechecks readiness and moves a pending candidate to `APPROVED`. `activateReleaseCandidate` rechecks readiness, enforces activation windows, activates the agent, updates the release, and writes audit evidence. `activateDueReleaseCandidates` is an internal mutation that activates approved candidates whose activation window has opened. `cancelReleaseCandidate` cancels pending or approved candidates. `rollbackRelease` only applies to activated releases; it restores the previous live snapshot when available or deactivates the agent if no previous snapshot exists.

Release snapshot comparisons are based on agent version hashes for prompt and schemas, tools, memory, rules, model config, and policy. Preserve these comparison areas when changing snapshot structure so operators can understand what changed between candidates.

## Run Observatory

`agentRuns.getRunObservatory` accepts optional `lookbackDays` and `limit`. It clamps lookback to 1-90 days and the result limit to the configured observatory limit. Super admins sample recent runs across statuses from the platform. Standard admins must have `companyId` and receive runs by company.

The query aggregates status counts, trigger counts, total cost, input tokens, output tokens, success rate, failed runs, active runs, average completed latency, model statistics, agent statistics, failure reason counts, tool statistics, and recent run evidence.

The observatory intentionally samples for operator visibility rather than full historical analytics. Use analytics tables for broader cost dashboards and run detail pages for exact per-run timelines.

## Authorization And Audit

Launch gallery, catalog registry, launch plan details, plan creation, workspace creation/linking, materialization, archiving, release overview, recent releases, release mutations, and latest release lookup are super-admin-only.

Run observatory uses `requireAdmin`. Non-super-admins without a company id are rejected, and tool calls are filtered by company when summarizing sampled tools.

Audit logs are written for launch plan archive, launch materialization, workspace creation, workspace linking, release creation, approval, activation, cancellation, and rollback. When adding new launch or release mutations, include audit metadata with template id, plan id, company id, agent id, release id, and human reason fields where applicable.

## Verification

Focused tests include `convex/appTemplates.test.ts`, `convex/releases.test.ts`, `convex/agentRuns.test.ts`, `convex/agentVersions.test.ts`, launch UI tests, release UI tests, and run observatory UI tests where present.

For documentation-only edits, run `git diff --check`. Before merging code changes in this area, run the full repo gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
