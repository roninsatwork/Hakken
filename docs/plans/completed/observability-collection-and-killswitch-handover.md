# Handover: honest collection reporting + a visible kill switch

**Written 2026-07-30 for a fresh agent picking this up on another machine.**
Two pieces of work, neither started. The context below is what a previous
session established by running the real app; trust it but verify anything you
are about to change against the live code, because line numbers drift.

---

## Where things stand

- **Branch `dev`, pushed.** `HEAD` is `f3e928d9d`. Working tree clean.
- Two fixes landed this session and are already on `dev`:
  - `703ff9d49` — the thought-signature fix. Tool calls from the affected
    provider used to die one turn after they ran; they now survive. This is what
    unblocked the Rightmove agent. Done and verified end to end.
  - `f3e928d9d` — the job waterfall now labels a tool step with the tool's name
    ("Used Apify") instead of raw JSON arguments or a truncated
    `apify_actor_run`. Done and verified in the browser.
- The plan those grew out of is
  [agents-run-properly-plan.md](agents-run-properly-plan.md). Read the section
  about the second-turn rejection fix that just landed; the rest of that plan is
  already done.

### Before you touch anything on the new machine

- **`npx convex dev` must be running**, or none of the backend exists and whole
  screens read as broken. A schema change is not live until the dev push runs.
- **Do not push unless Anthony asks.** Every push runs a metered CI check.
  Commit locally and wait to be told.
- Anthony is not technical. Explain in plain terms, verdict first. Don't hand
  him file paths or offer him technical either/or choices — decide and say why.
- Verify UI work in his real Chrome before calling it done, not only in tests.
- The gate before any merge: `npm run verify:env`, `npm run lint:all`,
  `npm run check`, `npm run build`, `git diff --check`. `check` is the real CI
  gate (~3,461 tests today).
- Test agent for manual runs: **Rightmove Agent**, id
  `mh75esr2sejpx6n4ammbv259kn86729c`. Its run detail screen is
  `/admin/agents/<id>/observability/<runId>`. Starting a real run spends a
  little on Apify — get Anthony's go before doing it.

---

## The problem, in one sentence

When the Rightmove agent runs, it only *starts* an Apify collection and then
finishes. Apify scrapes for minutes and calls a webhook back, and *that* is what
writes the listings. So the job's own screen reports "finished cleanly" the
moment the agent hands off — with no idea whether any listings ever arrived, or
whether Apify returned nothing. A collection that silently comes back empty
still shows five green steps and a tidy summary. That is the misleading part
worth fixing.

Confirmed live: the Louth run worked — listings are in Properties → Scraped
Data (`/app/properties/scraped-data`). So the loop is sound; the reporting just
stops at the hand-off.

---

## Piece 1 — tie the collection back to the job, and report it honestly

### What already exists (don't rebuild it)

- The agent tool handler `apify.actor.run` lives in
  `convex/aiToolExecutionService.ts` (search `"apify.actor.run"`, ~line 417).
  Its `input` already carries `runId` (the agent run) and `toolCallId` — the
  resume path passes them (`executeRegisteredTool({ …, runId, toolCallId })`).
- It calls `internal.apify.startApifyActorInternal` →
  `startApifyActor` (`convex/apify.ts:174`) → `internal.webhooks.recordRunStart`
  (`convex/webhooks.ts`, ~line 118) which inserts the `apifyRuns` row.
- On completion, the webhook path (`convex/webhooks.ts`,
  `processApifyWebhook` + the store mutation, ~line 150–220) patches the
  `apifyRuns` row with `status` (`COMPLETED`/`FAILED`) and
  `propertiesScraped` (the count — 0 when nothing came back). **The count and
  outcome are already recorded.**
- There is already a watchdog: `startApifyActor` schedules
  `internal.apify.pollRunStatus` 60s later so a missed webhook still resolves
  the row. Check whether it terminally marks a run that never responds; that is
  your "never came back" case.
- `apifyRuns` schema (`convex/schema.ts:2204`): `runId, actorId, status,
  startedBy, companyId, startedAt, completedAt, propertiesScraped`. **No link to
  the agent run or tool call — that is the whole gap.**

### The missing link

Thread the agent run id (and tool call id) down so the collection knows which
job asked for it:

1. `convex/schema.ts` — add to `apifyRuns`:
   `agentRunId: v.optional(v.id("agentRuns"))` and
   `toolCallId: v.optional(v.id("agentToolCalls"))`. Optional, because the
   Properties → Search screen starts Apify directly with no agent — those rows
   will simply have neither, and must keep working unchanged.
2. `apify.actor.run` handler → `startApifyActorInternal` → `startApifyActor` →
   `recordRunStart`: pass `agentRunId` (from `input.runId`) and `toolCallId`
   through each hop and write them on the row. Four small signature additions,
   all optional.
3. Add an index `by_agentRun: ["agentRunId"]` on `apifyRuns` for the read below.

### Report it on the job screen (read-only, no run mutation)

Prefer a **read-time join** over writing outcome back onto the agent run — it is
safer and avoids a second writer racing the webhook.

4. `convex/agentRuns.ts` `getRunDetail` (~line 597): after loading the run, look
   up the linked `apifyRuns` row(s) via the new index and return a `collection`
   block: `{ status, propertiesScraped, startedAt, completedAt }` (or `null`).
5. The run detail screen
   (`src/app/(dashboard)/admin/agents/[id]/observability/[runId]/page.tsx`):
   render `collection` **below** the waterfall, not as a bar on it — it happens
   after the job's own clock stops and belongs in its own row, e.g. "Apify sent
   back 68 listings, 9 minutes after this job ended." Mark it clearly as
   arriving later.
6. **The honest verdict.** When `collection.status === "FAILED"` or
   `propertiesScraped === 0`, the screen must not read as an unqualified
   success — show a plain warning ("The collection came back empty"). Computing
   this at read time keeps it truthful without a second writer. If
   `collection.status` is still `PENDING`, say "still collecting", not "done".

### Deliberately out of scope

- **A per-run Apify spend ceiling.** Already logged as out of scope on
  [agents-run-properly-plan.md](agents-run-properly-plan.md) — it needs a limit
  model, not a constant. Note it, don't build it.
- Changing the Properties → Search form design. The execution path has already
  moved to `propertyAgents.startRightmoveCollection`; the remaining work here is
  linking the later Apify collection evidence back to the agent job.

---

## Piece 2 — a visible kill switch

Anthony asked for "a kill switch in case it gets stuck in a loop". Important:
**the loop already cannot run forever.** Before building anything, understand
what exists so you build the one missing bit, not a duplicate.

### What already exists

- Hard step cap: the loop is `for (loopIndex < limits.maxSteps)`
  (`convex/agentRuntime.ts` ~line 1222). Defaults live in
  `convex/agentRuntimeService.ts` — `maxSteps` default 10, ceiling 24;
  `maxToolCalls` default 8, ceiling 20; plus `maxRuntimeMs` and `maxCostGBP`.
  A run cannot iterate unbounded.
- Manual cancel already exists in the backend: `cancelRun`
  (`convex/agentRuns.ts:1790`, `adminMutation`) writes `CANCELLED`; the loop
  polls `readStopRequest` (`convex/agentRuntime.ts:1105`) between steps and
  between tool calls and stops cleanly.

### The actual gap

There is **no Stop button in the UI** — grep the run detail page, `cancelRun` is
never called from it. So the kill switch is mostly a UI job:

1. Reuse the existing **Run Agent** button slot as the kill switch. When the
   current agent has an in-flight run (`RUNNING`, and any other genuinely
   stoppable in-progress status), that button should become **Stop Agent** and
   call `cancelRun`. When the run reaches a finished state (`SUCCESS`,
   `FAILED`, `CANCELLED`, etc.), the same control should turn back into
   **Run Agent**. Confirm before firing Stop Agent — it is irreversible. Reuse
   the screen's existing `perform(...)` action wrapper so a failure surfaces
   instead of silently doing nothing.
2. Check what a cancelled run then looks like on the screen and on Activity —
   `cancelRun` writes the row but the loop closes the reply; make sure the
   screen reflects "stopped by you", not "failed".
3. Consider surfacing the same Stop on the Activity/overview list for any
   in-flight job, so Anthony doesn't have to open a run to stop it. Confirm with
   him whether he wants it in both places before building both.

### Judgement call to raise with Anthony, not silently decide

His worry is really *cost* — an agent repeatedly calling Apify. `maxToolCalls`
caps the count (default 8) but each call bills per item. A tighter default
Apify-call cap, or the per-run spend ceiling above, may be what he actually
wants. Ask plainly; don't assume the Stop button alone answers it.

---

## Suggested order

1. Piece 2 step 1 (Stop button) first — small, high-value, low-risk, and it is
   the literal thing he asked for.
2. Then Piece 1 (schema link → read join → screen row → honest verdict).
3. Verify each in real Chrome on the Rightmove agent. Get his go before any run
   that spends on Apify.
4. Commit in logical chunks. Do not push until he asks.
