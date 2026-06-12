# Company Workspace AI Navigation Consolidation Plan

This plan documents the proposed navigation change for company workspaces: reduce the top tab bar length by grouping company-specific AI pages under a single `AI` tab with a third-level submenu.

This is a planning document only. Do not implement this work unless the user explicitly asks to move from planning into coding.

## Goal

The company workspace tab bar has become too long. The AI-related pages currently sit as separate top-level tabs, which makes the workspace harder to scan and leaves less room for future sections.

Replace the current top-level AI-related tabs with one top-level `AI` tab, then move the AI pages into a submenu that follows the existing `Widget` page pattern.

## Current Top-Level Tabs

The current company workspace top navigation includes:

- `Dashboard`
- `Overview`
- `Directory`
- `Invites`
- `Knowledge`
- `Prompt`
- `AI Rules`
- `AI Models`
- `Widget`
- `Chat Logs`

The issue is not the individual pages themselves. The issue is that too many related configuration and monitoring pages are competing at the same navigation level.

## Proposed Top-Level Tabs

The consolidated company workspace top navigation should become:

- `Dashboard`
- `Overview`
- `Directory`
- `Invites`
- `AI`
- `Widget`

This keeps the workspace sections shorter and easier to scan while preserving access to the existing AI functionality.

## Proposed AI Submenu

When `AI` is active, show a third-level submenu similar to the existing `Widget` submenu.

Recommended submenu order:

1. `Knowledge`
2. `Prompt`
3. `AI Rules`
4. `AI Models`
5. `Chat Logs`

Rationale:

- `Knowledge` is the source material layer.
- `Prompt` is the primary behavior layer.
- `AI Rules` is the policy and guardrail layer.
- `AI Models` is the runtime configuration layer.
- `Chat Logs` is the monitoring and review layer.

## Navigation Model

`AI` should behave as a parent workspace tab.

When any AI child page is active:

- the top-level `AI` tab is active,
- the third-level AI submenu is visible,
- the matching submenu item is active.

Expected active states:

| Route | Top tab | Submenu item |
| --- | --- | --- |
| `/admin/companies/:companyId/ai/knowledge` | `AI` | `Knowledge` |
| `/admin/companies/:companyId/ai/prompt` | `AI` | `Prompt` |
| `/admin/companies/:companyId/ai/rules` | `AI` | `AI Rules` |
| `/admin/companies/:companyId/ai/models` | `AI` | `AI Models` |
| `/admin/companies/:companyId/ai/chat-logs` | `AI` | `Chat Logs` |

Clicking the top-level `AI` tab should route to the default child page.

Recommended default:

```txt
/admin/companies/:companyId/ai/knowledge
```

`Knowledge` is the best default because it is the foundation for the rest of the company-level AI configuration.

## Route Plan

Preferred new route shape:

```txt
/admin/companies/:companyId/ai
/admin/companies/:companyId/ai/knowledge
/admin/companies/:companyId/ai/prompt
/admin/companies/:companyId/ai/rules
/admin/companies/:companyId/ai/models
/admin/companies/:companyId/ai/chat-logs
```

The parent route should redirect to the default AI page:

```txt
/admin/companies/:companyId/ai -> /admin/companies/:companyId/ai/knowledge
```

## Legacy Route Redirects

Existing routes should continue to work and redirect to the new nested routes.

| Existing route | New route |
| --- | --- |
| `/admin/companies/:companyId/knowledge` | `/admin/companies/:companyId/ai/knowledge` |
| `/admin/companies/:companyId/prompt` | `/admin/companies/:companyId/ai/prompt` |
| `/admin/companies/:companyId/rules` | `/admin/companies/:companyId/ai/rules` |
| `/admin/companies/:companyId/models` | `/admin/companies/:companyId/ai/models` |
| `/admin/companies/:companyId/chat-logs` | `/admin/companies/:companyId/ai/chat-logs` |

This preserves browser bookmarks, direct links, and any internal navigation paths that may still point at the old locations.

## Visual And Interaction Pattern

Reuse the `Widget` page structure as the target pattern:

- Keep the top-level company workspace tab bar visible.
- Show a third-level left submenu when the parent tab has subsections.
- Use the existing active submenu styling.
- Keep page content in the main panel to the right of the submenu.
- Avoid creating a new navigation pattern for AI.

This change should feel like the existing `Widget` section gained a sibling section called `AI`.

## Page Content Scope

Do not redesign page content as part of this navigation consolidation.

The work should only move where pages live in navigation and routes.

Current page-to-destination mapping:

| Current page | New location |
| --- | --- |
| `Knowledge` | `AI > Knowledge` |
| `Prompt` | `AI > Prompt` |
| `AI Rules` | `AI > AI Rules` |
| `AI Models` | `AI > AI Models` |
| `Chat Logs` | `AI > Chat Logs` |

Existing page behavior, forms, data loading, mutations, table paging, and permissions should remain unchanged.

## Naming Rules

Use `AI` for the top-level tab.

Do not use `Artificial Intelligence` in the company workspace tab bar because:

- the change is partly about reducing horizontal space,
- the left sidebar already has a broader `Artificial Intelligence` area,
- `AI` is clear enough in this product context.

Use the existing submenu labels:

- `Knowledge`
- `Prompt`
- `AI Rules`
- `AI Models`
- `Chat Logs`

Avoid renaming these during the consolidation unless a separate product decision is made.

## Relationship To Global AI Navigation

The left sidebar already contains a broader `Artificial Intelligence` section for platform-level AI administration.

Keep the conceptual split:

- left sidebar `Artificial Intelligence`: global or platform AI administration,
- company workspace `AI`: company-specific AI configuration and company-specific AI observability.

Be careful not to route company workspace pages to global AI pages, and do not use global AI permissions as a shortcut for company workspace access.

## Permissions And Tenant Isolation

This change must preserve the existing permission model.

Required behavior:

- Users who can currently access company knowledge can still access `AI > Knowledge`.
- Users who can currently access company prompt settings can still access `AI > Prompt`.
- Users who can currently access company AI rules can still access `AI > AI Rules`.
- Users who can currently access company model overrides can still access `AI > AI Models`.
- Users who can currently access company chat logs can still access `AI > Chat Logs`.
- Users must not gain access to a page only because it now sits under the `AI` parent.
- Non-super-admin access must remain scoped by company.

The top-level `AI` tab should only be visible if the current user can access at least one AI child page.

## Implementation Phases

### Phase 1: Audit Existing Navigation And Routes

Tasks:

- Find the company workspace top-tab configuration.
- Find how the current `Widget` third-level submenu is implemented.
- Identify the page files and components for:
  - company knowledge,
  - company prompt,
  - company AI rules,
  - company AI models,
  - company chat logs.
- Check whether any internal links, breadcrumbs, tests, or redirects reference the current top-level routes.

Acceptance:

- The implementation owner knows which files need route wrappers, redirects, navigation updates, and tests.
- No code has been moved yet.

### Phase 2: Add AI Parent Navigation

Tasks:

- Add `AI` as a top-level company workspace tab.
- Remove `Knowledge`, `Prompt`, `AI Rules`, `AI Models`, and `Chat Logs` from the top-level company workspace tab list.
- Set the `AI` top-tab active state for all AI child routes.
- Make the `AI` tab target the default AI page.

Acceptance:

- The top tab bar is shorter.
- `AI` is active for every AI child page.
- Clicking `AI` opens the default AI child page.

### Phase 3: Add AI Third-Level Submenu

Tasks:

- Reuse or extract the existing `Widget` submenu pattern.
- Add AI submenu items in the agreed order.
- Ensure the active submenu item follows the current route.
- Keep layout, spacing, and active states visually aligned with `Widget`.

Acceptance:

- `AI` and `Widget` use the same submenu behavior.
- There is no duplicate or inconsistent submenu styling.
- The AI submenu works at desktop and responsive widths.

### Phase 4: Move Routes With Compatibility Redirects

Tasks:

- Add new nested AI routes.
- Reuse the existing page components where possible.
- Add redirects from old routes to new routes.
- Update internal links and tests to prefer the new route shape.

Acceptance:

- New routes load the expected existing pages.
- Old routes redirect cleanly.
- Bookmarked old URLs still land on the correct content.

### Phase 5: Verify Access, UI State, And Regression Risk

Tasks:

- Confirm permissions for every AI child page.
- Confirm company scoping still applies in all queries and mutations.
- Confirm active states for top tab and submenu.
- Confirm the top tab bar no longer crowds at common desktop widths.
- Confirm the AI submenu does not overlap or wrap awkwardly.

Acceptance:

- Access behavior is unchanged.
- Visual state is correct.
- Navigation is easier to scan.
- No page content behavior changed.

## Suggested Verification

Before merging the implementation, run the project gates from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

If local browser verification is practical, manually check:

- direct navigation to every new AI route,
- direct navigation to every legacy route,
- active state on every AI child page,
- top tab bar spacing,
- third-level submenu alignment against the `Widget` section,
- role-specific access for company-scoped AI pages.

## Out Of Scope

Do not include these unless separately requested:

- Redesigning the AI pages.
- Renaming `Prompt` to `System Prompt`.
- Moving global platform AI pages.
- Changing the left sidebar `Artificial Intelligence` section.
- Changing company AI permissions.
- Changing chat log retention, filters, pagination, or data model.
- Refactoring the frozen movement demo areas.

## Open Product Decisions

These decisions should be confirmed before implementation:

1. Should `AI` default to `Knowledge`, or should it default to the most-used page?
2. Should `Chat Logs` remain last in the AI submenu, or should it sit nearer the start for support workflows?
3. Should any breadcrumb or page title copy explicitly say `AI`, for example `AI / Knowledge`, or should only navigation communicate the grouping?
4. Should the parent `AI` tab be hidden when a user has no accessible AI child pages, or shown disabled with no accessible pages? The recommended answer is hide it.

## Acceptance Criteria

The consolidation is complete when:

- The company workspace top tab bar shows `AI` instead of separate `Knowledge`, `Prompt`, `AI Rules`, `AI Models`, and `Chat Logs` tabs.
- The AI child pages appear in a third-level submenu matching the `Widget` pattern.
- `AI` remains active while any AI child page is active.
- Old routes redirect to the new nested routes.
- Existing page functionality is unchanged.
- Existing permissions and tenant isolation are unchanged.
- The tab bar is visibly shorter and easier to scan.
