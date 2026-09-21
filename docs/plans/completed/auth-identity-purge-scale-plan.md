# Auth Identity Purge Scale Plan

Last reviewed: 2026-07-31
Status: Done, same day it was written. All ten reads cleared at source — the
allowlist in `src/quality-drift.test.ts` was not touched, and no entry was
added for any of them. Suite green: 452 files, 3,654 tests.
Owner: Anthony

## What Was Done

Both groups were fixed rather than classified, in the order set out below.

- **Group A** — `purgeAuthIdentity` now drains through a shared `drainRows`
  helper: read a bounded batch, delete it, repeat until nothing matches. The
  helper carries the reasoning, including why a bare `.take(n)` cap is the
  wrong repair on a deletion path.
- **Group B** — `purgeOrphanedAuthIdentities` now sweeps one page of one table
  per run and schedules the next, carrying a cursor and a running tally. It
  ends by logging the total.
- **Tests** — four added to `convex/users.test.ts` (38 → 42): deletion drains
  past a single batch; the sweep steps past a full page of healthy rows to
  reach an orphan behind them; it carries on through every table rather than
  stopping at the first; and it leaves healthy identities and `PENDING`
  invitations alone.
- **Verified on the deployment, not just in tests.** `convex-test` does not
  enforce the one-paginate-per-function rule, so the sweep was pushed to
  `dev:silent-axolotl-121` and run with
  `npx convex run users:purgeOrphanedAuthIdentities '{}'`. The
  `[Auth purge] Orphaned identity sweep finished.` line appears in the
  deployment logs, and it is only reachable after the scheduled chain has
  walked all three tables. No paginate error.

The original analysis follows, as the record of why it was done this way.

## Why This Existed

`src/quality-drift.test.ts` → *"platform broad reads stay classified by
scale-hardening phase"* was failing, and it was the only red test in the suite —
3,649 others passed. CI on `dev` was red for this and nothing else.

The guardrail scans `convex/` for `.collect()` and `.take(10000)` on a
`ctx.db.query(...)`, and demands each one is either removed, bounded, or
classified with a category, a phase and a reason. Ten unclassified reads turned
up, all in `convex/users.ts`, all from the user-deletion cascade added on
2026-07-31.

The guardrail does **not** understand indexes. It matches on `.collect()`
textually, so an index-scoped read of one user's three sessions is reported
identically to a scan of every row in the table. That is why the ten split into
two groups that deserve opposite treatment, and why "just allowlist them" is
the wrong answer for half of them.

## The Two Groups

### Group A — `purgeAuthIdentity`, five reads (lines 57–90)

Every one is scoped by an index to a single user: `authSessions` by `userId`,
`authRefreshTokens` by `sessionId`, `authAccounts` by `userIdAndProvider`,
`authVerificationCodes` by `accountId`, `invitations` by `by_email`.

These are bounded in reality — one person has a handful of sessions, one
account has a handful of unredeemed magic links. The guardrail is a blunt
instrument here and is, strictly speaking, wrong.

**But do not simply cap them with `.take(n)`.** This function exists to make
sure a deleted address can be re-added, and the bug it was written to fix was
exactly *an auth row left behind*. A bare `.take(200)` reintroduces that bug
for any user who happens to exceed the cap: 201 sessions, and one survives
deletion, and the address is quietly unusable again — the original symptom,
now rarer and harder to find.

**Do this instead — batch until empty.** Each pass deletes what it read, so the
loop drains and terminates:

```ts
const SESSION_BATCH = 200;

for (;;) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .take(SESSION_BATCH);
  if (sessions.length === 0) break;
  for (const session of sessions) {
    // …refresh tokens, then the session itself
  }
}
```

Correct for any number of rows, bounded per read, and the guardrail is
satisfied because it only objects to `.collect()` and `.take(10000)`.

Apply the same shape to all five. The two nested reads
(`authRefreshTokens` by `sessionId`, `authVerificationCodes` by `accountId`)
sit inside loops that already delete their parent, so they drain the same way.

### Group B — `purgeOrphanedAuthIdentities`, five reads (lines 991–1018)

Three of these are genuine whole-table scans with no index at all:

```ts
const accounts = await ctx.db.query("authAccounts").collect();
const sessions = await ctx.db.query("authSessions").collect();
const invitations = await ctx.db.query("invitations").collect();
```

The guardrail is right about these. Finding orphans means inspecting every row,
so the scan is not a mistake in itself — the mistake is doing it unbounded, in
one transaction, in a function that will be run again every time a user
document is removed outside `deleteUser`.

**The existing pattern in this repo is `convex/purges.ts`**: take a batch,
delete it, set `hasMore = batch.length === BATCH`, and reschedule via
`ctx.scheduler.runAfter(0, internal.purges.executePurgeRecursive, { … })` —
see `executePurgeRecursive` around lines 205–240 and 340–350.

**Copying it verbatim will hang.** `purges.ts` deletes *everything* it reads,
so taking from the start each time makes progress. This sweep deletes only the
orphans and deliberately skips the healthy rows — so taking from the start
would re-read the same healthy rows for ever and never advance.

It therefore needs a **cursor**, not a repeated take-from-the-start:

- Accept `cursor: v.optional(v.string())` and a `removed` tally as arguments.
- Read one page with `.paginate({ numItems: 200, cursor: cursor ?? null })`.
- Delete the orphans in that page.
- If `!isDone`, `ctx.scheduler.runAfter(0, …)` with `continueCursor` and the
  running tally; otherwise return the tally.

**One `.paginate()` per function, and this is not negotiable.** Convex permits
exactly one paginated query per function call and throws *"This query or
mutation function ran multiple paginated queries"* on the second. This was hit
for real on 2026-07-31 in optional module (not included in this copy), where a loop that paginated
until a page filled passed all sixteen `convex-test` tests and failed the
moment it reached a deployment — **`convex-test` does not enforce the rule.**

So the three tables cannot be swept in one invocation. Either give the function
a `table` argument and chain the three sweeps one after another, or split it
into three internal mutations and have a small orchestrator schedule them in
sequence. The `table`-argument shape matches `executePurgeRecursive` and is
probably the smaller change.

The two nested reads in this function (`authVerificationCodes`,
`authRefreshTokens`) are Group A in character — index-scoped to one parent —
and want the same batch-until-empty treatment.

## Why Not Just Allowlist All Ten

It would take five minutes and turn CI green, and for **Group A** it is
defensible — those reads really are bounded, and an entry saying so is honest.

For **Group B** it is not. Writing "known and accepted" against three unbounded
table scans switches off the light without fixing the wiring, and this is a
function that runs on a schedule against tables that grow with every sign-in.
The guardrail exists precisely to stop that being decided by whoever is in a
hurry.

If CI must be green before the work is done, allowlist **Group A only** and
leave Group B red, so the remaining failure names the real problem.

## Order Of Work

1. Group A — batch-until-empty in `purgeAuthIdentity`. Self-contained, no
   signature changes, no scheduling. Removes five of the ten.
2. Group B — the nested index-scoped pair, same treatment. Removes two more.
3. Group B — the three table scans: cursor, tally, reschedule, one table per
   invocation. Removes the last three.
4. Delete any Group A allowlist entries added as a stopgap in step 0.

## Verification

- `npx vitest run src/quality-drift.test.ts` — the offender list should be
  empty. It prints every unclassified read with file and line, so it doubles as
  the checklist.
- `npx vitest run convex/users.test.ts` — 38 tests covering deletion and re-add.
- Prove the loops drain: seed a user with more rows than one batch
  (`SESSION_BATCH + 1` sessions), delete them, assert nothing survives in
  `authSessions`, `authAccounts`, `authVerificationCodes` or `invitations`.
  Without this the cap bug is invisible, because every fixture today is smaller
  than any sane batch size.
- Prove the sweep advances: seed healthy rows either side of an orphan and
  assert the sweep terminates and removes only the orphan. That is the test
  that fails if the cursor is dropped and take-from-the-start is used instead.

## Known Limits

1. **The guardrail cannot see indexes.** Anything index-scoped will keep being
   reported the moment someone writes `.collect()`, however bounded it is.
   Teaching the detector to accept `withIndex(...).collect()` where the index
   is an equality scope would remove a standing source of false positives — out
   of scope here, worth its own change.
2. **`convex-test` does not enforce the one-paginate-per-function rule.** Green
   tests are not proof that a paginated sweep will run. Until that gap closes,
   anything paginated needs exercising against a real deployment before it is
   believed.
