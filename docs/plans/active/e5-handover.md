# E5 handover — declaring the remaining return shapes

Paste the block below into a fresh session. It is written to be enough on its
own, and everything in it was true at commit `3066f842c` on 2026-08-26.

---

## The prompt

> Work package **E5** in `docs/plans/active/audit-remediation-plan.md`. Read that
> file's **E5 section** and its **non-negotiable working rules** first, then
> `AGENTS.md`. Where they disagree with me, they win.
>
> **The job.** 362 client-callable Convex declarations have no `returns:`
> validator. Declare them, one file at a time, largest file first — shapes repeat
> within a file, so the second surface is far cheaper than the first. The ten
> heaviest files hold 130 of the 362.
>
> **Superseded 2026-09-21.** The frozen Posture Studio code this warned about
> was removed from the repository, along with `src/app/(dashboard)/demos/**`.
> Nothing here is left to avoid.
>
> **Do not push.** Every push bills a metered CI run and Anthony decides when.
> Commit locally, one commit per file or per small batch, and stop.
>
> **The numbers as of `3066f842c`,** so you can tell drift from progress:
> - `MISSING_SHAPE_CEILING` in `src/return-shape-drift.test.ts` is **362**
> - handlers returning an undeclared database row: **0** — keep it there
> - `npm run check` was green: 712 files, 6,193 tests
> - 17 commits sit unpushed on `dev`
>
> **After every file:** `npx tsc --noEmit`, that file's own test suite, then
> lower `MISSING_SHAPE_CEILING` to the newly measured figure. The ceiling only
> ever falls — never raise it, and never widen an allowlist to make your change
> pass. Run the full `npm run check` before each commit.
>
> **Use the schema, not a copy.** `convex/utils/rowShape.ts` derives whole-row
> shapes from `convex/schema.ts`. Where a surface genuinely returns a whole row,
> use it. Never hand-write a field list that duplicates the schema — the copy
> drifts, and that drift is how `users.tokenIdentifier` and
> `workflows.webhookSecret` reached screens that had no use for them.
>
> **Five traps, all of which bit on 2026-08-26:**
> 1. A Convex return validator **refuses** an unexpected field at run time — it
>    does not quietly drop it. If a surface should stop sending a field, narrow
>    the object on the way out; declaring the shape alone will throw instead.
> 2. Some handlers return without the word `return`
>    (`handler: async (ctx) => doThing(ctx)`). A regex that looks for `return`
>    calls these empty and declares `v.null()`. Five such handlers remain
>    undeclared and need reading by hand.
> 3. Declaring a shape **finds bugs** — four handlers that promised `null` and
>    returned nothing, a conversation list carrying a thread's access-token hash,
>    a call page receiving the telephony provider's key. Budget for fixing what
>    it turns up, and log each in the plan's "Found in passing" table.
> 4. Surfaces with real stored data need looking at in the browser before you
>    call them done, because a validator that rejects real rows fails for a
>    person and not in a test. Drive Anthony's own Chrome; never ask him to check.
> 5. `convex/wikiTendingActions.test.ts` and `convex/wikiDistillActions.test.ts`
>    flake under full-suite load — three sightings, never reproduced in ten-plus
>    deliberate attempts, always pass alone. A red there is almost certainly not
>    you. Re-run it before chasing anything.
>
> **What "done" is allowed to mean here.** A claim needs a probe behind it:
> something broken on purpose, watched to fail, then restored. This effort has
> been through four audits and every gap any of them found was a check that read
> nothing and passed. "The suite is green" is not proof that your rule works.
>
> **Talk to Anthony in plain English** — he is not technical. Verdict first, then
> the reason, no file paths or jargon in anything you write to him, and put a
> percentage in every progress update. He is red/green colour blind, so never
> signal with those two alone.
>
> Start by re-running the enumeration rather than trusting the 362 above, tell me
> what you actually found, and then begin with the heaviest file.

---

## Where the counts come from

Re-measure before starting; the repository moves fast.

```
npx vitest run src/return-shape-drift.test.ts
```

That guard holds three things: the undeclared population may only shrink, no
handler may return an unshaped database row, and no frozen entry may go stale.
All three have been broken on purpose and watched to fail.
