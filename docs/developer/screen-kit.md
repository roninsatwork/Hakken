# Screen Kit Developer Guide

The screen kit provides the table, pagination, modal, detail-layout, settings-section, empty-state, save-feedback, rule-list, and schema-builder patterns used across Hakken. Use them before adding another page-specific table, modal, confirmation flow, or settings block.

**It serves both halves of the app.** The kit began inside the admin folder and moved to `src/ui/components/screens/` on 2026-08-16 so the screens under `/app` — the ones a client actually uses — can reach it too, and so a product cloned from this repo inherits a kit rather than rebuilding one. Nothing here is admin-only; a name carrying `Admin` means the part is genuinely specific to an administration surface. See [Every Screen Is Built From The Same Parts](../plans/completed/shared-screen-kit-plan.md).

Read this before changing `src/ui/components/screens/**`, `src/hooks/useServerPagedTable.ts`, `src/ui/components/feedback/HakkenModal.tsx`, `src/ui/components/feedback/HakkenEmptyState.tsx`, `src/ui/components/settings/JsonSchemaBuilder.tsx`, or any page that repeats table/search/pagination/form patterns. For the route and role model around admin pages, see [Administration](./administration.md). For global styling guidance, see [Frontend](./frontend.md).

## Where A Kit Component Lives

**One directory: `src/ui/components/screens/`.** Every part of the kit lives
there whether it is a primitive or a composite. There is no atoms tier.

There used to be. `src/ui/atoms/` held four modules — `Button`, `StatusPill`,
`typography`, `statusTone` — while the components that are primitives by any
reading (`Checkbox`, `Select`, `Field`, `CursorPagination`) sat in `screens/`
next to `DataTable` and `DetailLayout`. The split never reached the checks,
which read both folders as one namespace, so all it did was leave the next
person guessing: `Button` went one way and `Checkbox` the other, for no reason
either could state. That is the gap this kit exists to close, so on 2026-08-25
the four moved and the folder went.

A new part goes in `screens/` with its test beside it. Nothing else to decide.

## Component Map

Core components live under `src/ui/components/screens/`:

- `src/ui/components/screens/Table.tsx`: search bar, table shell, header rows/cells, loading row, empty row, row action wrapper, icon action button, pagination footer, and load-more footer.
- `src/ui/components/screens/ConfirmationModal.tsx`: destructive confirmation wrapper around `HakkenModal`.
- `src/ui/components/screens/CompactList.tsx`: compact table-semantic row lists that live inside a panel that already introduced itself.
- `src/ui/components/screens/ModalForm.tsx`: modal form field, error, action, input, and textarea helpers.
- `src/ui/components/screens/DetailLayout.tsx`: detail-page header, actions, tabs, and content shell.
- `src/ui/components/screens/DetailTabs.tsx`: horizontal icon tabs with root-route and nested-route active behavior.
- `src/ui/components/screens/PageHeader.tsx`: list-page title/description/action header and primary action button.
- `src/ui/components/screens/Select.tsx`: styled select control.
- `src/ui/components/screens/Field.tsx`: labelled field wrapper for typed form controls that must carry an accessible label.
- `src/ui/components/screens/Checkbox.tsx`: shared checkbox/tick-box control, including hidden-label table-cell use.
- `src/ui/components/screens/Leaderboard.tsx`: ranked or unranked compact lists for repeated "who used the most" panels.
- `src/ui/components/screens/SettingsCard.tsx`: settings card, field label, field hint, segmented choice, setting switch, and setting row (label and explanation on the left, any control on the right — the agent Settings page is built from it).
- `src/ui/components/screens/AccessLevel.tsx`: the read/write context, `useCanWriteHere`, and the write-gated button. Table, page header, modal form and save controls all consult it, so a read-only viewer loses write affordances without each screen checking.
- `src/ui/components/screens/SaveControls.tsx`: save button, inline error, animated success/error feedback, and feedback pill.
- `src/ui/components/screens/TableControls.tsx`: table-search controls used where a page needs the kit's input styling without a full `DataTable`.
- `src/ui/components/screens/CursorPagination.tsx`: cursor-based pagination helper for lists that page by cursor rather than count.

Genuinely admin-specific parts stay under `src/app/(dashboard)/admin/_components/`:

- `AdminRulesTable.tsx`: shared AI rule table used by global and company rule screens.
- `AiRuleSafetyWarning.tsx`: prompt/rule safety warning classifier and panel.
- `AdminAvatarPicker.tsx`, `MemoryFields.tsx`, `EvidencePackPanel.tsx`, `PersonalDataPanel.tsx`, `GovernanceDashboard.tsx`, `CompanyMemoryEvidence.tsx`, `CompanySkillCheckboxPicker.tsx`.

Supporting shared UI:

- `src/ui/components/screens/pagination.ts`
- `src/hooks/useServerPagedTable.ts`: the house table footer over a Convex query that pages on the server.
- `src/ui/components/feedback/HakkenModal.tsx`
- `src/ui/components/feedback/HakkenEmptyState.tsx`
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

Use `CursorFooter` or the `CursorPagination` helper for lists that can step
forward and backward but cannot cheaply count total rows. Do not fake a total
page count for cursor data.

## Modals And Forms

Use `HakkenModal` for custom modal surfaces. It renders through a `document.body` portal, uses a black blurred backdrop, Framer Motion entrance/exit animation, and size classes:

- `sm`: `max-w-md`
- `md`: `max-w-xl`
- `lg`: `max-w-3xl`
- `xl`: `max-w-5xl`

Do not use native `alert`, `confirm`, or `prompt` dialogs in app UI. A current source scan found no app-source native dialog calls; the only `alert(` match is a string fixture in `src/lib/constants/uploads.test.ts`.

Use `ConfirmationModal` for destructive actions. It wraps `HakkenModal`, supports optional warning copy, shows `ModalFormError`, disables cancel/confirm buttons while submitting, and prevents close while submitting.

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

Use `TableEmptyRow` inside tables and `HakkenEmptyState` for full-panel empty views. `HakkenEmptyState` accepts an optional Lucide icon, title, description, and action.

Empty states should explain the current result, not speculate. For example, distinguish:

- no records exist yet
- no records match the search
- the current user has no scoped access
- the query is still loading
- the backend returned an error

Keep empty-state copy localized when it is user-visible. Existing docs and tests note some older inline strings; reduce drift when touching those pages.

## Compact Lists And Leaderboards

Use `CompactList` for a short run of rows inside a larger panel: run history,
tool breakdowns, nested line items, widget settings rows, and similar embedded
records. It owns the row rhythm, divider, optional heading row, loading line,
and real table semantics without forcing a full `DataTable` card inside another
panel.

Use `Leaderboard` when the embedded rows have the repeated ranked-list shape:
rank, optional avatar, name/subtitle, and one or more right-aligned measures. It
is built on `CompactList` so repeated AI cost, company usage, provider
breakdown, and settings panels do not each invent avatar fallback, headings,
empty copy, or divider styling.

Do not use `CompactList` as a shortcut for a screen's primary records. If the
screen is the list, use `DataTable` with `PageHeader` or the correct detail
header above it.

## Settings Sections

Settings pages use `SettingBlock` and `ColorInput` from `src/app/(dashboard)/admin/settings/_components/SettingBlock.tsx`. Shared settings form types live in `src/app/(dashboard)/admin/settings/_components/types.ts`.

`SettingBlock` provides a glass card, title, subtitle, and animated entrance. Use it for grouped settings sections on `/admin/settings`, not for normal page layout sections.

`ColorInput` renders a label, uppercase HEX display value, and hidden native color input backed by a visible swatch. It emits uppercase values through `onChange`.

A settings screen that is a **list** of on/off switches is a list screen, not a form: `PageHeader`, then `DataTable` with `Checkbox` in a "Switched on" column, as System Security, Developer Options and Self-Improvement do since 2026-08-23. `SettingSwitch` is for a single setting inside a form. Neither is a hand-drawn toggle glyph, and the build enforces that.

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

1. Build a list screen in the order set out in [Anatomy Of A List Screen](#anatomy-of-a-list-screen) — header, explanation, search, table, footer, save. The build enforces the header; the rest is the standard the reference screens follow.
2. Use `TABLE_PAGE_SIZE` for tables and feeds.
3. Use shared table components for searchable/paginated records.
4. Use `HakkenModal` or `ConfirmationModal` instead of native dialogs.
5. Surface backend errors with `SaveError`, `ModalFormError`, or `SaveFeedback`.
6. Keep row action buttons labelled and stop propagation when the row itself navigates.
7. Keep destructive actions confirmation-gated.
8. Keep English and Italian locale dictionaries in parity for user-visible strings.
9. Add or update component/page tests for loading, empty, error, save, confirmation, and pagination behavior.

Do not put UI cards inside other UI cards unless the component already owns that framing. Avoid page-specific table/modal variants unless the existing shared components cannot express the behavior.

## Headers

Every screen wears one of three headers. Which one is decided by what the page *is*, not by how it looks — settled on 2026-08-22, when the admin section had two headers pretending to be one: the rule under the title appeared on the AI pages and Connections and nowhere else, the main action was white on some pages and orange on others, and forty-three screens drew the title block by hand, each copy having drifted a token at a time.

**A top-level page** — one that opens from the sidebar. `PageHeader` with `divider`, and at most one brand-orange action.

```tsx
<PageHeader
  divider
  icon={<CreditCard className="w-6 h-6 text-brand" />}
  title={t("title")}
  description={t("subtitle")}
  action={<WriteButton …>{t("newPlan")}</WriteButton>}
/>
```

Orange means *this page's action*, and nothing else. Filters, pickers, secondary buttons and anything that only narrows what is on screen stay quiet grey. A page with two orange buttons has no primary action.

**A tabbed section** — companies, agents, System Settings. `DetailLayout`, which draws title, rule, then the tab strip itself. Do not draw the rule separately; the whole company section lost its line once because one element's classes went missing, and moving the rule inside `DetailLayout` is what gave three drifted AI screens theirs back in a single edit.

**A page inside such a section** — a tab's own content. Its own `PageHeader`, with **no** `divider`: the section's `DetailLayout` has already drawn the rule, and a second one reads as two headers stacked. The company Dashboard, Calls and Features tabs are the examples to copy. A tab whose content is a list needs this — the anatomy rule below requires a header above any `DataTable`.

**A record-level page** — one that opens on top of a record: a rule editor, a script, a schedule, a document. `DetailHeader`. It draws a quiet back row on its own line, *then* the standard title block, so the title starts at the left edge exactly like every other page. Status pills go under the description via `pills`, never woven into the title row.

```tsx
<DetailHeader
  back={{ label: t("backToScripts"), href: "/admin/settings/scripts" }}
  icon={<FileCode className="w-6 h-6 text-brand" />}
  title={script.name}
  description={script.summary}
  pills={<><StatusPill …/><StatusPill …/></>}
/>
```

**Two things the build refuses**, because a screen missing its line still looks like a screen and no check the repo had could see it:

- A hand-written `<h1>` in a screen. All three components own the title recipe; a fourth copy drifts. Frozen per file and may only fall.
- `border-b border-border-dim pb-6` written by hand. That is the header components' own line — pass `divider`, or use `DetailHeader`/`DetailLayout`. Ordinary borders are untouched, so a card or a table row costs nothing.

The write gate sits on the action, not the header: `PagePrimaryAction` calls `useCanWriteHere` and removes itself for a read-only viewer rather than greying out, because a greyed-out button invites the reader to work out why it will not press. It is the shared primary action, though most screens still use `WriteButton` with their own classes — match the screen you are in rather than converting it in passing. Each header component has tests asserting its own anatomy: the rule is drawn when asked, pills sit under the description, the back row precedes the title, and `DetailLayout` rules off above its tabs.

## Anatomy Of A List Screen

A list screen is assembled in one order, and the order is the standard:

1. **Title and description** — `PageHeader`, or `DetailHeader` for a page that opens on top of a record, or `DetailLayout` for a section whose tabs live in a layout.
2. **An explanation box**, when the screen needs one — the bordered `Info` note used by Plans and Scripts.
3. **The search box** — passed to `DataTable` as `search`, which draws it above the table with the house spacing.
4. **The table** — `DataTable`.
5. **The footer** — `DataTable`'s `footer`, which is part of the same card.
6. **Save controls**, when the screen saves — `SaveAction` and `SaveError`, below the table.

The wrapper is `flex flex-col gap-5`, or `flex w-full flex-col gap-6 pb-12` for a tab inside a section. Reference screens: Subscription Plans (`src/app/(dashboard)/admin/settings/plans/page.tsx`) and Manage Companies (`src/app/(dashboard)/admin/companies/page.tsx`).

**`cardHeader` is not where a screen's title goes.** It names a table that sits inside a page which already has its own header — a usage log on a person's record, say. `TableShell` renders whatever it is given without padding, so a title placed there sits flush against the card edge while the columns stay indented, and the screen reads as broken. The build enforces this: see the anatomy rule below.

This order was a habit copied between screens and written down nowhere until 2026-08-22, when the workspace Features screen was rebuilt onto `DataTable`, drew nothing by hand, passed every check of the day, and still came out wrong — its title inside the table rather than above the search box. Anthony: *"why are you guessing when we have standards and rules — that's the gap we need to close."* This section and the anatomy rule are that gap closed.

## What The Build Enforces

`scripts/check-screen-kit.mjs` fails the build when a file under `src/app/(dashboard)` hand-writes a part the kit already owns, or assembles a list screen in the wrong order. It runs in `npm run check:guards`, which is CI's first step, and has its own test in `scripts/check-screen-kit.test.mjs`.

Eleven rules. Most ask whether a part was drawn by hand; three count parts that cannot reach zero in one sitting; one asks whether the screen is *assembled* right, which is a different question and the one the others kept missing; and one asks whether two screens copied *each other*, which every other rule answers no to by construction.

- **A hand-written `<table>`.** Use `TableShell` with `TableHeaderRow`, `TableHeaderCell`, `TableLoadingRow` and `TableEmptyRow`. `TableShell` renders the `<table>` element itself — pass it a `<thead>`/`<tbody>`, never another `<table>`. Two governance screens did the latter and shipped a table nested inside an empty one; that defect is the reason this check exists.
- **A hand-written `<input>` that a person types into.** Use `Field`, or `TableSearchInput` for a table's search box, or `ModalFormField` inside a modal. `Field` ties the label to the input and will not let a caller skip it.
- **A table assembled from the loose parts instead of `DataTable`.** Added 2026-08-17. A screen can import every shared part, write no `<table>` and no `<input>`, pass both rules above, and still be one more assembly that drifts. Triggered by a `<thead>` or by importing `TableShell`, `TableHeaderRow`, `TableHeaderCell`, `TableLoadingRow` or `TableEmptyRow` in a file that does not render `DataTable`. `SearchBar`, `PaginationFooter` and `LoadMoreFooter` are deliberately excluded — a screen may legitimately page a list of cards.
- **A hand-written tick box.** Added 2026-08-22. Use `Checkbox` (`src/ui/components/screens/Checkbox.tsx`), with `labelHidden` for a box in a table cell whose row already names it. This rule was deliberately absent until the part existed: flagging a tick box with no shared tick box to move onto would have been a build failure with no correct fix.
- **An on/off switch drawn from `ToggleLeft`/`ToggleRight` glyphs.** Added 2026-08-23. There are two right answers. A **list** of things that are on or off is a table: use `DataTable` with `Checkbox` in the last column, as System Security and Self-Improvement do. A **single setting inside a form** is not a list, and a one-row table would be its own kind of wrong: use `SettingSwitch` (`src/ui/components/screens/SettingsCard.tsx`) inside a `SettingsCard`, as the agent settings and API Keys screens do. Either way a glyph pair is a switch redrawn by eye, and it states itself in colour alone — unreadable to anyone who cannot separate the two colours it picked. Four files frozen: the retention modal's status switch, which is one control in a dialog, and the three schedule screens.
- **A component declared under a name the kit already exports.** Added 2026-08-23, and the first rule about two screens copying *each other* rather than either copying the kit — which is exactly why nothing caught it for months. API Keys and the connector detail screen each held a private `SettingSwitch`, identical to the kit's character for character except that one used `py-3` where the others used `py-4`. The agent observability screen declared its own `StatusPill`, which was not a copy but something different wearing a familiar name. The kit's exported names are read from `src/ui/components/screens/` and `src/ui/components/screens/` at check time, so adding a component protects its name the same day. If yours genuinely is different, name it for what it adds — `RunStatusPill` — and render the kit's part inside it. **This list starts empty.**
- **A divided list drawn by hand.** Added 2026-08-23. `last:border-0` or `last:border-b-0` on a mapped row is a screen announcing that it draws its own list — "except the last one" is only something you say about a repetition, and both `CompactList` and `DataTable` own their dividers. Use `CompactList` (`src/ui/components/screens/CompactList.tsx`) for a run of rows inside a panel that has already introduced itself — a run history, a list of changes, a page's backlinks — or `DataTable` for a screen's own records. Twelve files carried it when the sweep began; six are frozen, and the six that came off became one shared `Leaderboard` and three `CompactList`s.
- **More raw `<button>`s than a file's frozen count.** Added 2026-08-19. Use `Button` (`src/ui/components/screens/Button.tsx`). Counted per file rather than listed, because a file with eleven raw buttons cannot be asked to reach zero in one sitting — only never to reach twelve. Reads all of `src/app` and `src/ui`, except the movement demos and `Button` itself.
- **More hand-written page headings than a file's frozen count.** Use `PageHeader`, `DetailHeader` or `DetailLayout`, which own the title recipe.
- **The header's underline drawn by hand.** `border-b border-border-dim pb-6` is the header components' own line. Pass `divider` to `PageHeader`, or use `DetailHeader`/`DetailLayout`.
- **A table on a page with no header above it.** Added 2026-08-22, and the first rule about a screen's shape rather than its parts. A file rendering `DataTable` must render `PageHeader`, `DetailHeader` or `DetailLayout` earlier in the file. 46 of the 55 screens rendering `DataTable` already did; the nine frozen are sub-tables whose header lives in the parent page.

A radio, file picker, colour swatch, slider or hidden input is not covered. The kit has no part for those, so flagging one would be a build failure with no correct fix.

`scripts/screen-kit-allowlist.json` freezes the screens that already hand-write one, separately per rule — a screen frozen for its table still fails on a hand-written field. **Each list may shrink, never grow.** Adding an entry is not the fix; moving the screen onto the kit is. When a frozen screen stops hand-writing its part, the check reports the entry as stale and fails until it is removed, so the list cannot quietly stay long.

The scan is brace- and quote-aware because an input's `type` often sits after an event handler, and reading the arrow in `onChange={(event) => …}` as the end of the tag would misread every tick box as a text field.

## Verification

Focused tests include:

- `src/ui/components/screens/Table.test.tsx`
- `src/ui/components/screens/DataTable.test.tsx`
- `src/ui/components/screens/CompactList.test.tsx`
- `src/ui/components/screens/Leaderboard.test.tsx`
- `src/ui/components/screens/Checkbox.test.tsx`
- `src/ui/components/screens/Field.test.tsx`
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
- `src/ui/components/feedback/HakkenModal.test.tsx`
- `src/ui/components/feedback/HakkenEmptyState.test.tsx`
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
