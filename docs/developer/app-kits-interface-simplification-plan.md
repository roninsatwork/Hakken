# App Kits Interface Simplification Plan

Updated: July 2, 2026

This plan documents the next UX pass for the super-admin App Kits area at `/admin/app-kits`.

The catalog/detail/setup route split is already in place. The remaining issue is that the catalog landing screen still feels dense because it combines launch education, search, category filters, risk filters, kit cards, registry summary, and recent draft build plans in one continuous first-screen experience.

The current direction is to reuse the same secondary tabbed navigation language used elsewhere in admin screens, but to use it for workflow areas rather than for every filter value.

## Current State

The App Kits flow currently has these routes:

- `/admin/app-kits`: catalog, search, category/risk filters, kit cards, launch guidance, and recent draft plans.
- `/admin/app-kits/[templateId]`: kit detail, registry controls, resources, safety notes, integrations, evals, and developer follow-up.
- `/admin/app-kits/[templateId]/setup`: guided setup wizard for creating a draft build plan.
- `/admin/app-kits/plans/[id]`: draft build-plan maintenance dashboard.

This is a good route foundation. The problem is now local to the catalog route: too many page jobs are visible at once.

## Problem

The catalog screen asks the operator to process all of this at the same time:

- What App Kits are.
- How the launch process works.
- Which kit category to browse.
- Which risk profile to browse.
- How many kits and registry items exist.
- Which templates match the current search.
- Which draft build plans already exist.

The visual result is a page that feels heavier than the task. Most operators opening `/admin/app-kits` likely want one primary thing first: find and open the right starter kit.

The existing launch guide and recent build plans are useful, but they compete with browsing instead of supporting it.

## Product Goal

Make `/admin/app-kits` feel like a calm operational tool with one clear default job:

```text
Find an appropriate starter kit, then review it before setup.
```

Secondary jobs should stay close by but not consume the default viewport:

- Continue an existing draft build plan.
- Understand the safe launch path.
- Inspect internal registry status when needed.

## Proposed Secondary Tabs

Add a secondary tab row directly under the App Kits page header.

Recommended visible tabs:

- `Browse Kits`
- `Draft Plans`
- `Launch Guide`
- `Registry`

The default tab should be `Browse Kits`.

### Browse Kits

Purpose: choose a starter.

Content:

- Search input.
- Category filters.
- Risk filters.
- Compact kit count and saved/synced count.
- Kit cards.
- Empty state for unmatched filters.

Changes from current catalog:

- Remove the large guided launch band from the default view.
- Remove recent draft build plans from the default view.
- Keep the short page description restrained.
- Keep categories and risks as filters, not as page-level tabs.
- Keep kit cards focused on decision-making metadata.

Why categories should stay filters:

The category set can already include values such as `Compliance`, `Customer Support`, `Finance`, `Industry`, `Operations`, `Platform`, `Product`, and `Sales`. Making these first-class secondary tabs would recreate the same busy row in a different form. Workflow-area tabs are more stable and match the user's mental model better.

### Draft Plans

Purpose: resume or inspect saved build plans.

Content:

- Recent build plans currently shown at the bottom of the catalog.
- Draft count and status summary.
- Links to `/admin/app-kits/plans/[id]`.
- Empty state: `No draft build plans saved yet.`

Preferred first pass:

- Move the existing `Recent Build Plans` section into this tab with minimal behavioral change.
- Keep card styling consistent with the current plan cards.
- Avoid adding new mutable plan state in this phase.

### Launch Guide

Purpose: explain the safe launch path without occupying the browsing view.

Content:

- The current `Guided launch path` text.
- The three-step sequence:
  1. Choose a starter.
  2. Run setup.
  3. Create drafts.
- A short safety note that resources remain draft/inactive until reviewed.
- Optional links into the implementation docs for developer users.

Preferred first pass:

- Move the current guidance band into this tab.
- Make the copy slightly shorter and more operational.
- Do not add new marketing-style hero treatment.

### Registry

Purpose: expose internal catalog status without making every operator parse it while browsing.

Content:

- Saved/synced/needs-sync summary.
- Lifecycle status counts if available from existing `catalogRegistry`.
- Link to each kit detail page for item-level registry editing.
- Optional `needs sync` callout when stale items exist.

First-pass constraint:

- Do not move item-level registry editing back onto the catalog page.
- Keep item editing on `/admin/app-kits/[templateId]`.
- If the Registry tab cannot add meaningful content without new backend queries, ship the first pass with `Browse Kits`, `Draft Plans`, and `Launch Guide`, then add `Registry` later.

## Recommended Interaction Model

Use query-state tabs on the catalog route:

```text
/admin/app-kits?view=browse
/admin/app-kits?view=plans
/admin/app-kits?view=guide
/admin/app-kits?view=registry
```

Benefits:

- Browser back/forward behavior stays natural.
- Links can open a specific catalog view.
- The route split remains unchanged.
- Draft plans and launch guidance do not need separate pages yet.

If the existing `AdminDetailTabs` component fits the page-level header, reuse it or extract a shared secondary tab primitive from it. If it is too detail-route-specific, create a small page-level variant that matches its visual language instead of introducing a new style.

Expected active-tab behavior:

- Missing or unknown `view` defaults to `browse`.
- Search/category/risk state can remain local in the first pass.
- Switching tabs does not need to preserve scroll position.
- Kit cards continue navigating to `/admin/app-kits/[templateId]`.
- Draft plan cards continue navigating to `/admin/app-kits/plans/[id]`.

## Catalog Layout Direction

The default `Browse Kits` view should fit the most important work into a calmer first viewport:

1. Page header: `App Kits` plus one short description.
2. Secondary tabs.
3. Search and filter toolbar.
4. Kit card grid.

The toolbar should be compact:

- Search left.
- Summary counts right on desktop.
- Category filters below search.
- Risk filters below categories or aligned after category filters if width allows.

The cards should remain scannable and operational:

- Category and risk badge.
- Kit name.
- One-line tagline.
- `Best for`.
- `Needs`.
- `Creates`.
- `Safety`.
- `Review kit` action.

Avoid adding more card metadata unless it clearly helps kit selection.

## Detail And Setup Routes

No immediate route changes are planned.

Keep:

- `/admin/app-kits/[templateId]` as the review/detail screen.
- `/admin/app-kits/[templateId]/setup` as the guided wizard.
- `/admin/app-kits/plans/[id]` as the maintenance dashboard.

Future detail-page tabs may still be useful, but they are not the current priority. The screenshot pain is on the catalog landing screen.

## Implementation Phases

### Phase 1: Documented Plan

Status: complete when this document is merged.

Scope:

- Capture the UX direction.
- Confirm the tab labels and responsibilities.
- Record constraints and acceptance criteria.

### Phase 2: Catalog Tabs

Status: not started.

Scope:

- Add query-backed secondary tab state to `AppKitsCatalogPage`.
- Render the secondary tab row under `AdminPageHeader`.
- Default to `Browse Kits`.
- Move the current guidance band into `Launch Guide`.
- Move the current recent build plans section into `Draft Plans`.
- Keep search, filters, and cards in `Browse Kits`.

Primary file:

- `src/app/(dashboard)/admin/app-kits/AppKitsClient.tsx`

Likely supporting files:

- `src/app/(dashboard)/admin/_components/AdminDetailTabs.tsx`
- `src/app/(dashboard)/admin/_components/AdminDetailTabs.test.tsx`
- `src/app/(dashboard)/admin/launch/page.test.tsx`

Only touch the shared tab component if the catalog can reuse it cleanly.

### Phase 3: Registry View

Status: optional first-pass follow-up.

Scope:

- Add the `Registry` tab if useful summary data can be shown from existing catalog registry query results.
- Keep item-level registry editing on kit detail pages.
- Add a stale-sync summary when `registrySummary.staleCount > 0`.

Defer this phase if it requires new backend shape.

### Phase 4: Polish And Regression Coverage

Status: not started.

Scope:

- Add or update tests for default tab rendering.
- Verify `view=plans` renders draft plan cards.
- Verify `view=guide` renders launch guide content.
- Verify unknown `view` falls back to browse.
- Verify card links still navigate to detail and plan routes.
- Check desktop and laptop widths for tab and toolbar wrapping.

## Acceptance Criteria

- `/admin/app-kits` defaults to a `Browse Kits` view.
- The first viewport no longer shows the full guided launch path and recent draft plans at the same time as the full catalog.
- The visible secondary tabs are stable workflow areas, not category names.
- Search, category filters, and risk filters remain available in `Browse Kits`.
- Existing kit detail, setup, and plan detail routes keep their URLs.
- `Draft Plans` exposes the existing recent build-plan cards.
- `Launch Guide` exposes the safe draft-first process.
- `Registry`, if included, summarizes catalog state without reintroducing dense editing controls on the catalog.
- No native browser dialogs are introduced.
- The movement demo remains untouched.

## Non-Goals

This plan does not propose:

- Changing app kit template payload shape.
- Changing Convex launch materialization semantics.
- Activating agents or workflows by default.
- Creating customer-facing surfaces from the catalog.
- Moving setup fields back onto the catalog.
- Replacing category/risk filters with category/risk tabs.
- Refactoring unrelated admin screens.
- Refactoring, redesigning, or expanding the frozen movement demo.

## Open Decisions

- Whether `Registry` ships in the first tab pass or follows after `Browse Kits`, `Draft Plans`, and `Launch Guide`.
- Whether to reuse `AdminDetailTabs` directly or extract a route-agnostic secondary tab component.
- Whether tab state should reset search/filter state or preserve it while navigating between views.
- Whether the draft plan cards should become a denser table once plan volume grows.
- Whether the App Kits page description should mention registry/release work or only the starter-kit browsing task.

## Verification

For this documentation-only update:

```bash
git diff --check
```

For the implementation pass:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

If the local frontend is running on port 3000, stop it before `npm run build`, then restart the app services afterwards.
