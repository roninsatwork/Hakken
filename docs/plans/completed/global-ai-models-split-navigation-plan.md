> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Global AI Models Split Navigation Plan

Created: 2026-07-02

Status: Implemented on 2026-07-02 after the user explicitly asked to move from planning into coding.

This plan documents how to split the platform-level `Artificial Intelligence > Models` experience into three clearer screens and expose them through one compact dropdown in the global AI workspace navigation.

Related plans:

- [Global AI Navigation Consolidation Plan](./global-ai-navigation-consolidation-plan.md)
- [Global AI Widget Layout Alignment Plan](./global-ai-widget-layout-alignment-plan.md)
- [Model Provider Agnostic Plan](./model-provider-agnostic-plan.md)

Index keywords: global AI models, AI providers, model catalogue, platform defaults, model routing, AI workspace dropdown, providers screen, model defaults.

## Goal

The current global AI models page is doing too many jobs at once:

1. provider management,
2. model catalogue management,
3. platform default model routing.

This is workable with only a few providers, but it will not scale when Hakken supports more AI providers. The page should become three focused screens behind one `Models` dropdown in the global AI workspace navigation.

The dropdown should follow the same interaction pattern now used for:

- the `Governance` dropdown in the global AI workspace nav,
- the widget section dropdown used by company/global widget configuration.

## Current Code

Primary page:

- `src/app/(dashboard)/admin/ai/models/page.tsx`

The page currently owns:

- provider cards with sync, test, enable, and disable controls,
- a `Model Catalogue` tab with filters and model table,
- a `Platform Defaults` tab with per-use-case default selectors.

Navigation component:

- `src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav.tsx`

Related Convex APIs:

- `api.aiModels.getProviders`
- `api.aiModels.setProviderEnabled`
- `api.aiModels.getOffsetPaginatedModels`
- `api.aiModels.getModels`
- `api.aiModels.getGlobalModelDefaults`
- `api.aiModels.setGlobalModelDefault`
- `api.aiModels.clearGlobalModelDefault`
- `api.aiModelsActions.syncGoogleModels`
- `api.aiModelsActions.syncOpenAIModels`
- `api.aiModelsActions.syncAnthropicModels`
- `api.aiModelsActions.testProviderConnection`

## Product Decision

Use one top-level AI workspace item:

```text
Models
```

When opened, it should reveal:

```text
Providers
Model Catalogue
Defaults
```

Each option should be a separate route and screen.

Recommended route shape:

```txt
/admin/ai/models/providers
/admin/ai/models/catalogue
/admin/ai/models/defaults
```

The existing `/admin/ai/models` route should redirect or render the default child screen. Recommended default:

```txt
/admin/ai/models/catalogue
```

Reason: most existing links to `Models` probably expect the model list, and the catalogue is the closest continuation of the current page.

## Screen Responsibilities

### Providers

Purpose:

- answer which model providers are connected,
- show provider health,
- let admins sync provider model lists,
- enable or disable providers.

Controls:

- provider status,
- auth mode,
- last health check,
- last sync,
- health message,
- `Sync`,
- `Test`,
- `Enable` or `Disable`.

Future provider growth:

- add provider,
- configure provider credentials,
- OAuth or API-key setup,
- provider-specific region/account details,
- provider model sync history.

This screen should not show the full model table.

### Model Catalogue

Purpose:

- answer which individual models are available to the platform,
- classify models by provider, capability, and use case,
- enable or disable specific models.

Controls:

- search,
- provider filter,
- capability filter,
- use-case filter,
- active/inactive filter,
- model table,
- model detail route links,
- `Make Default` only if product still wants a quick shortcut.

The catalogue should not show provider cards at the top. Provider status belongs on `Providers`.

### Defaults

Purpose:

- answer which model Hakken should use for each runtime job,
- make default model routing understandable.

Controls:

- one row per runtime use case,
- current default model,
- compatible model selector,
- configured/unset status,
- clear default.

Use cases currently include:

- chat,
- agent,
- workflow,
- report,
- router,
- title,
- embedding,
- transcription,
- vision,
- tool-calling.

This is routing policy, not catalogue management, so it deserves its own screen.

## Navigation Pattern

Update `AiWorkspaceNav` so `Models` behaves like `Governance`:

- one visible `Models` trigger in the AI workspace nav,
- dropdown menu with `Providers`, `Model Catalogue`, and `Defaults`,
- active highlight on `Models` when any child route is active,
- checkmark/highlight on the active child item,
- click outside closes the menu,
- Escape closes the menu.

Recommended ordering in the global AI nav:

```text
Running Costs | Chat Logs | Governance | Widget | Models
```

When the user opens `Models`, the dropdown shows:

```text
Providers
Model Catalogue
Defaults
```

## Implementation Plan

### 1. Extract Shared Models Page Pieces

Move reusable UI and helper logic out of `src/app/(dashboard)/admin/ai/models/page.tsx`.

Recommended directory:

```txt
src/app/(dashboard)/admin/ai/models/_components/
```

Candidate files:

```txt
ModelTagList.tsx
modelFormatters.ts
ModelProviderCards.tsx
ModelCatalogueTable.tsx
ModelCatalogueFilters.tsx
ModelDefaultsTable.tsx
types.ts
```

Keep data mutations close to the screen unless the component boundary becomes cleaner with callback props.

### 2. Create Providers Screen

Create:

```txt
src/app/(dashboard)/admin/ai/models/providers/page.tsx
```

Move provider cards and provider actions here:

- `syncProvider`
- `testProvider`
- `toggleProvider`
- provider health/date formatting.

Keep `AiWorkspaceNav` at the top.

### 3. Create Model Catalogue Screen

Create:

```txt
src/app/(dashboard)/admin/ai/models/catalogue/page.tsx
```

Move the current model search/filter/table experience here:

- model pagination,
- active/inactive filter,
- provider/capability/use-case filters,
- model rows,
- model detail navigation,
- model enable/disable,
- platform default shortcut if retained.

### 4. Create Defaults Screen

Create:

```txt
src/app/(dashboard)/admin/ai/models/defaults/page.tsx
```

Move the current `Platform Defaults` tab content here:

- `getGlobalModelDefaults`,
- compatible model options,
- set/clear platform defaults,
- saving state per use case.

### 5. Update `/admin/ai/models`

Choose one:

- redirect `/admin/ai/models` to `/admin/ai/models/catalogue`, or
- render the catalogue page directly.

Recommendation: redirect to `/admin/ai/models/catalogue` so active state and URLs stay explicit.

### 6. Update AI Workspace Navigation

Update:

```txt
src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav.tsx
```

Add a `Models` dropdown matching the `Governance` dropdown implementation and style.

Menu items:

```txt
Providers -> /admin/ai/models/providers
Model Catalogue -> /admin/ai/models/catalogue
Defaults -> /admin/ai/models/defaults
```

Legacy active route handling:

- `/admin/ai/models` should count as active for `Models`,
- `/admin/ai/models/:id` detail routes should count as active for `Model Catalogue`,
- any future provider detail routes should count as active for `Providers`.

## Open Questions

Confirm before implementation:

1. Should `/admin/ai/models` redirect to `Model Catalogue`, or should it become a lightweight overview for models?
2. Should `Make Default` remain as a quick action in `Model Catalogue`, or should all default setting happen only on `Defaults`?
3. Should provider setup include an `Add provider` action in this slice, or should this split only reorganize current provider controls?
4. Should the dropdown label be `Models`, or should it become `Model Setup` to better cover providers and defaults?

Recommended answers:

1. Redirect to `Model Catalogue` for now.
2. Keep `Make Default` initially as a shortcut, but treat `Defaults` as the canonical place for routing policy.
3. Do not add provider setup in this slice; split the UX first.
4. Use `Models` because it matches the sidebar/product language.

## Testing Plan

Add or update focused tests:

- `AiWorkspaceNav.test.tsx` should cover the `Models` dropdown.
- `models/providers/page.test.tsx` should cover provider cards and provider actions.
- `models/catalogue/page.test.tsx` should cover model filters and table behavior.
- `models/defaults/page.test.tsx` should cover defaults rows and set/clear mutations.
- Existing `models/page.test.tsx` should be removed or changed to cover redirect/default behavior.

Suggested assertions:

- `Models` appears as one visible nav item.
- `Providers`, `Model Catalogue`, and `Defaults` are hidden until dropdown open.
- each dropdown item links to the correct route.
- legacy `/admin/ai/models` and model detail routes still mark `Models` active.
- provider controls no longer render on the catalogue screen.
- defaults controls no longer render on the catalogue screen.

## Verification Gates

Before merge or push, run:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Focused commands for the implementation slice:

```bash
npm run test:run -- src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav.test.tsx
npm run test:run -- src/app/(dashboard)/admin/ai/models/page.test.tsx
npm run test:run -- src/app/(dashboard)/admin/ai/models/providers/page.test.tsx
npm run test:run -- src/app/(dashboard)/admin/ai/models/catalogue/page.test.tsx
npm run test:run -- src/app/(dashboard)/admin/ai/models/defaults/page.test.tsx
```

Adjust exact file paths if implementation names differ.

## Risks

- Route links from app-kit setup and company setup may still point to `/admin/ai/models`; keep that route working.
- Detail routes under `/admin/ai/models/[id]` should remain valid.
- Splitting data queries may accidentally duplicate provider/model fetches; keep each screen scoped to the data it needs.
- Tests may need updates because the current single page test expects both catalogue and defaults tabs in one render.
- The global AI nav already has a `Governance` dropdown; avoid duplicating dropdown logic too much if a small shared nav dropdown component naturally emerges.

## Definition Of Done

The work is done when:

- the global AI nav shows one `Models` dropdown,
- the dropdown contains `Providers`, `Model Catalogue`, and `Defaults`,
- provider management is on its own screen,
- model catalogue management is on its own screen,
- platform defaults are on their own screen,
- `/admin/ai/models` remains a safe entry point,
- existing model detail routes still work,
- tests cover the split screens and nav dropdown,
- local verification gates pass.

## Implementation Notes

Implemented on 2026-07-02:

- `Models` in the global AI workspace nav now opens a dropdown with `Providers`, `Model Catalogue`, and `Defaults`.
- `/admin/ai/models` redirects to `/admin/ai/models/catalogue`.
- `/admin/ai/models/providers` owns provider health, sync, test, enable, and disable controls.
- `/admin/ai/models/catalogue` owns search, filters, pagination, model table, model status, and model detail navigation.
- `/admin/ai/models/defaults` owns platform default model routing by use case.
- Shared model admin helpers were added under `src/app/(dashboard)/admin/ai/models/_components/`.
- Focused tests were added for the dropdown and each split route.
