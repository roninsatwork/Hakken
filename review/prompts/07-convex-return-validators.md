# Add return validators to high-traffic public Convex functions

## Context

Only 8 `returns:` validators exist across 494 non-generated Convex files. Public functions therefore return unshaped documents: `convex/chat.ts:77 getMessages`, for example, returns whole message docs, so any field later added to the schema (or any internal bookkeeping field) leaks to clients — including widget/public surfaces — automatically. The guarded builders in `convex/tenantFunctions.ts` (`moduleQuery`/`moduleMutation` and friends) already support passing validators through.

## Task

1. Read `convex/tenantFunctions.ts` to confirm how `returns:` flows through each builder; extend builders that don't yet accept it.
2. Prioritize by exposure, in this order:
   - `publicQuery`/`publicMutation`/`publicAction` surfaces (~41 declarations — these serve unauthenticated or widget contexts; enumerate via the `reason:` requirement).
   - Chat/thread/message functions in `convex/chat.ts` (hottest product path).
   - Tenant-facing list queries backing major screens (users, knowledge, agents, workflows).
3. For each, define an explicit `v.object(...)` return shape of what the UI actually consumes (check the calling components), and shape the returned docs to it — this is also the moment to stop returning fields the client never uses.
4. Where several functions share a shape, define the validator once per feature module and reuse it.
5. Admin/superAdmin internal surfaces are lower priority; stop when the public and chat surfaces are covered rather than mechanically doing all 494 files.

## Constraints

- Shaping must not break existing consumers: check each frontend call site (via `_generated/api` usages) before trimming fields; when in doubt, keep the field in the validator.
- No `as any` bridges; the repo has zero and must stay there.
- No code comments; do not commit or push.

## Acceptance

- Every `public*` function and every `convex/chat.ts` client-facing function has an explicit `returns:` validator.
- `npm run check` passes (typecheck will catch consumer drift; the convex test suite exercises the shaped returns).
- Summary lists any fields deliberately trimmed from responses.
