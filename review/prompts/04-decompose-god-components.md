# Decompose the active god-components

## Context

The codebase has 36 files over 500 lines. The frozen movement-demo pages are excluded by owner decision, but four **active** modules are past maintainable size:

- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx` — 1,453 lines, largest active component, also an error-handling hotspot.
- `convex/agentRuntime.ts` — 2,803 lines.
- `src/ui/components/workflows/ConfigDrawer.tsx` — 1,124 lines.
- `src/ui/components/layout/SidebarNavigation.tsx` — 944 lines.

## Task

Decompose these one at a time, behavior-preserving, each as its own reviewable unit of work. Suggested order: `KnowledgeManager` → `ConfigDrawer` → `SidebarNavigation` → `agentRuntime` (the riskiest, do last).

For each:
1. Read the file and its tests fully before touching anything. `convex/agentRuntime.ts` has a 3,465-line behavioral test suite (`convex/agentRuntime.test.ts`) — it is your safety net; run it before and after.
2. Extract along existing seams: for the React components, split per tab/section/modal into sibling files under the same `_features`/component directory, lifting shared state no higher than necessary; for `agentRuntime.ts`, extract pure logic into `agentRuntimeService.ts`-style service modules (the repo's established pattern: services are pure, unit-testable, register no Convex functions).
3. Follow the screen-kit conventions (`docs/developer/frontend.md`, `docs/developer/screen-kit.md`) in extracted UI; do not introduce raw buttons/headings that would require growing `scripts/screen-kit-allowlist.json` — allowlists are shrink-only.
4. Keep public exports stable: `convex/agentRuntime.ts` function names are API surface referenced via `_generated/api`; do not rename or move registered functions.
5. Target: no extracted file over ~500 lines; the original files reduced to composition/orchestration.

## Constraints

- Pure refactor: no behavior, copy, or styling changes.
- Watch the layering rules: browser code must not import Convex function-defining modules (ESLint enforces this); new backend files follow `foo.ts`/`fooService.ts` naming.
- No code comments; do not commit or push. Complete and verify one module before starting the next.

## Acceptance

- Each target file substantially reduced; extracted units under ~500 lines.
- `npm run check` passes after each decomposition, including `check:guards` (screen-kit, layering) and the full agentRuntime test suite for the backend one.
