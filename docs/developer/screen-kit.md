# Screen Kit Developer Guide

The screen kit provides the table, pagination, modal, detail-layout, settings-section, empty-state, save-feedback, rule-list, and schema-builder patterns used across Sonae. Use them before adding another page-specific table, modal, confirmation flow, or settings block.

**It serves both halves of the app.** The kit began inside the admin folder and moved to `src/ui/components/screens/` on 2026-08-16 so the screens under `/app` — the ones a client actually uses — can reach it too, and so a product cloned from this repo inherits a kit rather than rebuilding one. Nothing here is admin-only; a name carrying `Admin` means the part is genuinely specific to an administration surface. See [Every Screen Is Built From The Same Parts](../plans/active/shared-screen-kit-plan.md).

Read this before changing `src/ui/components/screens/**`, `src/hooks/useServerPagedTable.ts`, `src/ui/components/feedback/SonaeModal.tsx`, `src/ui/components/feedback/SonaeEmptyState.tsx`, `src/ui/components/settings/JsonSchemaBuilder.tsx`, or any page that repeats table/search/pagination/form patterns. For the route and role model around admin pages, see [Administration](./administration.md). For global styling guidance, see [Frontend](./frontend.md).

## Component Map

Core components live under `src/ui/components/screens/`:

- `src/ui/components/screens/Table.tsx`: search bar, table shell, header rows/cells, loading row, empty row, row action wrapper, icon action button, pagination footer, and load-more footer.
- `src/ui/components/screens/ConfirmationModal.tsx`: destructive confirmation wrapper around `SonaeModal`.
- `src/ui/components/screens/ModalForm.tsx`: modal form field, error, action, input, and textarea helpers.
- `src/ui/components/screens/DetailLayout.tsx`: detail-page header, actions, tabs, and content shell.
- `src/ui/components/screens/DetailTabs.tsx`: horizontal icon tabs with root-route and nested-route active behavior.
- `src/ui/components/screens/PageHeader.tsx`: list-page title/description/action header and primary action button.
- `src/ui/components/screens/Select.tsx`: styled select control.
- `src/ui/components/screens/SettingsCard.tsx`: settings card, field label, field hint, segmented choice, and setting switch.
- `src/ui/components/screens/AccessLevel.tsx`: the read/write context, `useCanWriteHere`, and the write-gated button. Table, page header, modal form and save controls all consult it, so a read-only viewer loses write affordances without each screen checking.
- `src/ui/components/screens/SaveControls.tsx`: save button, inline error, animated success/error feedback, and feedback pill.

Genuinely admin-specific parts stay under `src/app/(dashboard)/admin/_components/`:

- `AdminRulesTable.tsx`: shared AI rule table used by global and company rule screens.
- `AiRuleSafetyWarning.tsx`: prompt/rule safety warning classifier and panel.
- `AdminAvatarPicker.tsx`, `MemoryFields.tsx`, `EvidencePackPanel.tsx`, `PersonalDataPanel.tsx`, `GovernanceDashboard.tsx`, `CompanyMemoryEvidence.tsx`, `CompanySkillCheckboxPicker.tsx`.

Supporting shared UI:

- `src/ui/components/screens/pagination.ts`
- `src/hooks/useServerPagedTable.ts`: the house table footer over a Convex query that pages on the server.
- `src/ui/components/feedback/SonaeModal.tsx`
- `src/ui/components/feedback/SonaeEmptyState.tsx`
- `src/ui/components/settings/JsonSchemaBuilder.tsx`

Shared backend helpers for admin-style listing behavior live in `convex/adminQueryService.ts`. They are used by Convex modules such as `chatAdminService.ts`, `aiModels.ts`, `aiRules.ts`, and `agentLogs.ts` when data has to be collected or enriched before filtering and pagination.

## Tables And Search

**Use `DataTable` for a list screen.** It owns the whole arrangement — shell, header row and cells, loading row, empty row, search box and both footers — and a screen says only what is different about it: its columns, its rows, what its empty state says, and which footer it uses. The loose parts below are what `DataTable` is built from; reach for them only when building something that is not a list screen.

That distinction is not a style preference. Sixty-four screens each imported the loose parts and wired them together, and every fault found while reading thirty of them closely lived in the wiring rather than the parts: a footer that only appeared when there was more to load, a search box drawn inside a second border, a loading state written as a sentence where a row goes, an empty message conditioned so it never showed when the list was actually empty. None of it was visible in the code. The build now fails on a new screen that assembles its own — see below.

Use `TableShell` for admin tables. It supplies the bordered glass shell, horizontal overflow, and optional footer slot. The default minimum table width is `min-w-[1000px]`; pass `minWidthClassName` only when a table truly needs a different fixed scanning width.

Use:

- `SearchBar` for search inputs.
- `TableHeaderRow` and `TableHeaderCell` for headers.
- `TableLoadingRow` while Convex data is `undefined`.
- `TableEmptyRow` for empty table states.
- `RowActions` and `RowIconButton` for row hover actions.

`RowIconButton` stops propagation before calling its action, so it can sit inside clickable table rows without also triggering row navigation. It supports `tone="danger"` for destructive row actions.

When building new tables, prefer table semantics instead of div grids for dense admin records. Keep row actions labelled with `aria-label` or `title` and route destructive actions through confirmation modals.

## Pagination

`TABLE_PAGE_SIZE` is `15`. Administrative tables and feeds should use this default unless a specific product requirement says otherwise.

`paginateItems` safely clamps page values and returns:

- `items`
- `page`
- `pageSize`
- `totalItems`
- `totalPages`

`normalizeSearchTerm` trims and lowercases search input. `matchesSearchTerm` searches across nullable values and treats a blank search as a match.

Backend modules that cannot rely directly on a Convex search index should use `normalizeSearchTerm`, `includesSearchTerm`, and `paginateItems` from `convex/adminQueryService.ts` rather than reimplementing slightly different search or slicing behavior. These helpers do not replace indexed queries for large datasets; use them for bounded admin lists after the module has already enforced authorization and collected the intended candidate set.

Use `PaginationFooter` for offset-style pages. It clamps stale page values, shows `Showing start-end of total`, and disables previous/next controls at bounds or while loading.

Use `LoadMoreFooter` for Convex `usePaginatedQuery` flows. It displays visible row counts and a load-more action when more results can be fetched.

## Modals And Forms

Use `SonaeModal` for custom modal surfaces. It renders through a `document.body` portal, uses a black blurred backdrop, Framer Motion entrance/exit animation, and size classes:

- `sm`: `max-w-md`
- `md`: `max-w-xl`
- `lg`: `max-w-3xl`
- `xl`: `max-w-5xl`

Do not use native `alert`, `confirm`, or `prompt` dialogs in app UI. A current source scan found no app-source native dialog calls; the only `alert(` match is a string fixture in `src/lib/constants/uploads.test.ts`.

Use `ConfirmationModal` for destructive actions. It wraps `SonaeModal`, supports optional warning copy, shows `ModalFormError`, disables cancel/confirm buttons while submitting, and prevents close while submitting.

Use `ModalFormField`, `ModalFormError`, `ModalFormActions`, `modalInputClassName`, and `modalTextareaClassName` for form content inside modals. `ModalFormActions` keeps the submit button typed as `submit` and disables cancel/submit while saving.

## Detail Layouts And Subnavigation

Use `DetailLayout` for detail pages such as companies and agents. It provides:

- leading icon/avatar
- title and optional truncated description
- action slot
- tab row
- flexible content area
- overridable wrapper/header/content classes for dense detail views

Use `DetailTabs` for top-level detail tabs. The root tab is active only on the exact root href; nested tabs are active by path prefix.

Use `PageHeader` and `PagePrimaryAction` for list pages. `PagePrimaryAction` defaults to `type="button"` and should receive an icon when a clear command exists.

## Save And Feedback States

Use `SaveAction` for compact save buttons. It shows a save icon, disables while saving, and can show a short success label.

Use `SaveError` for inline save failures. It returns `null` with no children, so pages can render it unconditionally.

Use `SaveFeedback` for animated success/error banners with title and message. It is used by settings-like pages where the user needs confirmation that a configuration change was persisted.

Use `FeedbackPill` for smaller success or error messages. Success pills are rounded; error pills use a larger rounded rectangle and top-aligned icon.

## Empty States

Use `TableEmptyRow` inside tables and `SonaeEmptyState` for full-panel empty views. `SonaeEmptyState` accepts an optional Lucide icon, title, description, and action.

Empty states should explain the current result, not speculate. For example, distinguish:

- no records exist yet
- no records match the search
- the current user has no scoped access
- the query is still loading
- the backend returned an error

Keep empty-state copy localized when it is user-visible. Existing docs and tests note some older inline strings; reduce drift when touching those pages.

## Settings Sections

Settings pages use `SettingBlock` and `ColorInput` from `src/app/(dashboard)/admin/settings/_components/SettingBlock.tsx`. Shared settings form types live in `src/app/(dashboard)/admin/settings/_components/types.ts`.

`SettingBlock` provides a glass card, title, subtitle, and animated entrance. Use it for grouped settings sections on `/admin/settings`, not for normal page layout sections.

`ColorInput` renders a label, uppercase HEX display value, and hidden native color input backed by a visible swatch. It emits uppercase values through `onChange`.

The broader settings storage and runtime token behavior is documented in [System Settings And Branding](./system-settings-and-branding.md).

## Rule Tables And Safety Warnings

`AdminRulesTable` is the shared rule-list table for global and company AI rules. It uses `TableShell`, `TableLoadingRow`, `TableEmptyRow`, and `PaginationFooter`.

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

When adding a new screen, under `/admin` or `/app`:

1. Use `TABLE_PAGE_SIZE` for tables and feeds.
2. Use shared table components for searchable/paginated records.
3. Use `SonaeModal` or `ConfirmationModal` instead of native dialogs.
4. Surface backend errors with `SaveError`, `ModalFormError`, or `SaveFeedback`.
5. Keep row action buttons labelled and stop propagation when the row itself navigates.
6. Keep destructive actions confirmation-gated.
7. Keep English and Italian locale dictionaries in parity for user-visible strings.
8. Add or update component/page tests for loading, empty, error, save, confirmation, and pagination behavior.

Do not put UI cards inside other UI cards unless the component already owns that framing. Avoid page-specific table/modal variants unless the existing shared components cannot express the behavior.

## The Build Enforces Three Of These

`scripts/check-screen-kit.mjs` fails the build when a file under `src/app/(dashboard)` hand-writes a part the kit already owns. It runs in `npm run check:guards`, which is CI's first step, and has its own test in `scripts/check-screen-kit.test.mjs`.

Three rules:

- **A hand-written `<table>`.** Use `TableShell` with `TableHeaderRow`, `TableHeaderCell`, `TableLoadingRow` and `TableEmptyRow`. `TableShell` renders the `<table>` element itself — pass it a `<thead>`/`<tbody>`, never another `<table>`. Two governance screens did the latter and shipped a table nested inside an empty one; that defect is the reason this check exists.
- **A hand-written `<input>` that a person types into.** Use `Field`, or `TableSearchInput` for a table's search box, or `ModalFormField` inside a modal. `Field` ties the label to the input and will not let a caller skip it.
- **A table assembled from the loose parts instead of `DataTable`.** Added 2026-08-17, and it is the rule the other two kept missing: a screen can import every shared part, write no `<table>` and no `<input>`, pass both rules above, and still be one more assembly that drifts. Triggered by a `<thead>` or by importing `TableShell`, `TableHeaderRow`, `TableHeaderCell`, `TableLoadingRow`, `TableEmptyRow`, `PaginationFooter` or `LoadMoreFooter` in a file that does not render `DataTable`. `SearchBar` is deliberately excluded — a screen may legitimately put one above a set of cards. Sixty-one screens are frozen under `assembled`, to be worked down as each moves across.

A tick box, radio, file picker, colour swatch, slider or hidden input is not covered. The kit has no part for those, so flagging one would be a build failure with no correct fix.

`scripts/screen-kit-allowlist.json` freezes the screens that already hand-write one, separately per rule — a screen frozen for its table still fails on a hand-written field. **Each list may shrink, never grow.** Adding an entry is not the fix; moving the screen onto the kit is. When a frozen screen stops hand-writing its part, the check reports the entry as stale and fails until it is removed, so the list cannot quietly stay long.

The scan is brace- and quote-aware because an input's `type` often sits after an event handler, and reading the arrow in `onChange={(event) => …}` as the end of the tag would misread every tick box as a text field.

## Verification

Focused tests include:

- `src/ui/components/screens/Table.test.tsx`
- `src/ui/components/screens/ConfirmationModal.test.tsx`
- `src/ui/components/screens/ModalForm.test.tsx`
- `src/ui/components/screens/DetailLayout.test.tsx`
- `src/ui/components/screens/DetailTabs.test.tsx`
- `src/ui/components/screens/PageHeader.test.tsx`
- `src/app/(dashboard)/admin/_components/AdminRulesTable.test.tsx`
- `src/app/(dashboard)/admin/_components/AiRuleSafetyWarning.test.tsx`
- `src/ui/components/screens/SaveControls.test.tsx`
- `src/ui/components/screens/pagination.test.ts`
- `convex/adminQueryService.test.ts`
- `src/ui/components/feedback/SonaeModal.test.tsx`
- `src/ui/components/feedback/SonaeEmptyState.test.tsx`
- `src/ui/components/settings/JsonSchemaBuilder.test.tsx`
- `scripts/check-screen-kit.test.mjs`

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
