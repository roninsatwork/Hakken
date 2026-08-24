# Replace the .take(10000) analytics idiom with real pagination or rollups

## Context

51 occurrences of `.take(10000)` exist across `convex/analytics.ts` (lines ~83, 94, 164, 175, 237), `analyticsSnapshots.ts`, `systemHealth.ts`, `inventoryRollups.ts`, `companies.ts`, `users.ts`, `workflows.ts`, `properties.ts`, `knowledge.ts`, `arcade.ts`, and `swarmRuntime.ts`. These are bounded in name only: once a table passes 10k matching rows the results silently truncate (wrong analytics numbers, no error) and every call reads up to 10k documents of bandwidth. Related: `convex/moneyView.ts:102` does `.take(5000)` then in-memory `.filter(` on `wikiAnswerTallies`, and the core chat paths (`getMessages`, `sendMessage`, `getThreads` in `convex/chat.ts`) sit in the broad-read allowlist of `src/quality-drift.test.ts` (lines ~158-165) at "Phase 3".

## Task

1. Enumerate all `.take(10000)` / large-`.take` sites and classify each:
   - **Aggregation over a growing table** (counts, sums, rollup builders): convert to a cursor-paginated internal action/scheduled job that walks the table in pages and writes a maintained rollup row, or incrementally maintain the aggregate at write time. The repo already has rollup patterns (`inventoryRollups`, `analyticsSnapshots`, `governanceEstateRollups`) — follow them.
   - **Bounded-by-domain reads** (tables that provably stay small, e.g. per-company config): keep, but reduce the take to a realistic bound and note the entry in the quality-drift broad-read allowlist with an updated reason.
2. Fix `moneyView.ts:102` by adding an index on the filtered field and using `withIndex` instead of in-memory filter.
3. For each converted site, update the corresponding entry in the `src/quality-drift.test.ts` broad-read allowlist (entries are annotated with category/phase/reason; the register should shrink).
4. Check `scripts/check-convex-pagination.mjs` — if it guards any of the touched exports, keep its assertions satisfied.

## Constraints

- Do not change what the analytics screens display; numbers must be equal (or newly correct where truncation was already lying — call those out explicitly in your summary).
- Expensive walks belong in internal actions/scheduled jobs, never in client-facing queries (`docs/developer/backend.md`).
- No code comments; do not commit or push.

## Acceptance

- `.take(10000)` count driven to zero or to a small set of justified, allowlisted, realistically-bounded reads.
- The quality-drift broad-read allowlist shrinks and stays consistent.
- `npm run check` passes, including `check:pagination`.
