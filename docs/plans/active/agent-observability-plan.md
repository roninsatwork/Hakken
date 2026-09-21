# Agent observability — one place that answers "is this agent working?"

**Started 2026-07-29.** Anthony opened the Logs tab on an agent and said the
information was basic. It is. But the fault is not that the platform records too
little — it records a great deal — it is that what it records is scattered across
three unconnected trails, and the one surfaced most prominently is the weakest of
the three.

The proposed screens are drawn up here:
[Hakken — Observability](https://claude.ai/code/artifact/c81cdf9b-9ecb-44d9-8493-0c87dbfd030e).

**All five phases are built as of 2026-07-29.** What changed against the plan as
written is recorded under each phase below. Two things named in "Not in scope"
are still not built — watching a job live, and per-agent alerting — and the two
open questions at the foot of this document are still open.

---

## What is actually wrong

### 1. Three diaries of the same event, none cross-referenced

One agent doing one thing writes to three places:

- `agentRuns` / `agentRunSteps` / `agentToolCalls` — the structured trail, with
  status, timings, tokens, cost and errors on every row.
- `agentTransactions` — the cost and token ledger.
- `agentLogs` — the raw prompt-and-reply pairs.

`agentLogs` records `agentId`, `threadId`, `interactionType`, `promptContent`,
`responseContent`, `companyId` and `createdAt`. There is no run id on it. So a
log entry cannot be traced back to the run that produced it, and a run cannot
show its own raw exchange. The two richest trails on the platform sit beside each
other and neither knows the other exists.

### 2. The green ticks are guesses

`agentLogs` has no outcome field at all. The Logs table decides between a green
tick and a red cross by testing whether the event name happens to contain the
text `ERROR` or `FAIL`
(`src/app/(dashboard)/admin/agents/[id]/logs/page.tsx:139`).

The event names actually written are `ERROR`, `LLM SYNTHESIS`,
`WORKFLOW_EXECUTION` and `TOOL DISPATCH: <name>`. A tool dispatch that failed
therefore shows green, confidently. That is worse than showing nothing, because
a reader who trusts it is misled rather than merely uninformed.

### 3. A flat list of something that is not flat

A run is a chain: read the objective, decide, call a tool, read the result,
decide again, finish. The Logs tab breaks that chain into unrelated rows in time
order, interleaved with every other run the agent has made.

The one screen that does show the chain — the execution timeline — is inside a
modal, on the Runs page, which is itself filed under the **Context** dropdown
next to Skills, Knowledge and Memory. The best observability surface on the
platform is three clicks deep and filed under a heading that does not suggest it.

### 4. Every number is a lifetime total

`getAnalyticsForAgent` returns success rate, feedback rate, total cost, tool call
count and average latency. All of them are totals or means over a sample. Nothing
anywhere answers "is this worse than last week", which is the question that
actually prompts someone to open the screen.

### 5. The average hides the complaint

Latency is reported as `averageLatencyMs` — a plain mean
(`convex/agentRuns.ts`, in `getAnalyticsForAgent`). The run that makes somebody
complain is the one in twenty that takes thirty seconds, and a mean over a
thousand fast runs buries it completely.

### 6. Failures group on exact wording

Failure reasons are counted with
`incrementCount(failureReasons, run.error || run.finalOutput || run.status)` —
the raw error string, verbatim, as the grouping key. "Property search timed out"
and "Property search timed out after 24000ms" are two separate entries. Any
error carrying an id, a duration or a URL never groups at all, so the panel
degrades into a list of near-duplicates exactly when there is a real problem to
see.

### 7. Nothing to watch, and nobody is told

Runs park for approval and resume later, and the runtime already keeps a
checkpoint of where an in-flight run has reached. No screen shows a run while it
is happening. And the only alerting is a scheduled platform-wide health email —
nothing notices that one agent's failure rate tripled this morning.

---

## Decisions

### Observability is a new dropdown, and Runs moves into it

The secondary tab bar gains one dropdown, built the same way as Context and
Rules already are:

| Menu item | Route | What it is |
| --- | --- | --- |
| Overview | `/admin/agents/[id]/observability` | New. Is it working properly? |
| Activity | `/admin/agents/[id]/runs` | Today's Runs page, moved here |
| Raw logs | `/admin/agents/[id]/logs` | Today's Logs page, rebuilt |

Only one new route. Runs moves by changing which menu it hangs from, not by
moving files.

Moving Runs in is not optional decoration. If Overview is built beside Runs, the
platform owns two screens answering the same question, they drift, and people use
whichever they found first. Context goes back to meaning only the things that
shape an agent: its skills, knowledge, memory and checks.

### These screens are client-facing, so they speak plainly

The same rule the Admin UI/UX plan applies to Skill Center applies here. No
percentile notation, no "p95", no "OPEX", no "pending approval" as a status
anybody has to decode.

| Not this | This |
| --- | --- |
| p50 4.2s / p95 31s | Usually takes 4.2s, but 1 in 20 takes over 31s |
| PENDING_APPROVAL | Waiting on a person |
| Total OPEX cost | Costs per job |
| Error rate 3.6% | Finished cleanly 96.4% |
| Tool invocation failures | The property search timed out |

### "Job", not "run"

`run` is our word for it, and it is right in the code and the schema, which do
not change. On screen these are **jobs**. One word, used everywhere, chosen
because it is what somebody outside the team would say. This is a decision to
take once now rather than half-apply later.

### Raw logs stop being a destination

The Logs tab exists today because it is the only way to see what was actually
said. After this it becomes the deepest layer, reached from a job, and it is
grouped by job rather than presented as a flat stream. It stays in the menu for
the case where someone genuinely wants to search across everything.

### The agent Dashboard tab is left alone

It is a cost and token ledger, and once Overview exists it will look thin.
That is a real question and it is deliberately not answered here — Anthony has
said the dashboard is a separate conversation. Flagged, not fixed.

---

## The plan

Roughly six and a half days. Phase A carries the others; nothing in B, C or D
works properly without it.

### Phase A — make the trail joinable (1.5 days)
**Built.** Two things went differently. The tool-dispatch entry was being written
*before* the tool ran, so nothing at that moment could know the outcome — the
entry now goes in once the call resolves, and a call parked on an approval gets
its own entry marked as not-yet-known rather than being silently dropped. The
failure key also had to strip trailing clauses that are information-free once
normalised ("timed out after `<n>`" and "timed out" are one fault), which the
first test caught.


Nothing in this phase is visible to a user. All of it is what makes the rest
honest.

1. Add to `agentLogs`: `runId` (optional), `stepId` (optional), `outcome`
   (`SUCCESS` / `FAILED` / `UNKNOWN`), `durationMs` (optional) and
   `failureKey` (optional).
2. Pass them from every writer. There are eight call sites: four in
   `convex/agentRuntime.ts`, three in `convex/salesReportActions.ts`, one in
   `convex/swarmActions.ts`.
3. Existing rows keep `UNKNOWN` and show as *not recorded* rather than being
   guessed into a green tick. No backfill — the information was never captured
   and inventing it would repeat the current fault.
4. Delete the string-matching status logic from the Logs page.
5. Add a stable `failureKey`: a normalised form of the failure with ids,
   durations, URLs and numbers stripped, so the same fault groups regardless of
   wording. The human-readable message is kept alongside it for display.
6. Extend `getAnalyticsForAgent` with median and 95th-percentile latency, a
   previous-period comparison for each headline number, and a per-day series.
   Group `failureReasons` on `failureKey`.

### Phase B — the Overview screen (2 days)
**Built.** The configuration-change markers do not come from the version records
as planned. The runs already record which version they used, so the marker now
lands on the day a new setup first carried traffic — no second query, and a more
useful fact than when somebody saved the change.


New route, new menu, and the dropdown wired into the existing tab component.

- Five vitals across the top: jobs run, finished cleanly, usually takes, costs
  per job, waiting on a person. Each carries its change against the previous
  period.
- One chart: jobs per day, finished against failed, with markers where the
  agent's configuration changed. Runs already record which agent version they
  used, so the markers come from existing data.
- What is going wrong: failures grouped by cause, worst first, with first-seen
  and last-seen, clicking through to the affected jobs.
- The tools it relies on: per tool, times used, how often it worked, typical
  duration.
- Latest jobs: a compact list, each opening the job detail.

### Phase C — inside one job (1.5 days)
**Built.** The plan assumed steps recorded their duration. They do not: a step is
written after its work finishes with start and end stamped identically, so every
step on record has a duration of zero. The waterfall therefore charges each step
the gap between the previous step finishing and its own — which accounts for
every second of the job, where per-step start times would have left the gaps
between steps unattributed.


- A waterfall: the job drawn as bars on a time axis, so a reader sees which
  single step consumed the time instead of reading six rows and doing the
  arithmetic.
- The step list beneath it in plain language — *read the request*, *decided what
  to do*, *property search* — with duration and cost per step.
- The raw exchange for any step, opened in place.
- Reached from Overview, from Activity, and from a raw log entry.

### Phase D — raw logs, rebuilt (1 day)
**Built.** The old flat-list query had no callers left and was deleted; the
tenant-isolation coverage it carried moved onto the query that replaced it. The
per-entry delete button was not carried across — deleting single entries from an
audit trail sits oddly beside grouping them by job, and retention is handled by
the purge schedule. The mutation still exists. Raised for a decision, not fixed.


- Entries grouped under the job they belong to, with that job's real outcome,
  duration and cost on the group header.
- Real outcome per entry, from Phase A, not inferred from wording.
- Filters for everything, thinking, tools and problems.
- Sent and received shown side by side, in place, rather than on a separate page.
- Repeat failures state how many times the same thing has happened and link to
  the rest.

### Phase E — the vocabulary pass (0.5 days)
**Built.** Money now formats one way across all four screens. Two deliberate
non-changes: token counts stay named as tokens, because calling them words would
be plainer but wrong; and the Eval health panel on Activity keeps its own
vocabulary, because that panel belongs to the AI Checks Plan.


One sweep across all four surfaces against the table in Decisions, including the
empty states and the tooltips, which is where jargon usually survives a rename.

---

## Not in scope

- **Live watching of an in-flight job.** The checkpoint data exists and this is
  the natural next thing, but it is its own piece of work with its own
  subscription and refresh behaviour. Raised, not fixed.
- **Per-agent alerting.** Same reasoning. Once failures group on a stable key,
  alerting on "this key spiked" becomes straightforward — but it needs a
  recipient model and a threshold UI, and that is a separate plan.
- **The agent Dashboard tab.** See Decisions.
- **The fleet-level view at `/admin/health`.** It reads `getRunObservatory` and
  is unaffected. If Phase A's percentile and grouping work is useful there too,
  that is a follow-up, not part of this.
- **Checks and evals.** The Eval health panel currently sits on the Runs page.
  It moves with Runs into the Observability menu but is not otherwise touched —
  it belongs to the AI Checks Plan and that plan still owns it.
- **Approvals.** The queue, expiry and notification behaviour belong to the Agent
  Autonomy And Approvals Plan. This plan only displays the count of jobs waiting
  on a person and links to that queue.

---

## Verification

Each screen is checked in the running app on real data, not only in tests: the
dev server, the real page, the real agent. Anything asserted about behaviour gets
a test, and each new test is confirmed to fail against deliberately broken code
before it is trusted.

Specific to this plan:

- Phase A is verified by a failing tool dispatch showing as failed. That single
  case is the one the current screen gets wrong, and it is the gate on the phase.
- Failure grouping is verified against two real errors that differ only in an
  embedded id or duration, which must collapse to one row.
- The percentile figures are verified against a hand-computed sample rather than
  trusted from the query.
- The vocabulary pass is verified by reading each screen aloud and finding no
  word that needs a developer to explain it.

Before merge: `npm run verify:env`, `npm run lint:all`, `npm run check`,
`npm run build`, `git diff --check`.

---

## Open questions

1. **Does the Activity page keep its current density?** It is a rich page that
   grew organically — metric tiles, eval health, run cards, replay controls and
   learning actions all on one screen. Moving it into Observability is a good
   moment to decide whether it stays as it is or sheds work to Overview. Not
   answered here.
2. **How long are raw logs kept?** There is already a purge pipeline for
   `agentLogs`. Grouping by job makes retention more visible — a job whose logs
   have been purged needs to say so rather than appear empty.
