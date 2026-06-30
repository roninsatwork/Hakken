# App Kits Interface Simplification Plan

This plan documents the proposed simplification of the super-admin app kits interface at `/admin/app-kits`. It responds to the current screen feeling overloaded because it combines catalog browsing, selected-kit preview, registry editing, launch-readiness details, and developer follow-up content in one dense three-column layout.

The target direction is to separate browsing from inspection:

- `/admin/app-kits` becomes a focused catalog/list screen for finding and comparing starter app kits.
- `/admin/app-kits/[templateId]` becomes a dedicated app kit detail screen with a back button to return to the catalog.
- `/admin/app-kits/[templateId]/setup` becomes a guided setup wizard for turning a selected kit into a draft build plan.
- `/admin/app-kits/plans/[id]` becomes the maintenance dashboard for tracking the draft plan through workspace setup, integrations, knowledge, resource review, evals, developer work, and release readiness.

This is a UX and information architecture plan. It should not change the conservative backend launch behavior documented in [App Kit And Launch Plan Implementation](./app-kit-launch-plan-implementation.md): app kits remain static starter definitions, registry changes remain super-admin-only, and launch materialization remains draft and inactive by default.

## Current Problem

The current app kits page asks the operator to do too much at once:

- Browse all app kits.
- Compare categories, risk profiles, agents, workflows, and eval counts.
- Understand the selected app kit.
- Edit registry state, owner, and notes.
- Scan planned agents, workflows, knowledge scopes, evals, connectors, and developer follow-ups.
- Decide whether to sync, save, or move toward a launch plan.

The right-hand preview column is the main source of overload. It competes with the catalog list for attention and forces detail-page content into a narrow, scroll-heavy panel. The selected-card border also implies an in-place editing model when the stronger interaction is to open the selected kit.

## Product Goal

Make the app kit area calmer and easier to reason about by giving each route one job.

The catalog route should answer:

- What starter kits exist?
- Which kit is relevant to this use case?
- What is the relative category, risk, and scope?
- Which kit should I open next?

The detail route should answer:

- What does this kit include?
- What registry state and notes apply?
- Which agents, workflows, knowledge scopes, evals, connectors, and follow-ups are planned?
- What must an operator or developer review before turning this into a real launch plan?

The setup wizard should answer:

- What information do I need to provide now?
- Which recommended integrations and knowledge sources are required, recommended, or optional?
- What will be created as draft resources?
- Which safety checks keep this from affecting customers too early?
- What happens after I save the draft build plan?

The plan detail route should answer:

- What has already been completed?
- What still needs an owner, connector, knowledge source, developer task, eval, or release review?
- Which action should the operator take next?

## Proposed Routes

Keep the existing `/admin/app-kits` alias and make it the primary catalog route.

Add a dedicated template detail route:

```text
/admin/app-kits/[templateId]
```

Add a guided setup route:

```text
/admin/app-kits/[templateId]/setup
```

The detail route should provide a clear back action:

```text
<- App Kits
```

The setup route should provide two clear exits:

```text
<- Kit overview
Save draft build plan
```

After a successful save, redirect to:

```text
/admin/app-kits/plans/[id]
```

The route can also be mirrored under `/admin/launch` later if that section continues to own the implementation, but the operator-facing mental model should stay consistent: catalog first, kit detail second, launch plan detail only after a plan is created.

## Catalog Screen

The catalog screen should remove the right-hand preview and focus on discovery.

Recommended content:

- Page header: `App Kits`
- Short restrained description, if needed.
- Search across template name, category, primary users, connectors, agents, and use-case copy.
- Category and risk filters.
- Optional status filter for registry lifecycle or saved/synced state.
- A responsive list or two-column card grid of templates.

Each app kit card should show only decision-making information:

- Template name.
- Category.
- Risk profile.
- Short tagline or description.
- Counts for agents, workflows, and evals.
- Plain-language `Best for` summary.
- Plain-language `Needs` summary, such as recommended integrations or knowledge.
- Safety note, such as `Creates drafts only`.
- Registry state, such as saved, not persisted, synced, or needs sync.
- Primary action: `Review kit`.

Avoid using an active selected state for cards. Cards can have hover and keyboard focus states, but clicking a card should navigate to the detail route instead of updating an in-page preview.

Consider removing or demoting the top metric cards unless they directly help operators choose a kit. Counts like total templates and categories are useful for orientation, but they should not dominate the first viewport.

Add a compact guidance band above the search and filters:

```text
App kits are draft blueprints. Pick one to review what it would create before anything is activated.
```

Show a simple three-step strip:

1. Choose a starter.
2. Review the draft plan.
3. Create inactive resources.

## Detail Screen

The detail screen should absorb the content currently shown in the right-hand preview and give it enough space.

Recommended structure:

- Back button to `App Kits`.
- Header with template name, category, risk profile, lifecycle state, and concise description.
- Primary action: `Start setup`.
- Secondary action for registry save/sync when applicable.
- `What this kit does` overview in plain language.
- `What this kit creates` summary for agents, workflows, knowledge areas, evals, and suggested connectors.
- `What you need before launch` summary for integrations, knowledge, owners, and developer work.
- `What stays safe` summary that reiterates draft-only resources, inactive agents/workflows, human approval, and release review.
- Internal catalog status section for lifecycle status, owner email, notes, source sync state, and persistence status.
- Planned resources section for agents, workflows, knowledge scopes, release evals, and suggested connectors.
- Developer follow-up section for implementation tasks and safety review.
- Readiness or safety section that reinforces draft-first behavior and approval requirements.

Start with a clean vertical page using full-width bands or unframed sections. Add tabs only if the detail content grows enough that a single page becomes hard to scan.

If tabs are introduced, likely tabs are:

- `Overview`
- `Components`
- `Setup`
- `Registry`
- `Evals`
- `Follow-up`

Do not hide critical readiness or safety information behind a tab unless the header or overview also summarizes it.

## Setup Wizard

The setup wizard should make app kits feel like a guided product workflow instead of an exposed implementation form.

The primary route is:

```text
/admin/app-kits/[templateId]/setup
```

The wizard should use the existing `createLaunchPlan` mutation and `setupOverrides` payload before introducing new backend shape. The first implementation can be a client-side multi-step form that saves the same draft build plan currently created from the detail screen.

Recommended steps:

1. `Use Case`
   - Confirm the selected kit and explain the outcome in normal operator language.
   - Show who it is best for and what business problem it addresses.
2. `Workspace`
   - Capture target workspace name, product/app name, first admin email, brand accent, invite policy notes, and target plan name.
3. `Integrations`
   - Show recommended connectors as checklist cards.
   - Label connector importance as `Required`, `Recommended`, or `Optional` once template metadata supports it.
   - Capture connector owner and notes.
4. `Knowledge`
   - Show required knowledge areas from the template.
   - Capture knowledge owner, source candidates, and missing-source notes.
5. `Agents And Workflows`
   - Summarize the draft agents and workflows that will be created.
   - State that resources start inactive and require review before customer use.
6. `Safety And Tests`
   - Show readiness checks and release evals in plain language.
   - Reinforce human approval, draft-first behavior, and no customer-facing publishing.
7. `Review`
   - Show a compact summary of all captured setup data.
   - Save with `Create draft build plan`.
   - Redirect to the plan detail maintenance dashboard.

The wizard should persist local step state while the user moves between steps. It does not need autosave in the first pass; draft persistence can happen only on the final review step.

### Wizard UX Rules

- Lead each step with one sentence explaining what the user is deciding.
- Keep developer-only metadata collapsed or lower on the page.
- Use progress indication such as `Step 2 of 7`.
- Use clear back/next controls.
- Do not activate resources, publish surfaces, invite users, or connect external tools from the wizard.
- Make the final save language explicit: `Create draft build plan`.
- After save, route to the plan detail dashboard instead of leaving the user on the wizard.

## Maintenance Dashboard

The launch plan detail page should evolve into a maintenance dashboard for the draft build plan.

The dashboard should track setup and readiness as a checklist with status, owner, notes, and next action links. This helps operators maintain app-kit launches after the initial draft plan is created.

Recommended checklist groups:

- Workspace created or linked.
- First admin invited or assigned.
- Plan and branding reviewed.
- Recommended connectors configured.
- Knowledge sources uploaded or scheduled.
- Draft agents materialized.
- Draft workflows materialized.
- Agent prompts reviewed.
- Workflow triggers and approval paths reviewed.
- Release evals seeded and passing.
- Developer tasks completed.
- Customer-facing surfaces reviewed.
- Release review completed.

Each checklist item should expose:

- Status: `Blocked`, `Not started`, `In progress`, `Ready`, or `Done`.
- Owner email or role.
- Short notes.
- Next action label and link.

Initial status can be derived from existing plan details where possible:

- Workspace linked.
- Created resources exist.
- Connector readiness.
- Developer task summary.
- Materialization status.

New mutable checklist state should only be added after deriving as much as possible from current durable plan data. If manual checklist overrides become necessary, store them separately from the original `planJson` so old plans remain readable.

## Interaction Model

The user flow should be:

1. Open `/admin/app-kits`.
2. Search, filter, and compare app kits.
3. Click a card or `Open` action.
4. Land on `/admin/app-kits/[templateId]`.
5. Review what the kit does and what it will create.
6. Click `Start setup`.
7. Complete the setup wizard.
8. Save a draft build plan.
9. Land on `/admin/app-kits/plans/[id]` to maintain the plan through readiness.
10. Use back links to return to the kit or catalog.

The catalog should not preserve a selected card as a preview state. Browser back/forward behavior should work naturally between the catalog and detail routes.

## Visual Direction

The app kits area should feel like an operational admin tool, not a marketing gallery.

Design notes:

- Reduce repeated all-caps micro-labels.
- Use orange as a focused accent for active actions, risk/status emphasis, and key affordances.
- Keep risk badges legible and direct: `Low`, `Medium`, `High`.
- Remove decorative icons unless they communicate an action or meaningful status.
- Make cards shorter and more scannable.
- Avoid nesting cards inside cards.
- Use shared admin page/detail patterns where they fit.
- Prefer dense, predictable layouts over oversized hero treatment.

The catalog should optimize for scanning and comparison. The detail screen should optimize for review, editing, and operational handoff.

## Language Improvements

Use operator-facing labels before internal implementation labels:

- `Catalogue Registry` -> `Internal catalog status`.
- `Draft Build Plan` -> `Create draft build plan`.
- `Developer Follow-Up` -> `Developer work still needed`.
- `Extension Points` -> `Where this can be customized`.
- `Code Pointers` -> `Developer reference files`.
- `Release Evals` -> `Test cases before launch`.
- `Suggested Connectors` -> `Recommended integrations`.

Keep implementation labels available in developer-facing sections when useful, but do not make them the first thing a non-technical operator has to parse.

## Implementation Phases

Status as of June 30, 2026: Phases 1, 2, 5, and the first derived-status pass of Phase 6 are implemented. Phase 3 has a first-pass detail route, but it can still be refined after operators use the flow. Phase 4 has focused regression coverage and has passed the local gate for the current implementation slice.

### Phase 1: Route Split

Progress target: catalog/detail UX foundation.

- Add `/admin/app-kits/[templateId]` detail route.
- Move selected-template detail content out of the catalog page.
- Add a back button from detail to catalog.
- Change catalog cards to navigate instead of setting a selected preview.
- Preserve current registry save/sync behavior on the detail route.

Implementation status: complete for the current App Kits flow.

### Phase 2: Catalog Declutter

Progress target: calmer browsing page.

- Remove the right-hand preview column.
- Rebalance the catalog layout around search, filters, and template cards.
- Demote or remove high-level metric cards if they do not help selection.
- Simplify card metadata to name, category, risk, description, counts, and registry state.
- Ensure keyboard navigation and focus states remain clear.

Implementation status: complete for the current catalog. The catalog now includes a guidance band, a three-step launch path, plain-language card summaries, and `Review kit` navigation.

### Phase 3: Detail Page Refinement

Progress target: usable review and configuration page.

- Group registry controls, planned resources, connectors, evals, and developer follow-up into clear sections.
- Add readiness/safety summary copy that matches existing draft-first behavior.
- Consider tabs only if the detail page becomes too long after the first pass.
- Keep launch-plan creation clearly separate from registry editing.

Implementation status: first pass complete. Registry editing lives on the detail route, while draft build-plan creation moved to the setup wizard.

### Phase 4: Verification And Regression Coverage

Progress target: stable implementation.

- Add or update page tests for catalog rendering, search/filter behavior, card navigation, detail loading, missing template handling, registry save/sync actions, and back navigation.
- Keep English and Italian locale dictionaries in parity for any new user-visible strings.
- Confirm no native browser dialogs are introduced.
- Run focused tests for the app kit pages.
- Before merge or push, run the full local gate from `AGENTS.md`.

Implementation status: focused page tests cover the catalog/detail/setup and plan-detail checklist paths. The current implementation slice passed `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check` with Node 22.13.0.

### Phase 5: Guided Setup Wizard

Progress target: make setup intuitive.

- Add `/admin/app-kits/[templateId]/setup`.
- Move draft build-plan form fields out of the kit detail page and into wizard steps.
- Use existing `createLaunchPlan` and `setupOverrides` behavior for the first pass.
- Add a review step before saving.
- Redirect to `/admin/app-kits/plans/[id]` after successful save.
- Add tests for step navigation, field persistence, final payload, and redirect behavior.

Implementation status: complete for the first pass using existing launch plan payloads and `setupOverrides`. The wizard now includes per-step guidance, step status markers, and selectable recommended integrations, knowledge areas, and publish surfaces so operators do not have to infer setup values from comma-separated fields.

### Phase 6: Maintenance Dashboard

Progress target: make app-kit launches maintainable after setup.

- Reframe `/admin/app-kits/plans/[id]` as a readiness and maintenance dashboard.
- Add checklist groups for workspace, access, integrations, knowledge, agents, workflows, evals, developer work, surfaces, and release review.
- Derive checklist status from existing plan detail data before adding new mutable state.
- Link checklist actions to the relevant admin pages.
- Add tests for derived statuses and next-action links.

Implementation status: first derived checklist pass is implemented on the plan detail route. The checklist now promotes one recommended next step so operators can see the immediate maintenance action before scanning every checklist card, and in-page actions jump to the relevant workspace, draft-resource, created-resource, or developer-task section. Manual checklist state remains intentionally out of scope until derived status proves insufficient.

## Non-Goals

This plan does not propose:

- Changing app kit template payload shape.
- Activating agents or workflows by default.
- Creating customer-facing app surfaces.
- Changing launch plan materialization semantics.
- Connecting external tools directly from the wizard.
- Inviting users directly from the wizard.
- Expanding the movement demo.
- Refactoring unrelated admin sections.

## Open Decisions

- Whether the detail route should live only at `/admin/app-kits/[templateId]` or also be aliased under `/admin/launch/templates/[templateId]`.
- Whether the catalog cards should be card-based or use a denser table-card hybrid.
- Whether registry editing should be available directly on the first detail screen or placed lower on the page.
- Whether launch-plan creation should remain on the detail page or move entirely into the setup wizard.
- Whether the top metric cards should be removed entirely or reduced to a compact summary row.
- Whether connector importance should be added to template metadata as required/recommended/optional.
- Whether maintenance checklist overrides need persistent manual state or can remain fully derived initially.
- Whether the wizard should support autosave after the first implementation.

## Verification Notes

For this documentation-only plan, run:

```bash
git diff --check
```

Before implementing the route split, also inspect:

- `src/app/(dashboard)/admin/launch/page.tsx`
- `src/app/(dashboard)/admin/app-kits/page.tsx`
- `src/app/(dashboard)/admin/app-kits/AppKitsClient.tsx`
- `src/app/(dashboard)/admin/app-kits/[templateId]/page.tsx`
- `src/app/(dashboard)/admin/launch/page.test.tsx`
- `src/app/(dashboard)/admin/launch/plans/[id]/page.tsx`
- `src/app/(dashboard)/admin/launch/plans/[id]/page.test.tsx`
- `convex/appTemplates.ts`
- `docs/developer/app-kit-launch-plan-implementation.md`
- `docs/developer/shared-admin-ui.md`
