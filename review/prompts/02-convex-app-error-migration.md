# Finish the Convex appError migration

## Context

The backend's structured-error pattern is `convex/utils/appError.ts` — a `ConvexError` wrapper with a stable error-code union, consumed on the frontend by `src/lib/errors.ts` (`toUserFacingMessage`). It has 354 call sites, but **477 plain `throw new Error(` remain** in `convex/` (plus 54 raw `ConvexError`). In production Convex, plain throws redact to the generic "Server Error" envelope, so users see nothing actionable and the frontend unwrapping logic is bypassed. A shrink-only conversion test already tracks the count (see the tracking note in `convex/utils/appError.ts` and the related drift test).

## Task

Convert the remaining plain `throw new Error(` sites in `convex/` (non-test files) to `appError(...)` with an appropriate code, in batches by feature family.

1. Read `convex/utils/appError.ts` fully: the code union, the helper signature, and the tracking/conversion notes.
2. Enumerate: `grep -rn "throw new Error(" convex --include='*.ts' | grep -v '.test.ts' | grep -v _generated`.
3. Work in batches (one feature prefix at a time: `agent*`, `wiki*`, `workflow*`, `knowledge*`, …). For each site pick the right existing code; only extend the code union when no existing code fits, and keep new codes generic (e.g. `VALIDATION`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`), not per-callsite.
4. Genuinely internal invariant violations (unreachable states inside internal actions/services that no client can trigger) may stay plain `Error` — but confirm the caller chain is internal before leaving one, and prefer converting when in doubt.
5. Update the shrink-only counter/allowlist in the tracking test downward as each batch lands.
6. After each batch: `npm run test:run -- <affected test files>`, and a full `npm run check` at the end.

## Constraints

- Do not change error message copy semantics that tests assert on without updating those tests deliberately.
- Do not add code comments explaining the conversion.
- Do not commit or push; leave the working tree for review.

## Acceptance

- Plain `throw new Error(` count in non-test `convex/` code is driven to (or near) zero, with any survivors being verified internal-only invariants.
- The shrink-only tracking test reflects the new lower count and still fails on regression.
- `npm run check` passes.
