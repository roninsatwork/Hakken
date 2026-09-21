# Split quality-drift.test.ts by concern

## Context

`src/quality-drift.test.ts` is 1,462 lines and ~40 tests mixing roughly ten unrelated enforcement concerns: native-dialog bans, the 15-row pagination standard, Recharts container rules, UI/runtime contract consistency (including parsing budget arithmetic out of source), admin table primitives, the Ask-Hakken safety spine, prompt-injection warning panels, confirmation-gated deletes, analytics read bounds with an ~80-entry annotated broad-read allowlist, provider SDK/model-literal classification, and a client-import layering check that duplicates an ESLint rule. The sibling drift tests (`theme-drift`, `movement-boundary`, `no-client-specific-fallbacks`, `admin-i18n-adoption`) are already correctly split by concern. The monolith is getting hard to review and its shared helpers are tangled.

## Task

1. Read `src/quality-drift.test.ts` fully and map each describe-block to a concern.
2. Split into focused files following the existing naming, e.g.: `src/pagination-drift.test.ts`, `src/chart-drift.test.ts`, `src/ai-safety-drift.test.ts`, `src/analytics-read-drift.test.ts` (owns the broad-read allowlist), `src/provider-classification-drift.test.ts`, `src/ui-runtime-contract-drift.test.ts`. Group small related concerns rather than creating ten one-test files.
3. Extract shared source-scanning helpers (file walking, allowlist loading/stale-entry checking, string-literal lexing) into a single shared module (e.g. `src/test/driftUtils.ts`) instead of copying them into each file.
4. Move the broad-read allowlist data next to its new owning test, preserving every entry's category/phase/reason annotations.
5. Delete the client-import layering check only if you verify the ESLint `no-restricted-imports` rule in `eslint.config.mjs` covers exactly the same surface; otherwise keep it and note the difference. (Belt-and-braces was a deliberate choice — removing it needs proof, not preference.)
6. Delete the original file once every test is relocated; confirm zero tests were lost by comparing test counts before/after.

## Constraints

- Pure reorganization: no assertion weakened, no allowlist entry added, no threshold changed.
- Keep the self-guarding properties (stale-entry detection, vacuous-pass guards) intact in each split file.
- No code comments; do not commit or push.

## Acceptance

- `src/quality-drift.test.ts` no longer exists; total drift-test count is unchanged (report before/after numbers).
- `npm run test:run` and `npm run check` pass.
