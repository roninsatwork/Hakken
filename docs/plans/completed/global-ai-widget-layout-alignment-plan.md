> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Global AI Widget Layout Alignment Plan

Created: 2026-07-02

Status: Implemented on 2026-07-02 after the user explicitly asked to move from planning into coding.

This plan documents how to update the platform-level `Artificial Intelligence > Widget` screen so its widget configuration experience follows the same responsive layout and section-switching pattern as the company widget deployer.

Related plans:

- [Global AI Navigation Consolidation Plan](./global-ai-navigation-consolidation-plan.md)
- [Company Workspace AI Navigation Plan](./company-workspace-ai-navigation-plan.md)
- [Company AI Overview UX Plan](./company-ai-overview-ux-plan.md)

Index keywords: global AI widget, AI widget layout, widget section dropdown, company widget deployer, responsive admin layout, shared widget config components.

## Goal

The global AI widget page currently uses the older two-column configuration layout at laptop widths:

- a left vertical widget-section rail,
- a central form panel,
- a right live preview panel.

The company widget page was updated to behave better at the same viewport width:

- widget sections collapse into a dropdown selector below the wide breakpoint,
- the active form panel can use the available width,
- the preview panel no longer forces a cramped three-column layout at normal laptop widths.

The goal is to make the global AI widget page follow that same pattern while preserving global-widget behavior.

## Current Code

Company widget implementation:

- `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetConfigTabs.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetPanel.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetAppearanceSection.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetWelcomeSection.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetConversationStartersSection.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetGreetingSection.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetIntegrationSection.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetPreviewPanel.tsx`
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/widgetConfigUtils.ts`

Global widget implementation:

- `src/app/(dashboard)/admin/ai/widget/page.tsx`

The global page currently owns most of the UI inline: tab list, all form sections, domain parsing, snippet generation, and the live preview markup. The company page already extracted these into component files that are generic enough to be shared with the global page.

## Product Decision

Use the company widget deployer as the layout baseline for the global AI widget page.

At laptop and smaller desktop widths, the global widget should use the same dropdown section selector as the company widget. The active configuration panel should be allowed to fill the main content width.

At very wide widths, it is acceptable to show the vertical section rail and live preview beside the form, matching the company widget behavior.

## Proposed Implementation

### 1. Create Shared Widget Configuration Components

Move the company widget configuration components into a neutral shared location, for example:

```txt
src/app/(dashboard)/admin/_features/widget-config/
```

Recommended shared files:

```txt
WidgetAppearanceSection.tsx
WidgetConfigTabs.tsx
WidgetConversationStartersSection.tsx
WidgetEmptyState.tsx
WidgetGreetingSection.tsx
WidgetIntegrationSection.tsx
WidgetPanel.tsx
WidgetPreviewPanel.tsx
WidgetWelcomeSection.tsx
types.ts
widgetConfigUtils.ts
```

The shared components should remain presentation-focused. Page-specific data loading and save behavior should stay in the page routes.

### 2. Update Company Widget Imports

Update:

```txt
src/app/(dashboard)/admin/companies/[id]/widget/page.tsx
```

to import from the shared widget-config directory.

Preserve current company behavior:

- `companyId` is passed to `saveWidget`,
- `isGlobal` remains `false`,
- the action label remains `Publish Configuration`,
- existing company widget tests continue to pass.

### 3. Replace Global Widget Inline Layout

Refactor:

```txt
src/app/(dashboard)/admin/ai/widget/page.tsx
```

to use the same shared components:

- `WidgetConfigTabs`
- `WidgetAppearanceSection`
- `WidgetWelcomeSection`
- `WidgetConversationStartersSection`
- `WidgetGreetingSection`
- `WidgetIntegrationSection`
- `WidgetPreviewPanel`
- `WidgetEmptyState` if the copy can be parameterized, or a small global-specific empty state if not.

The main layout should match the company widget page:

```tsx
<div className="flex flex-col gap-6 items-start relative mt-4 2xl:flex-row 2xl:gap-8">
  <WidgetConfigTabs activeTab={activeTab} onTabChange={setActiveTab} />

  <div className="flex-1 w-full min-w-0 flex flex-col gap-8">
    {/* active section */}
  </div>

  {activeTab === "Appearance" && (
    <WidgetPreviewPanel ... />
  )}
</div>
```

This is the key layout change: avoid `lg:flex-row` for the section rail, form, and preview. Use the company widget's `2xl` breakpoint so normal laptop widths get a dropdown selector and a full-width form.

### 4. Preserve Global Widget Behavior

The global page should keep global-specific behavior:

- query: `api.widgets.getPrimaryGlobalWidget`
- mutation: `api.widgets.saveWidget`
- save args include `isGlobal: true`
- no `companyId` is passed
- action label remains `Save Configuration`
- page title remains `Global Widget Setup`
- `AiWorkspaceNav` remains in place
- empty-state copy remains global/platform-specific unless product chooses to standardize it

### 5. Reuse Shared Utilities

Replace local global page logic with shared helpers where possible:

- `parseAllowedDomains`
- `buildWidgetEmbedSnippet`
- `getWidgetLogoPreviewUrl`
- `canAddConversationStarter`

The global page currently duplicates this logic inline. Sharing it reduces drift between company and global widget configuration.

## Open Questions

Confirm these before implementation:

1. Should the global AI widget keep the live preview panel on the `Appearance` section, using the company widget's responsive placement, or should the global screen be form-only at laptop widths?
2. Should the global field label change from `Identify Label` to `Public Name` to match the company widget?
3. Should the global fallback color stay `#4f46e5`, or should it match the company/default widget fallback of `#000000`?
4. Should the global empty state continue saying `No Global Protocol Connected` and `Initialize Master Widget`, or should it use the company widget empty-state component with parameterized copy?

## Testing Plan

Add or update focused tests rather than relying only on visual inspection.

Recommended tests:

- Keep `src/app/(dashboard)/admin/companies/[id]/widget/page.test.tsx` passing after import changes.
- Add `src/app/(dashboard)/admin/ai/widget/page.test.tsx`.
- Verify global loading, empty, and populated states.
- Verify global save calls `saveWidget` with `isGlobal: true` and no `companyId`.
- Verify the integration snippet includes the global widget id.
- Verify section switching renders the shared sections.
- Keep `WidgetConfigSections.test.tsx` passing after moving shared component imports.

Manual QA:

- Open `/admin/ai/widget` at a laptop viewport similar to the screenshots.
- Confirm the widget section control is a dropdown, not a left rail.
- Confirm the active form panel uses the available width.
- Confirm the preview does not create a cramped two- or three-column layout at laptop widths.
- Confirm the preview still appears on wide desktop if retained.
- Confirm `/admin/companies/:id/widget` still matches the updated company widget behavior.

## Verification Gates

Before merge or push, run the repo gates from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For the implementation slice, also run the focused widget tests if available:

```bash
npm run test:run -- src/app/(dashboard)/admin/companies/[id]/widget/page.test.tsx
npm run test:run -- src/app/(dashboard)/admin/companies/[id]/widget/_components/WidgetConfigSections.test.tsx
npm run test:run -- src/app/(dashboard)/admin/ai/widget/page.test.tsx
```

Adjust the exact test command if the project's test runner does not accept direct file arguments in this form.

## Risks

- Importing shared components from the company route would create an awkward dependency direction. Prefer a neutral shared directory.
- Moving files may require updating mocks in existing tests.
- The global page may currently depend on slightly different labels and defaults; confirm product decisions before standardizing text.
- `WidgetConfigTabs` uses `window.matchMedia`, so tests may need a matchMedia mock if they render the real component.
- Image preview behavior differs for stored Convex storage ids versus blob/http URLs. Preserve the current helper behavior unless the widget backend is updated to return resolved URLs consistently.

## Suggested Implementation Slices

### Slice 1: Shared component extraction

- Move reusable widget config components to the shared directory.
- Update company widget imports and tests.
- No product behavior change expected.

### Slice 2: Global page refactor

- Replace global inline UI sections with shared components.
- Apply the company responsive layout pattern.
- Preserve global save/query behavior.
- Add focused global widget page tests.

### Slice 3: Visual QA and polish

- Run the local app and inspect both widget pages.
- Tune spacing only if the shared layout creates obvious issues.
- Avoid unrelated redesign or copy rewrites.

## Definition Of Done

The work is done when:

- global AI widget section navigation matches the company widget dropdown behavior at laptop widths,
- global AI widget forms use the available page width instead of being squeezed by the old two-column layout,
- company widget behavior remains unchanged,
- shared widget config components are in a neutral location,
- tests cover both company and global page behavior,
- local verification gates pass or any failures are documented with cause.

## Implementation Notes

Implemented on 2026-07-02:

- shared widget configuration components were added under `src/app/(dashboard)/admin/_features/widget-config/`,
- the company widget page now imports from the shared widget-config feature,
- the global AI widget page now uses the shared responsive widget layout and section components,
- a focused global widget page regression test was added,
- the global page preserves global save behavior with `isGlobal: true` and no `companyId`.
