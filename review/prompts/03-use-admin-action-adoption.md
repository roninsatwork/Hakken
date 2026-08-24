# Finish useAdminAction adoption on the frontend

## Context

The house pattern for mutation handling is `src/hooks/useAdminAction.ts` (busy-ref against double-submit, toast via the custom `showToast` API, `reportError` telemetry, user-facing message via `src/lib/errors.ts` `toUserFacingMessage`). Its docstring says it replaced 48 hand-written sites, but adoption stalled: only ~22 files use it, ~22 pages still hand-roll `setError`/`setErrorMessage` with local try/catch, and 145 `console.error` calls remain in `src/` (hotspot: `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx` with 10).

## Task

Migrate the remaining hand-rolled mutation-error sites to `useAdminAction`.

1. Read `src/hooks/useAdminAction.ts`, its test `src/hooks/useAdminAction.test.tsx`, and `src/lib/errors.ts` to understand the contract.
2. Enumerate targets: grep `src/app` for `setError(`, `setErrorMessage(`, and try/catch blocks around `useMutation`/`useAction` calls; also list `console.error` sites in components.
3. Migrate page by page. Preserve intentional UX differences (inline field-level errors that are genuinely part of a form's validation UX may stay local; the hook is for action-level failure surfacing).
4. Replace component-level `console.error` in migrated paths with the hook's `reportError` funnel; delete ones that become redundant.
5. Where a page has an existing `*.test.tsx`, keep it green; add an error-path assertion where the migration changes observable behavior.

## Constraints

- Do not migrate the frozen movement demo pages (`src/app/(dashboard)/demos/**`).
- Match existing kit-era page structure; no new patterns.
- No code comments; do not commit or push.

## Acceptance

- No page under `src/app/(dashboard)` (demos excluded) hand-rolls try/catch + local error state for admin/app mutations where `useAdminAction` fits.
- `console.error` count in `src/app` drops substantially (report before/after counts).
- `npm run check` passes.
