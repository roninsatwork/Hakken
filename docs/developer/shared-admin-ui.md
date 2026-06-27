# Shared Admin UI Developer Guide

Shared admin UI components provide the table, pagination, modal, detail-layout, settings-section, empty-state, save-feedback, rule-list, and schema-builder patterns used across Sonae administration. Use them before adding another page-specific table, modal, confirmation flow, or settings block.

Read this before changing `src/app/(dashboard)/admin/_components/**`, `src/app/(dashboard)/admin/_lib/pagination.ts`, `src/ui/components/feedback/SonaeModal.tsx`, `src/ui/components/feedback/SonaeEmptyState.tsx`, `src/ui/components/settings/JsonSchemaBuilder.tsx`, or admin pages that repeat table/search/pagination/form patterns. For the route and role model around admin pages, see [Administration](./administration.md). For global styling guidance, see [Frontend](./frontend.md).

## Component Map

Core admin components live under `src/app/(dashboard)/admin/_components/`:

- `AdminTable.tsx`: search bar, table shell, header rows/cells, loading row, empty row, row action wrapper, icon action button, pagination footer, and load-more footer.
- `AdminConfirmationModal.tsx`: destructive confirmation wrapper around `SonaeModal`.
- `AdminModalForm.tsx`: modal form field, error, action, input, and textarea helpers.
- `AdminDetailLayout.tsx`: detail-page header, actions, tabs, and content shell.
- `AdminDetailTabs.tsx`: horizontal icon tabs with root-route and nested-route active behavior.
- `AdminPageHeader.tsx`: list-page title/description/action header and primary action button.
- `AdminRouteSubmenu.tsx`: sticky left submenu for nested route groups.
- `AdminRulesTable.tsx`: shared AI rule table used by global and company rule screens.
- `AiRuleSafetyWarning.tsx`: prompt/rule safety warning classifier and panel.
- `AdminSaveControls.tsx`: save button, inline error, animated success/error feedback, and feedback pill.

Supporting shared UI lives outside the admin folder:

- `src/app/(dashboard)/admin/_lib/pagination.ts`
- `src/ui/components/feedback/SonaeModal.tsx`
- `src/ui/components/feedback/SonaeEmptyState.tsx`
- `src/ui/components/settings/JsonSchemaBuilder.tsx`

## Tables And Search

Use `AdminTableShell` for admin tables. It supplies the bordered glass shell, horizontal overflow, and optional footer slot. The default minimum table width is `min-w-[1000px]`; pass `minWidthClassName` only when a table truly needs a different fixed scanning width.

Use:

- `AdminSearchBar` for search inputs.
- `AdminTableHeaderRow` and `AdminTableHeaderCell` for headers.
- `AdminTableLoadingRow` while Convex data is `undefined`.
- `AdminTableEmptyRow` for empty table states.
- `AdminRowActions` and `AdminRowIconButton` for row hover actions.

`AdminRowIconButton` stops propagation before calling its action, so it can sit inside clickable table rows without also triggering row navigation. It supports `tone="danger"` for destructive row actions.

When building new tables, prefer table semantics instead of div grids for dense admin records. Keep row actions labelled with `aria-label` or `title` and route destructive actions through confirmation modals.

## Pagination

`ADMIN_PAGE_SIZE` is `15`. Administrative tables and feeds should use this default unless a specific product requirement says otherwise.

`paginateAdminItems` safely clamps page values and returns:

- `items`
- `page`
- `pageSize`
- `totalItems`
- `totalPages`

`normalizeAdminSearchTerm` trims and lowercases search input. `matchesAdminSearchTerm` searches across nullable values and treats a blank search as a match.

Use `AdminPaginationFooter` for offset-style pages. It clamps stale page values, shows `Showing start-end of total`, and disables previous/next controls at bounds or while loading.

Use `AdminLoadMoreFooter` for Convex `usePaginatedQuery` flows. It displays visible row counts and a load-more action when more results can be fetched.

## Modals And Forms

Use `SonaeModal` for custom modal surfaces. It renders through a `document.body` portal, uses a black blurred backdrop, Framer Motion entrance/exit animation, and size classes:

- `sm`: `max-w-md`
- `md`: `max-w-xl`
- `lg`: `max-w-3xl`
- `xl`: `max-w-5xl`

Do not use native `alert`, `confirm`, or `prompt` dialogs in app UI. A current source scan found no app-source native dialog calls; the only `alert(` match is a string fixture in `src/lib/constants/uploads.test.ts`.

Use `AdminConfirmationModal` for destructive actions. It wraps `SonaeModal`, supports optional warning copy, shows `AdminModalFormError`, disables cancel/confirm buttons while submitting, and prevents close while submitting.

Use `AdminModalFormField`, `AdminModalFormError`, `AdminModalFormActions`, `adminModalInputClassName`, and `adminModalTextareaClassName` for form content inside modals. `AdminModalFormActions` keeps the submit button typed as `submit` and disables cancel/submit while saving.

## Detail Layouts And Subnavigation

Use `AdminDetailLayout` for detail pages such as companies and agents. It provides:

- leading icon/avatar
- title and optional truncated description
- action slot
- tab row
- flexible content area
- overridable wrapper/header/content classes for dense detail views

Use `AdminDetailTabs` for top-level detail tabs. The root tab is active only on the exact root href; nested tabs are active by path prefix.

Use `AdminRouteSubmenu` for nested sections inside a detail page, such as company AI sections or directory sections. It marks exact routes and nested child routes active by prefix and provides a sticky glass submenu on wide screens.

Use `AdminPageHeader` and `AdminPagePrimaryAction` for list pages. `AdminPagePrimaryAction` defaults to `type="button"` and should receive an icon when a clear command exists.

## Save And Feedback States

Use `AdminSaveAction` for compact save buttons. It shows a save icon, disables while saving, and can show a short success label.

Use `AdminSaveError` for inline save failures. It returns `null` with no children, so pages can render it unconditionally.

Use `AdminSaveFeedback` for animated success/error banners with title and message. It is used by settings-like pages where the user needs confirmation that a configuration change was persisted.

Use `AdminFeedbackPill` for smaller success or error messages. Success pills are rounded; error pills use a larger rounded rectangle and top-aligned icon.

## Empty States

Use `AdminTableEmptyRow` inside tables and `SonaeEmptyState` for full-panel empty views. `SonaeEmptyState` accepts an optional Lucide icon, title, description, and action.

Empty states should explain the current result, not speculate. For example, distinguish:

- no records exist yet
- no records match the search
- the current user has no scoped access
- the query is still loading
- the backend returned an error

Keep empty-state copy localized when it is user-visible. Existing docs and tests note some older inline strings; reduce drift when touching those pages.

## Settings Sections

Settings pages use `SettingBlock` and `ColorInput` from `src/app/(dashboard)/admin/settings/_components/SettingBlock.tsx`.

`SettingBlock` provides a glass card, title, subtitle, and animated entrance. Use it for grouped settings sections on `/admin/settings`, not for normal page layout sections.

`ColorInput` renders a label, uppercase HEX display value, and hidden native color input backed by a visible swatch. It emits uppercase values through `onChange`.

White-label settings sections have their own components and are documented in [White-Label Packaging Data Builders](./white-label-packaging-data-builders.md). The broader settings storage and runtime token behavior is documented in [System Settings And Branding](./system-settings-and-branding.md).

## Rule Tables And Safety Warnings

`AdminRulesTable` is the shared rule-list table for global and company AI rules. It uses `AdminTableShell`, `AdminTableLoadingRow`, `AdminTableEmptyRow`, and `AdminPaginationFooter`.

Rows are clickable and navigate with `router.push`. Toggle, edit, and delete controls stop propagation so action clicks do not trigger row navigation. Priority values map to visual tones for `CRITICAL`, `HIGH`, `NORMAL`, and fallback priorities.

`AiRuleSafetyWarningPanel` detects risky rule or prompt text before saving. It checks for:

- hidden instruction disclosure
- permission or role-check bypass
- cross-tenant data access

The panel is advisory UI. Backend authorization and tenant isolation must still enforce the real boundary.

## JSON Schema Builder

`JsonSchemaBuilder` builds simple object schemas for agent/tool configuration screens. It supports property nodes with:

- key name
- type: `STRING`, `NUMBER`, or `BOOLEAN`
- description
- required flag

It parses an initial schema only when the JSON has `type: "OBJECT"` and a `properties` object. Invalid JSON is ignored after logging an error, and the UI falls back to its empty state.

When all properties are removed or blank, it emits an empty string. When properties exist, it emits pretty-printed JSON with `type: "OBJECT"`, `properties`, and `required` only when required keys exist. Key names are sanitized by replacing non-alphanumeric/underscore characters with underscores.

## Extension Rules

When adding a new admin page:

1. Use `ADMIN_PAGE_SIZE` for tables and feeds.
2. Use shared table components for searchable/paginated records.
3. Use `SonaeModal` or `AdminConfirmationModal` instead of native dialogs.
4. Surface backend errors with `AdminSaveError`, `AdminModalFormError`, or `AdminSaveFeedback`.
5. Keep row action buttons labelled and stop propagation when the row itself navigates.
6. Keep destructive actions confirmation-gated.
7. Keep English and Italian locale dictionaries in parity for user-visible strings.
8. Add or update component/page tests for loading, empty, error, save, confirmation, and pagination behavior.

Do not put UI cards inside other UI cards unless the component already owns that framing. Avoid page-specific table/modal variants unless the existing shared components cannot express the behavior.

## Verification

Focused tests include:

- `src/app/(dashboard)/admin/_components/AdminTable.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminConfirmationModal.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminModalForm.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminDetailLayout.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminDetailTabs.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminPageHeader.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminRouteSubmenu.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminRulesTable.test.tsx`
- `src/app/(dashboard)/admin/_components/AiRuleSafetyWarning.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminSaveControls.test.tsx`
- `src/app/(dashboard)/admin/_lib/pagination.test.ts`
- `src/ui/components/feedback/SonaeModal.test.tsx`
- `src/ui/components/feedback/SonaeEmptyState.test.tsx`
- `src/ui/components/settings/JsonSchemaBuilder.test.tsx`

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
