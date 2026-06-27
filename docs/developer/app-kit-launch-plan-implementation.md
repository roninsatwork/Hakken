# App Kit And Launch Plan Implementation

This guide documents the implementation behind Sonae's app kit catalog and launch plan materialization flow. It complements [Launch, Releases, And Observability](./launch-releases-and-observability.md), which covers the broader launch operations area including releases and run observability.

The current implementation is a super-admin-only preparation system. App kits are static code-backed starter definitions. Operators can sync those templates into a persistent catalog registry, create durable launch plans, link or create a tenant workspace, and materialize inactive draft agents, workflows, and eval fixtures. The system does not automatically ship a customer app, activate agents, connect tools, publish widgets, or complete release review.

## Product Surface

The app kit launch flow is exposed through these routes:

- `src/app/(dashboard)/admin/launch/page.tsx` renders the app kit gallery, catalog registry controls, setup intent fields, and recent launch plans.
- `src/app/(dashboard)/admin/app-kits/page.tsx` re-exports the launch gallery.
- `src/app/(dashboard)/admin/launch/plans/[id]/page.tsx` renders launch plan detail, workspace actions, materialization actions, connector readiness, developer tasks, setup plans, and surface implementation actions.
- `src/app/(dashboard)/admin/app-kits/plans/[id]/page.tsx` re-exports the launch plan detail page.

The core backend module is `convex/appTemplates.ts`. Related implementation areas are:

- `convex/agentTemplates.ts` for agent archetypes used when seeding draft agents.
- `convex/agentEvalFixtures.ts` for smoke fixture seeding.
- `convex/agentService.ts` for global agent record construction.
- `convex/aiModelService.ts` for the failsafe model id used by draft resources.
- `convex/companyService.ts` for workspace/company record creation.
- `convex/utils/inventoryRollupService.ts` for global company inventory totals.
- `convex/aiTools.ts` and `toolConnectors` rows for connector readiness shown on plan detail.

## Template Catalog

`APP_TEMPLATES` in `convex/appTemplates.ts` is the static source of truth for app kit definitions. Each base template includes:

- stable `id`
- `category`
- `name`
- `tagline`
- `description`
- `riskProfile`
- `primaryUsers`
- `recommendedConnectorKeys`
- planned `agents`
- `knowledgeScopes`
- planned `workflows`
- `evalFixtures`
- `dashboardCards`
- `publishTargets`
- `readinessChecks`

`withDeveloperGuidance` enriches every base template with developer follow-ups, extension points, and implementation pointers. Template-specific maps can add targeted guidance; defaults are appended for common extension areas such as domain schema, tool execution, product surfaces, and eval fixtures.

When adding or changing a template, keep the language operationally accurate. A template may describe planned starter resources and follow-up work, but it should not imply that product-specific screens, connector handlers, external write actions, or customer-facing surfaces already exist unless they are implemented.

## Persistent Registry

The persistent catalog registry uses `appTemplateCatalogItems`. It stores a row per static template with lifecycle metadata and a serialized source snapshot:

- `templateId`
- `templateName`
- `category`
- `riskProfile`
- `lifecycleStatus`
- optional `ownerEmail`
- optional `editorialNotes`
- `sourceJson`
- `sourceUpdatedAt`
- `lastSyncedAt`
- creator/updater ids and timestamps

`createCatalogSourceJson` serializes the fields that define the operator-facing template source. `getAppTemplateCatalogRegistry` compares the current static source JSON against the persisted `sourceJson` and returns `isSynced` for each template. This lets the UI show when a registry item needs sync after code changes.

`syncAppTemplateCatalogRegistry` is super-admin-only. It upserts registry rows for every static template. New rows default to lifecycle status `ACTIVE`. Existing rows keep editorial status, owner, and notes while refreshing template metadata and source JSON. The mutation returns created, updated, and total counts for the UI message.

`updateAppTemplateCatalogItem` is also super-admin-only. It can create a registry row on demand for one template or patch lifecycle status, owner email, and editorial notes on an existing row. Owner and notes are trimmed and blank values are normalized away.

## Launch Plan Payload

`createLaunchPlan` persists an `appLaunchPlans` row with a serialized `planJson`. The row stores high-level fields for listing and filtering, while `planJson` stores the durable handoff payload.

`createLaunchPlanPayload` builds the payload from the selected template plus optional setup overrides. The payload includes:

- template identity, category, risk profile, and primary users
- selected recommended connector keys
- planned draft resources: agents, knowledge scopes, workflows, eval fixtures, dashboard cards, and publish targets
- readiness checks
- developer follow-ups
- extension points
- implementation pointers
- workspace setup plan
- connector bundle plan
- starter knowledge import plan
- publish surface plan
- safety defaults

The safety defaults are intentionally conservative:

- resource status is `DRAFT`
- external actions require approval
- release gates are required

Setup overrides come from the launch gallery form. They capture product name, brand accent, first admin email, invite policy notes, model use cases, target plan name, connector owner, selected connectors, connector notes, knowledge owner, starter knowledge sources, knowledge notes, surface owner, selected publish targets, and publish notes. List values are trimmed, deduplicated, and only persisted when non-empty.

## Plan Detail Assembly

`getLaunchPlanDetails` is the main read model for the launch plan detail page. It parses `planJson`, parses `createdResourceJson` when present, joins created agents, workflows, and fixtures, loads a linked workspace summary, evaluates connector readiness, and builds derived operator/developer summaries.

The returned detail object includes:

- the raw plan row
- parsed plan payload
- created resource ids
- created resource details
- connector readiness
- readiness summary
- developer handoff summary
- developer tasks
- developer task summary
- workspace setup actions
- surface implementation actions
- linked workspace summary

The readiness summary is intentionally not a release gate. It shows whether draft resources exist, whether planned resource counts match created resources, whether any created resource links are missing, and how many recommended connectors are ready. Connector readiness requires the connector to be installed, installed status to be `INSTALLED`, test status to be `SUCCESS`, active state not false, and OAuth connectors to be connected.

The developer task map converts launch plan content into actionable categories: workspace, brand, access, models, plan, resources, connectors, knowledge, code, surfaces, and release. Blocked tasks usually indicate missing workspace or connector setup. Pending tasks indicate work that still needs human review or product-specific implementation.

## Workspace Linking

Launch plans can create or link a tenant workspace.

`createWorkspaceForLaunchPlan` is super-admin-only. It rejects archived plans, returns the existing linked workspace when it still exists, and otherwise creates a company from the plan target company name or template name. The company record uses `buildCompanyRecord` with a system prompt noting that it came from the launch plan. The mutation increments global company inventory totals, patches the launch plan with the company id and name, and writes audit logs for workspace creation and plan-workspace linking.

`linkWorkspaceToLaunchPlan` is super-admin-only. It rejects missing plans, missing companies, and archived plans. If the plan already points at the selected company, it returns without rewriting. Otherwise it patches the plan with the selected company id and company name and writes a link audit log including the previous company id when present.

These workspace actions only create or link the company shell. They do not invite users, assign billing plans, apply brand assets, upload knowledge, set tenant model defaults, activate agents, or publish surfaces.

## Materialization

`materializeLaunchPlan` creates draft resources from a non-archived launch plan. It is super-admin-only and idempotent at the plan level.

If `createdResourceJson` already exists, the mutation returns the stored resource ids without creating duplicates. If not, it loads the current template by `templateId`, selects an agent archetype from `APP_TEMPLATE_AGENT_ARCHETYPE`, and creates:

- inactive global agents for every planned template agent
- smoke eval fixtures for each created agent
- source run ids from fixture seeding
- inactive manual workflows for every planned template workflow

Draft agents are built with `buildGlobalAgentRecord` and intentionally start with:

- `SYSTEM_FAILSAFE_MODEL_ID`
- `modelSelectionMode: "inherit"`
- the selected archetype system prompt
- `isActive: false`
- archetype temperature and reasoning effort
- `humanApprovalRequired: true`
- `triggerType: "MANUAL"`

Draft workflows intentionally start with:

- `isActive: false`
- `triggerType: "MANUAL"`
- empty node and edge arrays
- a description telling operators to review trigger, steps, and approvals before activation

After resource creation, the mutation stores `createdResourceJson`, changes the plan status to `MATERIALIZED`, updates the timestamp, and writes a materialization audit log with template id, template name, agent count, workflow count, and fixture count.

Do not change this flow to create active agents, active workflows, external connector actions, customer-facing widgets, or published app surfaces without an explicit product decision and matching release checks. The launch plan is a scaffold and handoff record, not a production activation path.

## Archive Behavior

`archiveLaunchPlan` is super-admin-only. It marks a plan `ARCHIVED`, updates the timestamp, and writes an audit log with template and target-company metadata. Archived plans cannot create workspaces or materialize resources.

Archiving does not delete previously created agents, workflows, fixtures, workspaces, or release records. Operators must review those resources separately if a build plan is cancelled after materialization.

## Authorization And Audit

All catalog, registry, launch plan, workspace, materialization, and archive operations in `convex/appTemplates.ts` require `requireSuperAdmin`.

Audit logs are written for:

- `CREATE_APP_LAUNCH_PLAN`
- `ARCHIVE_APP_LAUNCH_PLAN`
- `MATERIALIZE_APP_LAUNCH_PLAN`
- `CREATE_LAUNCH_WORKSPACE`
- `LINK_APP_LAUNCH_PLAN_WORKSPACE`

When adding new mutations in this area, include enough audit metadata to connect the action back to the template id, launch plan id, company id, created resources, and human-facing reason or notes where applicable.

## Maintenance Rules

When adding an app kit:

1. Add a stable template id and complete base template data in `APP_TEMPLATES`.
2. Add template-specific developer follow-ups when the default guidance is too generic.
3. Add extension points that match real product work, not aspirational surfaces.
4. Add implementation pointers to real repo paths.
5. Map the template to an agent archetype in `APP_TEMPLATE_AGENT_ARCHETYPE`, or confirm the default internal knowledge archetype is appropriate.
6. Add or update tests that prove the template has required metadata.
7. Update documentation if the new template represents a durable product or operating area.

When changing plan payload shape:

- Keep old plan rows readable where possible because `planJson` is durable JSON.
- Update the plan detail parser and UI types together.
- Preserve conservative safety defaults.
- Avoid making registry sync destructive to editorial status, owner, and notes.
- Keep materialization idempotent and inactive-by-default.
- Update tests in `convex/appTemplates.test.ts`.

When changing workspace creation:

- Preserve tenant isolation.
- Avoid granting super-admin privileges to tenant users.
- Keep inventory rollups accurate.
- Keep audit logs for both company creation and launch-plan linking.

## Verification

Focused tests include:

- `convex/appTemplates.test.ts` for template metadata, gallery auth, registry sync, launch plan persistence, setup overrides, connector readiness, workspace linking, materialization, and authorization.
- `src/app/(dashboard)/admin/launch/page.test.tsx` for launch gallery behavior.
- `src/app/(dashboard)/admin/launch/plans/[id]/page.test.tsx` for plan detail behavior.

For documentation-only edits, run `git diff --check` and a Markdown local-link check. Before merging implementation changes in this area, run the full gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
