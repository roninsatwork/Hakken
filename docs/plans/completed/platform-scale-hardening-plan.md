> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Platform Scale Hardening Plan

This is the belt-and-braces plan for scale-hardening the rest of Sonae after the analytics optimization work. The app is not expected to hit all of these limits immediately, but the goal is to make future growth predictable and to keep broad reads from quietly becoming product dependencies.

Follow this plan in order unless the user explicitly changes scope.

## Scope

This plan covers user-facing and admin-facing platform areas that can still become expensive as data grows:

- Admin company, user, agent, model, tool, rule, plan, widget, and workflow lists.
- Knowledge document, chunk, scrape, and website-ingestion views.
- Chat/admin log browsing.
- Workflow execution, scheduler, and database-operation runtime paths.
- Global inventory and MRR metrics outside the analytics hot path.
- Legacy analytics/debug/seed/internal functions that still contain broad scans.
- Regression tests and drift checks that stop new scale debt from spreading.

This plan does not cover:

- Product redesign.
- Billing strategy or pricing logic beyond scalable inventory/MRR reads.
- Movement demo code:
  - `src/app/(dashboard)/demos/movements/**`
  - `src/app/(dashboard)/demos/movement-capture/page.tsx`
  - `convex/movements.ts`
- Provider selection refactors except where model/catalog list scaling needs existing configuration boundaries.

## Current Baseline

Analytics, AI running costs, company dashboards, and chart rendering have already been strengthened through `docs/plans/active/analytics-scale-optimization-plan.md`.

The remaining scale risks are lower urgency but still worth fixing before they become part of the platform's shape:

- Several admin/config queries still use `take(10000)` as a temporary safety rail.
- Some UI pages still depend on full-list queries before filtering or rendering.
- Knowledge document and chunk paths can grow faster than ordinary admin records.
- Chat/admin log browsing needs consistently bounded date and pagination contracts.
- Workflow runtime paths include broad execution/step/database lookups that should become cursor/index based.
- `getGlobalInventoryMetrics` intentionally keeps exact inventory reads separate from analytics, but exact all-user/all-company counts are not infinite-scale.
- Legacy/debug/internal modules still contain broad scans and need quarantine or deletion so they cannot be wired back into production UI.

## Non-Drift Rules

- Do not rely on `take(10000)` as a scale strategy for product or admin UI.
- User-facing and admin-facing list queries should be paginated, indexed, and server-filtered.
- Keep admin tables at 15 rows per page unless a documented product requirement says otherwise.
- Preserve tenant isolation. Non-super-admin access must stay scoped by company.
- Mutations that manage users must prevent privilege escalation.
- Keep historical analytics on the analytics snapshot path; do not reintroduce broad analytics reads.
- Keep exact inventory reads separate from analytics hot paths until they are replaced by rollups.
- Any remaining broad read must be classified as one of:
  - temporary migration/backfill,
  - internal destructive maintenance,
  - test-only,
  - frozen movement demo,
  - small bounded configuration catalogue,
  - explicitly documented short-term exception.
- Every short-term exception must have a follow-up phase and a drift-test allowlist reason.
- Do not expand or refactor the movement demo while executing this plan.

## Phase 0: Inventory And Classify Broad Reads

Goal: create a reliable map of broad reads before changing behavior.

Tasks:

- Audit Convex queries/mutations/actions for:
  - `.take(10000)`,
  - `.collect()`,
  - broad `ctx.db.query("table")` calls without an index,
  - UI pages that call unpaginated list endpoints.
- Classify each broad read by risk:
  - hot product path,
  - admin list path,
  - internal runtime path,
  - maintenance/backfill path,
  - debug/seed/test path,
  - frozen movement demo path,
  - small configuration catalogue.
- Add or update a drift check that fails when new broad reads appear outside the classified allowlist.
- Make the allowlist intentionally noisy: each exception must name the file, export, table, reason, and target phase.

Acceptance:

- `npm run check` reports new unclassified broad reads.
- Existing broad reads are classified without touching movement demo files.
- The plan's phase list is updated if the audit finds a new material category.

Status:

- Added a platform broad-read classification guard to `src/quality-drift.test.ts`.
- Current Convex broad reads are classified by file, export, table, category, target phase, and reason.
- The guard fails on new unclassified broad reads or weak exception reasons.
- Focused verification passed with `npx vitest run src/quality-drift.test.ts`.

## Phase 1: Admin Inventory Lists

Goal: make admin inventory pages scale through paginated, indexed, server-filtered reads.

Targets:

- `convex/companies.ts`
- `convex/users.ts`
- `convex/agents.ts`
- `convex/aiModels.ts`
- `convex/aiTools.ts`
- `convex/aiRules.ts`
- `convex/plans.ts`
- `convex/widgets.ts`
- `convex/workflows.ts`
- Admin pages that currently call full-list query APIs.

Tasks:

- Replace full-list admin queries with pagination contracts.
- Keep page size aligned with the 15-row admin standard.
- Add search/status/company filters server-side where the UI already supports filtering.
- Prefer stable sort fields and indexes over client-side sort on large result sets.
- Keep small catalogue exceptions only where the table is genuinely bounded and documented.
- Update UI pages to use paginated data without losing empty, loading, and error states.

Acceptance:

- Admin company/user/config/workflow list pages do not require full table reads.
- Super-admin and company-admin scoping tests stay green.
- Drift tests catch new unpaginated admin list dependencies.

Status:

- Started with the admin companies table.
- Added `companies.getPaginatedCompanies` with Convex cursor pagination and company-name search.
- Moved `src/app/(dashboard)/admin/companies/page.tsx` from full-list client filtering to `usePaginatedQuery`.
- Added a shared `AdminLoadMoreFooter` for cursor-paginated admin tables.
- Added drift coverage so the companies page does not drift back to `companies.getCompanies`.
- Added company pagination/search regression coverage in `convex/companies.test.ts`.
- Added bounded `companies.getCompanyOptions` for company selectors.
- Moved global users and invite-user pages off the broad `companies.getCompanies` selector dependency.
- Enriched paginated user rows with `companyName` so user tables do not need a full company list for display labels.
- Added regression coverage for bounded company options and user company-name enrichment.
- Added `agents.getPaginatedAgents` and moved the admin agents table off the broad `agents.list` dependency.
- Added a global-agent created-date index and ensured newly created global agents are marked with `isGlobal: true`.
- Added drift coverage so the admin agents page does not drift back to `agents.list`.
- Added regression coverage for paginated global agents and inline workflow-agent exclusion.
- Added `workflows.getPaginatedWorkflows` and moved the admin workflows table off the broad `workflows.list` dependency.
- Added workflow created-date and name-search indexes for bounded admin workflow list reads.
- Moved the workflows page to the shared admin table/search/load-more primitives.
- Added drift and regression coverage for paginated workflow listing and search.
- Added `aiTools.getPaginatedTools` and moved the admin connectors/tools page off the broad `aiTools.getTools` dependency.
- Added tool created-date and name-search indexes for bounded admin connector list reads.
- Added drift and regression coverage for paginated connector listing and search.
- Tightened `aiModels.getOffsetPaginatedModels` so search and active/inactive filtered model reads use bounded search/status indexes instead of always loading the whole model catalogue first.
- Added model display-name and model-ID search indexes while preserving model-ID search behavior.
- Added `plans.getPaginatedPlans` and moved the subscription plans admin page off the broad `plans.getPlans` dependency.
- Added plan created-date and name-search indexes for bounded subscription plan inventory reads.
- Added drift and regression coverage for paginated plan listing and search.
- Added primary widget queries for global and company widget configuration pages so those screens fetch one indexed record instead of loading widget catalogues.
- Bounded legacy widget catalogue queries and added widget created-date indexes for stable primary-widget lookup.
- Added drift and regression coverage so widget configuration pages stay on primary-widget reads.
- Tightened AI rule list and runtime active-rule reads with company, agent, global, active, and created-date indexes.
- Replaced broad/manual global and agent rule filters with scoped indexed branches while preserving admin and super-admin visibility behavior.

## Phase 2: Knowledge Base And Ingestion

Goal: make knowledge data scale before document, chunk, and scraped-page volume grows.

Targets:

- `convex/knowledge.ts`
- Knowledge admin pages and shared knowledge manager components.
- Website scrape/ingestion status paths.

Tasks:

- Paginate knowledge document lists by company, status, and updated date.
- Avoid loading all knowledge chunks for UI counts or debug summaries.
- Add bounded chunk lookups by document where needed.
- Convert scrape and ingestion queues to indexed status/date reads.
- Store or derive document-level chunk counts without broad chunk scans.
- Keep delete and reprocess flows bounded to document-specific batches.
- Preserve confirmation-gated deletes.

Acceptance:

- Knowledge pages stay responsive with many documents/chunks.
- Chunk operations are document-scoped or batch-scoped.
- Tests cover tenant isolation, pagination, delete confirmation, and ingestion status behavior.

Status:

- Added `knowledge.getPaginatedDocuments` for cursor-paginated global, company, and agent-scoped knowledge document lists.
- Moved the shared `KnowledgeManager` off the broad `knowledge.getDocuments` dependency and onto paginated document loading with the standard 15-row initial load.
- Added knowledge document indexes for agent/company scope, global scope, status, and source URL deduplication.
- Tightened pending website queue lookup and duplicate URL checks to use scoped indexes.
- Tightened legacy document getters, thread document reads, thread-vector GC candidate reads, and website bulk-delete candidate reads with bounded indexed queries.
- Fixed batched knowledge chunk ingestion so large documents append later embedding batches instead of replacing earlier batches.
- Extracted and tested the knowledge text chunker so short documents cannot loop on overlap handling.
- Tightened sales report knowledge lookup to fetch only the newest agent document used by report generation.
- Added drift and regression coverage for paginated knowledge document listing.

## Phase 3: Chat And Admin Logs

Goal: make conversation/log inspection bounded by date, tenant, and pagination.

Targets:

- `convex/chatAdmin.ts`
- `convex/chatAdminService.ts`
- Admin global chat logs.
- Company chat logs.

Tasks:

- Ensure thread list queries are indexed by company/date or global date.
- Keep all log list pages paginated at 15 rows.
- Bound global log browsing by explicit date windows.
- Keep message detail queries thread-scoped and paginated if long conversations become common.
- Add server-side filters for user, company, agent, widget, and date where useful.

Acceptance:

- Non-super-admins cannot access foreign company threads or messages.
- Global chat log queries do not scan all historical threads by default.
- Message detail reads remain bounded for long-running conversations.

Status:

- Added cursor-paginated global and company chat log roster queries for admin chat inspection.
- Moved global and company chat log pages off offset/full-candidate roster dependencies and onto load-more pagination.
- Bounded admin chat search to recent candidates and capped admin thread message detail reads.
- Bounded user chat thread/message reads and changed AI context loading to a recent-message window returned in chronological order.
- Added regression and drift coverage for paginated chat log rosters and tenant access.

## Phase 4: Workflow Runtime And Scheduler

Goal: remove broad runtime lookups before workflows become a high-volume automation system.

Targets:

- `convex/workflowEngine.ts`
- `convex/workflowRuntime.ts`
- `convex/workflowExecutions.ts`
- `convex/scheduler.ts`
- `convex/crons.ts`

Tasks:

- Replace execution and step `.collect()` usage with execution-scoped indexes.
- Make scheduler reads status/date bounded.
- Make resume/finalize/fail step operations use narrow execution/node indexes.
- Review the generic database-operation workflow node and restrict it to safe indexed lookups.
- Add pagination or hard bounded contracts for runtime logs and execution histories.
- Keep workflow payload parsing typed and explicit.

Acceptance:

- Workflow runtime does not depend on broad table scans for ordinary execution.
- Scheduler cost is proportional to due schedules, not all schedules.
- Workflow tests cover high-volume execution lookup behavior and tenant boundaries.

Status:

- Added schedule, active-schedule, execution-step, and step-status indexes for workflow runtime paths.
- Bounded schedule and workflow execution admin reads while preserving newest-first ordering for current pages.
- Bounded execution detail step reads to execution-scoped chronological lookup.
- Replaced workflow step upsert, pending-step claims, finalization, resume, fail, fan-in dependency checks, and completion checks with narrow execution/node/status indexes.
- Changed the scheduler dispatcher from an all-schedule scan to an active-schedule indexed batch.
- Capped generic workflow database-node SELECT operations at 100 rows as a short-term safety rail.
- Removed retired workflow broad-read exceptions from the drift guard.
- Added regression coverage for bounded schedule/execution lists, chronological step history, latest-step upsert, and pending-step claims.
- Remaining Phase 4 follow-up: replace the generic database-node SELECT cap with an explicit indexed query contract and, if schedule volume grows, store `nextRunAt` so dispatcher cost becomes strictly due-schedule proportional.

## Phase 5: Global Inventory And MRR Rollups

Goal: replace exact all-row inventory reads with rollups once the product needs larger operating scale.

Targets:

- `convex/analytics.ts` export `getGlobalInventoryMetrics`.
- Company, user, plan, and MRR inventory summaries.
- Admin overview page.

Tasks:

- Define an inventory snapshot or rollup table for:
  - total companies,
  - total active companies,
  - total users,
  - plan distribution,
  - MRR by plan,
  - trial/paid/suspended counts where relevant.
- Update writes that affect inventory to update rollups or schedule snapshot refreshes.
- Keep exact reads available only for maintenance/debug comparison.
- Add drift checks so analytics hot paths do not consume inventory scans.

Acceptance:

- Admin overview inventory cost is independent of raw company/user count.
- Rollup values are tested against seeded exact data.
- Exact inventory scans are no longer product UI dependencies.

Status:

- Added a global inventory rollup table for provisioned user count, provisioned company count, MRR, and plan inventory.
- Moved `analytics.getGlobalInventoryMetrics` to the rollup row instead of exact user/company/plan scans.
- Added rollup maintenance on company create/delete/plan assignment, user create/delete, auth invite provisioning, and plan create/update/delete.
- Added `inventoryRollups.rebuildGlobalInventoryRollup` as a super-admin repair/backfill mutation for existing production data.
- Tightened plan delete dependency checks with the `companies.by_plan` index instead of a broad company scan.
- Added drift coverage so `getGlobalInventoryMetrics` cannot drift back to raw inventory scans.
- Added regression coverage for rollup-backed MRR, mutation-maintained inventory counts, plan price/name changes, and auth-provisioned users.
- Operational note: after deploying this phase, invoke `inventoryRollups.rebuildGlobalInventoryRollup` once as a signed-in super admin in the target environment to seed the rollup from existing data.

## Phase 6: Configuration Catalogues

Goal: decide which small catalogues are truly bounded and make the rest paginated.

Targets:

- AI models.
- AI tools.
- AI rules.
- Agents.
- Plans.
- Widgets.
- System settings.

Tasks:

- Mark genuinely small catalogues as bounded configuration and document why.
- Paginate catalogues that can grow per company or per user.
- Keep model selection configuration-driven.
- Avoid hardcoding model literals in runtime paths.
- Keep provider-specific names isolated to provider adapters, catalogue entries, and provider-management UI.

Acceptance:

- Small catalogue exceptions are documented and tested through drift checks.
- Company-scoped catalogues do not require global full-list reads.
- Provider-neutral language checks remain green.

Status:

- Classified model, tool, agent, plan, widget, invite-template, and AI-rule surfaces as bounded configuration catalogues rather than unbounded inventory tables.
- Replaced old `take(10000)` catalogue reads with explicit catalogue limits for AI models, AI tools, agent tool bindings, global/active agents, plans, and company invites.
- Added an active-agent created-date index so runtime agent catalogue lookup is indexed and bounded.
- Kept model selection configuration-driven through stored model rows and existing resolver helpers.
- Removed retired Phase 6 broad-read exceptions from the platform drift allowlist.
- Remaining catalogue follow-up: analytics cost paths still read the model catalogue under the analytics plan, and provider-sync/debug helpers remain scheduled for Phase 7 maintenance quarantine.

## Phase 7: Legacy, Debug, Seed, And Maintenance Paths

Goal: stop old broad-scan code from accidentally becoming production code again.

Targets:

- `convex/analyticsHybrid.ts`
- `convex/debug.ts`
- `convex/debugModels.ts`
- `convex/testQuery.ts`
- Seed and migration helpers.
- Internal destructive maintenance functions.

Tasks:

- Delete legacy modules that no longer have a product role, or mark them internal-only.
- Remove generated API exposure for deleted public modules.
- Keep debug functions inaccessible from production UI.
- Require every maintenance/backfill broad scan to be paginated, destructive-action gated, or internal-only.
- Update tests to reflect deleted/quarantined modules.

Acceptance:

- Old analytics hybrid code cannot be called by product UI.
- Debug/test query files are not exposed as production user-facing features.
- Drift tests separate test-only broad reads from production broad reads.

Status:

- Deleted the legacy `analyticsHybrid` module and its dedicated tests; product UI was already on the newer analytics paths.
- Deleted standalone debug/query helpers: `debug`, `debugModels`, and `testQuery`.
- Deleted obsolete one-off `migrations` and `seedAgents` helpers so they cannot be exposed through generated Convex APIs.
- Tightened analytics debug output to small bounded reads.
- Converted billing reset maintenance into cursor-batched internal work kicked off by the existing cron entry point.
- Bounded agent transaction stats and seed model catalogue reads with named limits.
- Added drift coverage so deleted legacy/debug modules stay out of the repo and generated API surface.

## Phase 8: Drift Tests And Release Gates

Goal: make the plan enforceable.

Tasks:

- Extend `src/quality-drift.test.ts` with platform-scale broad-read classification.
- Add focused tests as each phase changes behavior.
- Keep locale parity, no-native-dialog, chart stability, admin pagination, tenant isolation, and provider-neutral checks green.
- Add docs updates in the same change set as any new scale-sensitive exception.

Acceptance:

- `npm run check` catches new unclassified broad reads.
- `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check` pass before merge/push.
- Production gate commands remain documented in `docs/developer/deployment.md`.

Status:

- Extended the platform drift guard across the scale-hardening phases so broad reads, deleted legacy modules, analytics raw scans, admin pagination drift, locale parity, native-dialog usage, chart stability, tenant isolation, and provider-neutral runtime paths stay covered by tests.
- Verified the final Phase 7 cleanup and Phase 8 release gate locally with:
  - `npm run lint:all`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Local app services were restarted after the build gate so manual QA can continue from `http://localhost:3000`.

## Recommended Execution Order

1. Phase 0: classify and lock broad-read drift.
2. Phase 1: admin inventory lists.
3. Phase 2: knowledge base and ingestion.
4. Phase 3: chat and admin logs.
5. Phase 4: workflow runtime and scheduler.
6. Phase 5: inventory and MRR rollups.
7. Phase 6: configuration catalogues.
8. Phase 7: legacy/debug quarantine.
9. Phase 8: verification and release gates.

Do not start a later phase by widening the scope of an earlier one. If a later risk is discovered during an earlier phase, document it here and keep the implementation slice narrow.

## Verification Checklist

Before merging any phase:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

Before pushing to `main`, also run:

```bash
npm audit --audit-level=high
```

If the local frontend is running on port 3000, stop it before `npm run build`, then restart the app and Convex afterwards.
