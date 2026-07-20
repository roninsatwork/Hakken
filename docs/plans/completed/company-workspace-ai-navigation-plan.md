> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Company Workspace Dropdown Navigation Plan

Created: 2026-07-02
Updated: 2026-07-02

This plan documents the agreed company workspace navigation change: use the same tab-row dropdown pattern now used by global AI `Governance` and `Models`, and remove the in-page third menus from company `Directory`, `AI`, and `Widget` pages.

Status: implemented on 2026-07-02. Keep this document as the product and regression-test reference for the company workspace dropdowns.

Related plans:

- [Global AI Navigation Consolidation Plan](./global-ai-navigation-consolidation-plan.md)
- [Global AI Models Split Navigation Plan](./global-ai-models-split-navigation-plan.md)
- [Global AI Widget Layout Alignment Plan](./global-ai-widget-layout-alignment-plan.md)

## Product Decision

Keep the company workspace tab row short:

```text
Dashboard | Overview | Directory | AI v | Widget
```

`Directory`, `AI`, and `Widget` should become dropdown triggers, not direct navigation links. Their menus should contain the sections that previously lived in page-level selectors.

Remove the current in-page `Directory Section`, `AI Section`, and `Widget Section` selectors after the tab-row dropdowns are available. The user should choose company workspace sections from one place, not from both the top workspace tabs and a third menu inside the page.

## Current Problem

Company Directory, AI, and Widget pages previously used two levels of local navigation:

- the company workspace tab row, which already includes `Directory`, `AI`, and `Widget`,
- the in-page compact selectors rendered by `CompanyDirectorySectionNav`, `CompanyAiSectionNav`, and `WidgetConfigTabs`.

Those nested selectors were useful while we were avoiding long tab rows, but the new dropdown pattern is clearer and keeps the page content full width. Keeping both patterns would make the company area feel heavier than the new global AI area.

## Target AI Dropdown

Recommended dropdown items:

| Label | Route |
| --- | --- |
| `Overview` | `/admin/companies/:companyId/ai` |
| `Knowledge` | `/admin/companies/:companyId/ai/knowledge` |
| `Memory` | `/admin/companies/:companyId/ai/memory` |
| `Skills` | `/admin/companies/:companyId/ai/skills` |
| `Prompt` | `/admin/companies/:companyId/ai/prompt` |
| `AI Rules` | `/admin/companies/:companyId/ai/rules` |
| `AI Models` | `/admin/companies/:companyId/ai/models` |
| `Evals` | `/admin/companies/:companyId/ai/evals` |
| `Chat Logs` | `/admin/companies/:companyId/ai/chat-logs` |

This matches the former `CompanyAiSectionNav` ordering so the implementation changed the navigation pattern without also changing information architecture.

## Target Directory Dropdown

Recommended dropdown items:

| Label | Route |
| --- | --- |
| `Directory` | `/admin/companies/:companyId/directory/users` |
| `Invites` | `/admin/companies/:companyId/directory/invites` |

## Target Widget Dropdown

Recommended dropdown items:

| Label | Route |
| --- | --- |
| `Appearance` | `/admin/companies/:companyId/widget` |
| `Welcome Screen` | `/admin/companies/:companyId/widget?section=welcome-screen` |
| `Conversation Starters` | `/admin/companies/:companyId/widget?section=conversation-starters` |
| `Greeting` | `/admin/companies/:companyId/widget?section=greeting` |
| `Integration` | `/admin/companies/:companyId/widget?section=integration` |

## Interaction Rules

`Directory`, `AI`, and `Widget` should behave like the global AI dropdowns:

- closed by default,
- opens from the main company workspace tab row,
- uses `aria-haspopup="menu"` and `aria-expanded`,
- closes when a menu item is selected,
- closes on outside pointer down,
- closes on `Escape`,
- shows the parent tab as active for every child route or selected widget section,
- shows exactly one active dropdown item with the checkmark,
- preserves full-width content below the tab row.

Route matching should be explicit enough that nested detail routes do not accidentally mark multiple items active.

## Implementation Plan

1. Audit current company workspace nav ownership.
   - `src/app/(dashboard)/admin/companies/[id]/layout.tsx` currently passes tabs into `AdminDetailLayout`.
   - `AdminDetailLayout` renders `AdminDetailTabs`, which currently supports simple link tabs only.

2. Add dropdown support to the company tab row.
   - Prefer a small shared extension of `AdminDetailTabs` if the pattern can stay clean.
   - Otherwise create a company-specific tab nav component in the company workspace area.
   - Reuse the visual behavior from `AiWorkspaceNav` so the company dropdown feels like global `Governance` and `Models`.

3. Move company child navigation into the top tab row.
   - Make `Directory`, `AI`, and `Widget` dropdown triggers in the company workspace tabs.
   - Populate them with the items listed above.
   - Keep the current route shape.
   - Use query-backed links for Widget sections.
   - Do not move page content or data logic.

4. Remove the third menus from company pages.
   - Remove `CompanyDirectorySectionNav` imports and render calls from directory pages.
   - Remove `CompanyAiSectionNav` imports and render calls from company AI pages.
   - Remove company page usage of `WidgetConfigTabs`.
   - Delete obsolete company-local selector components once there are no usages.
   - Keep page headings, forms, loading states, permissions, and Convex calls unchanged.

5. Preserve legacy top-level wrappers where they still exist.
   - Do not break existing direct URLs such as `/admin/companies/:companyId/rules`, `/system-prompt`, `/knowledge`, `/models`, or `/chat-logs`.
   - If those routes currently wrap or redirect to nested AI pages, keep that compatibility.

## Test Update Plan

Update tests to match the new style rather than the old in-page selector.

Required test changes:

- Add or update tests for the company workspace tab row to prove `AI` is a dropdown trigger.
- Add or update tests proving `Directory` and `Widget` are also dropdown triggers.
- Assert the dropdown is hidden by default.
- Assert opening `AI` renders all expected child menu items with the correct `href` values.
- Assert opening `Directory` and `Widget` renders the expected child menu items with the correct `href` values.
- Assert the parent `AI` tab is active on every company AI route.
- Assert the parent `Widget` tab is active for query-backed widget sections.
- Assert only the matching child route displays the checkmark.
- Assert selecting a menu item closes the dropdown.
- Assert outside pointer down and `Escape` close the dropdown.
- Replace `CompanyAiSectionNav.test.tsx` with tests for the new dropdown behavior, or delete it if the component is removed and coverage moves to the new nav tests.
- Update company page tests so they no longer expect page-level section selectors.
- Add regression assertions that company pages do not render the old third menus, for example no visible `AI Section`, `Directory Section`, or `Widget Section` compact selector.

Focused test files updated for this implementation:

- `src/app/(dashboard)/admin/companies/[id]/layout.tsx`
- `src/app/(dashboard)/admin/_components/AdminDetailTabs.tsx`
- `src/app/(dashboard)/admin/_components/AdminDetailTabs.test.tsx`
- `src/app/(dashboard)/admin/companies/[id]/layout.test.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/evals/page.test.tsx`
- `src/app/(dashboard)/admin/companies/[id]/chat-logs/page.test.tsx`
- `src/app/(dashboard)/admin/companies/[id]/users/page.test.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/page.test.tsx`

Expected focused verification:

```bash
npm run check -- src/app/(dashboard)/admin/_components/AdminDetailTabs.test.tsx src/app/(dashboard)/admin/companies/[id]/layout.test.tsx
npm run check -- src/app/(dashboard)/admin/companies/[id]/ai/evals/page.test.tsx
npm run check -- src/app/(dashboard)/admin/companies/[id]/chat-logs/page.test.tsx
npm run check -- src/app/(dashboard)/admin/companies/[id]/users/page.test.tsx src/app/(dashboard)/admin/companies/[id]/widget/page.test.tsx
```

If the test runner does not support file arguments for `npm run check`, run the full check instead.

## Manual QA Checklist

Check these routes in the browser:

- `/admin/companies/:companyId`
- `/admin/companies/:companyId/overview`
- `/admin/companies/:companyId/directory`
- `/admin/companies/:companyId/ai`
- `/admin/companies/:companyId/ai/knowledge`
- `/admin/companies/:companyId/ai/memory`
- `/admin/companies/:companyId/ai/skills`
- `/admin/companies/:companyId/ai/prompt`
- `/admin/companies/:companyId/ai/rules`
- `/admin/companies/:companyId/ai/models`
- `/admin/companies/:companyId/ai/evals`
- `/admin/companies/:companyId/ai/chat-logs`
- `/admin/companies/:companyId/widget`

At laptop width, confirm:

- the company tab row remains usable,
- the dropdowns render above page content, tables, search bars, and cards,
- the old in-page section selectors are gone,
- page content keeps the full available width,
- the active dropdown item is obvious.

## Out Of Scope

Do not include these unless separately requested:

- Redesigning company AI page content.
- Splitting company AI models into provider/catalogue/default screens.
- Changing global AI navigation.
- Changing Convex data models or permissions.
- Changing chat log retention, filters, pagination, or data loading.
- Refactoring the frozen movement demo areas.

## Verification Gates

Before merging or pushing an implementation, run the repo gates from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Acceptance Criteria

The implementation is complete when:

- the company workspace tab row shows `Dashboard`, `Overview`, `Directory`, `AI`, and `Widget`,
- `Directory`, `AI`, and `Widget` open dropdowns using the same visual and interaction pattern as global AI dropdowns,
- every company AI child page is reachable from that dropdown,
- every company Directory child page and Widget section is reachable from its dropdown,
- `AI` remains active on every company AI child route,
- `Widget` remains active for query-backed widget sections,
- only one dropdown child item is checked at a time,
- the old in-page third menus are removed,
- tests are updated to assert the new dropdown behavior and absence of the old third menu,
- existing page behavior, permissions, and company scoping remain unchanged.
