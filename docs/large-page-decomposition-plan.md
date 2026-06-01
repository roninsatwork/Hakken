# Large Page Decomposition Plan

This plan follows the completed code-quality 95 plan. Its goal is to reduce page-level complexity outside the frozen movement demo while preserving the behavior already covered by lint, typecheck, unit tests, build, audit, Playwright smoke tests, and local smoke checks.

## Guardrails

- Do not modify the frozen movement demo unless the user explicitly asks:
  - `src/app/(dashboard)/demos/movements/**`
  - `src/app/(dashboard)/demos/movement-capture/page.tsx`
  - `convex/movements.ts`
- Keep behavior stable. This is decomposition and consistency work, not a product redesign.
- Prefer extracting presentational sections, hooks, and small pure helpers before changing data flow.
- Keep shared abstractions local to a feature first; promote to shared UI only after a second real use case.
- Preserve tenant isolation, auth checks, locale parity, 15-row admin pagination, no native browser dialogs, and stored model/provider configuration.
- Batch commits at phase boundaries after verification.

## Current Targets

The first target set is based on page size and local state/composition density:

- `src/app/(dashboard)/admin/settings/page.tsx`: about 1400 lines.
- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx`: about 638 lines.
- `src/app/(dashboard)/admin/companies/[id]/knowledge/page.tsx`: about 636 lines.
- `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx`: about 587 lines.
- `src/app/(dashboard)/app/assistant/page.tsx`: about 559 lines.
- `src/app/(dashboard)/admin/ai/costs/page.tsx`: about 505 lines.

## Phase 1: Shared Knowledge Manager

Status: Complete.

Target:

- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/knowledge/page.tsx`

Why:

- These pages have highly similar state, upload, manual text, website mapping, grouped website documents, and delete flows.
- This is the cleanest first extraction because one shared feature component can reduce duplication across two large pages.

Plan:

- Create a knowledge feature folder, for example `src/app/(dashboard)/admin/_features/knowledge`.
- Extract shared types for scope, tab state, document grouping, and modal state.
- Extract pure helpers for website grouping and file/website/text form state transitions.
- Extract a `KnowledgeManager` component that accepts a scope:
  - global scope: no `companyId`
  - company scope: required `companyId`
- Keep Convex calls in a small hook such as `useKnowledgeManagerData`.
- Keep page files thin: read route params where needed, pass scope/title copy, render the shared manager.
- Add or update tests for grouping helpers and key delete/upload state behavior.

Acceptance:

- Each knowledge page is materially smaller and mostly route/scope glue.
- Global and company knowledge behavior remains equivalent.
- Existing upload policy and knowledge tests still pass.
- E2E route coverage still passes for global knowledge.

Completed:

- Added `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx` as the shared scoped manager for global and company knowledge.
- Added `src/app/(dashboard)/admin/_features/knowledge/knowledgeManagerUtils.ts` and tests for website document grouping.
- Reduced `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx` from about 638 lines to 34 lines.
- Reduced `src/app/(dashboard)/admin/companies/[id]/knowledge/page.tsx` from about 636 lines to 30 lines.
- Updated the quality drift guard so confirmation-gated document deletes are checked in the shared knowledge manager.
- Verified with `npm run check`, `npm run lint:all`, `npm run build`, `npm run test:e2e`, `git diff --check`, and a `/login` smoke check.

## Phase 2: Settings Page Sections

Status: Complete.

Target:

- `src/app/(dashboard)/admin/settings/page.tsx`

Why:

- This is the largest page and mixes branding settings, PII config, audit log config/table, purge config, logo upload, modals, and tab routing.

Plan:

- Create a settings feature folder, for example `src/app/(dashboard)/admin/settings/_components` and `_hooks`.
- Extract tab configuration and URL tab parsing from the page.
- Extract section components:
  - branding/platform settings
  - logo upload controls
  - theme/color controls
  - PII configuration
  - audit log configuration and table
  - purge pipeline configuration
- Extract modal components for purge config, manual purge confirmation, cancel confirmation, and audit detail if present.
- Keep mutations and save orchestration in focused hooks:
  - `useSystemSettingsForm`
  - `usePiiSettingsForm`
  - `useAuditSettings`
  - `usePurgeSettings`
- Add tests around tab parsing, settings patch construction if needed, and table filtering/pagination if extracted.

Acceptance:

- The page becomes a composition shell rather than a 1000+ line implementation.
- Existing settings behavior remains unchanged.
- `npm run check` and `npm run build` pass.

Completed:

- Added a settings component folder at `src/app/(dashboard)/admin/settings/_components`.
- Extracted shared settings types, tab parsing, `SettingBlock`, and `ColorInput`.
- Extracted identity/platform settings into `IdentitySettingsSection`.
- Extracted typography, color, and brand controls into `AppearanceSettingsSection`.
- Extracted audit log display into `AuditLogsSection`.
- Extracted purge policy tables and purge modals into `PurgesSettingsSection`.
- Added tab parser regression tests in `settingsTabs.test.ts`.
- Reduced `src/app/(dashboard)/admin/settings/page.tsx` from about 1400 lines to 465 lines.
- Verified with `npm run check`, `npm run lint:all`, `npm run build`, `npm run test:e2e`, `git diff --check`, and a `/login` smoke check.

## Phase 3: Widget Configuration Surface

Status: Complete.

Target:

- `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx`
- potentially shared widget preview/embed helpers under `src/ui/components/widget` or a local admin widget feature folder.

Why:

- The widget page carries many independent settings fields, preview state, embed copy behavior, and simulator UI in one file.

Plan:

- Extract widget form state into a hook such as `useCompanyWidgetForm`.
- Extract components:
  - appearance settings
  - behavior settings
  - domain/embed settings
  - conversation starter editor
  - widget preview/simulator
  - save feedback
- Move embed snippet creation to a pure helper with tests.
- Keep company route/page responsibility limited to param parsing, data loading state, and rendering.

Acceptance:

- Widget settings behavior and preview remain unchanged.
- Embed snippet helper has regression tests.
- Page size and local state density drop significantly.

Completed:

- Added local widget configuration components under `src/app/(dashboard)/admin/companies/[id]/widget/_components`.
- Extracted tab navigation, empty state, appearance settings, welcome screen settings, conversation starter editor, greeting controls, integration/embed controls, and the live widget preview.
- Added pure widget config helpers for allowed domain parsing, embed snippet generation, logo preview URLs, and starter limits.
- Added regression tests in `widgetConfigUtils.test.ts`.
- Reduced `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx` from about 587 lines to 286 lines.
- Verified with `npm run check`, `npm run lint:all`, `npm run build`, `npm run test:e2e`, `git diff --check`, and a `/login` smoke check.

## Phase 4: Assistant Welcome Page

Status: Complete.

Target:

- `src/app/(dashboard)/app/assistant/page.tsx`

Why:

- The assistant page combines chat draft state, upload handling, model selection, thinking controls, drag/drop behavior, and first-message submission.

Plan:

- Extract hooks:
  - `useAssistantDraft`
  - `useAssistantUploads`
  - `useAssistantModelSelection`
  - `useAssistantThreadStart`
- Extract components:
  - assistant hero/greeting
  - model selector
  - thinking selector
  - pending file tray
  - upload dropzone behavior wrapper if needed
- Keep upload constraints wired to the centralized upload constants.
- Add focused tests for upload validation and first-message payload shaping where practical.

Acceptance:

- Page remains visually unchanged.
- Upload behavior and model selection still pass existing chat/upload tests.
- E2E user chat flow still passes or auth-skips as documented.

Completed:

- Added assistant welcome components under `src/app/(dashboard)/app/assistant/_components`.
- Extracted the hero, composer shell, upload status, pending file tray, model selector, thinking selector, and modal content.
- Added pure helpers for greeting buckets, transcript append behavior, upload error copy, and start eligibility.
- Added regression tests in `assistantWelcomeUtils.test.ts`.
- Reduced `src/app/(dashboard)/app/assistant/page.tsx` from about 559 lines to 279 lines.
- Verified with `npm run check`, `npm run lint:all`, `npm run build`, `npm run test:e2e`, `git diff --check`, and a `/login` smoke check.

## Phase 5: AI Costs Dashboard

Status: Complete.

Target:

- `src/app/(dashboard)/admin/ai/costs/page.tsx`

Why:

- This page is not as risky as the others, but it contains a dashboard worth making easier to scan and extend.

Plan:

- Extract timeframe controls and date range state into a hook.
- Extract metric cards, cost breakdown, model usage table/chart sections, and loading/empty states.
- Move formatting helpers into a local utility module with tests if they contain branching logic.
- Keep the route page as data query plus dashboard composition.

Acceptance:

- Dashboard output remains unchanged.
- Formatting helpers are easier to test.
- Browser route coverage for `/admin/ai/costs` remains green.

Completed:

- Added AI cost dashboard components under `src/app/(dashboard)/admin/ai/costs/_components`.
- Extracted the header/timeframe controls, metric grid, timeline chart, model/token distribution charts, and leaderboards.
- Added pure formatting helpers for GBP amounts, tiny-cost labels, chart ticks, and agent message counts.
- Added regression tests in `costFormatters.test.ts`.
- Reduced `src/app/(dashboard)/admin/ai/costs/page.tsx` from about 505 lines to 74 lines.
- Verified with `npm run check`, `npm run lint:all`, `npm run build`, `npm run test:e2e`, `git diff --check`, and a `/login` smoke check.

## Phase 6: Final Consistency Pass

Target:

- All decomposed pages plus adjacent files touched during the phases.

Plan:

- Run a page-size and drift scan for the target pages.
- Confirm no movement demo files changed.
- Confirm no native dialogs, locale drift, or 15-row admin pagination regressions.
- Run full verification:

```bash
npm run lint:all
npm run check
npm run build
npm audit --audit-level=high
npm run test:e2e
git diff --check
```

- Smoke test `/login` with `npm run dev` and `npm run convex:dev` running.
- Update this plan with completed phases and commits.

Acceptance:

- Target pages are substantially smaller and easier to modify.
- Shared feature components/hooks have focused tests where behavior moved.
- Full verification passes.
- The repo remains clean on `dev` after the final phase commit and push.
