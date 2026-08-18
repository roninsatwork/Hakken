# The Governance Screens Read A Summary, Not The Estate

Agreed 2026-08-18, after Anthony opened the governance overview and asked why it
is the one admin screen that is not instant: *"This page is very slow to load and
not instant like the other pages in the platform why is that?"*

He is right, and the reason is structural rather than incidental.

## What is actually slow

Every other admin screen fetches one pageful — fifteen rows, straight off an
index — and gets its totals from the database. The governance overview counts
the whole estate on every visit, in two queries that both fan out:

| Query | What it reads on every load |
|---|---|
| `getGovernanceDashboard` | Up to 500 agents, 500 widgets, 500 workflows, 500 pending approvals, and the 500 most recent tool calls. The tool-call read is `.order("desc").take(500)` with **no index** — a reverse walk of the largest table on the platform. |
| `getGovernanceActivity` | Eighteen separate reads in parallel, each taking up to **2,000** rows: six run statuses, seven tool-call statuses, four decided approval statuses, every pending approval, and 500 agents. Then it filters and aggregates the lot in JavaScript. |

That is up to ~34,500 rows fetched to draw one screen, and the screen admits it:
the line *"This covers as much as one read can hold, so the figures below are a
floor rather than a total"* only renders when a read hit its 2,000-row ceiling.
It was showing on Anthony's screen, so at least one bucket is already maxed out.
**The numbers on the compliance screen are already wrong, and quietly.**

There is a second cost that a one-off wait would not explain. Convex queries are
reactive: they re-run whenever anything they read changes. This one reads the
tool-call table, which changes every time any agent does anything. So it is not
slow once on load — it recomputes that whole fan-out repeatedly while the screen
sits open.

## The fix

Count as things happen, not when someone looks. This is not a new idea here —
the platform already does it twice, and this plan copies the closer of the two:

- **`inventoryRollups`** holds company, user and revenue totals, incremented at
  the moment a company or user is created.
- **`agentSkillRollups`** holds the Skill Center's counts, rebuilt by a cron
  every ten minutes, with `isPartial` and `computedAt` so the screen can be
  honest about what it is showing. Its own comment says exactly why: *"they used
  to be totalled on every page load… counting cannot be indexed away, so it
  happens here instead."*

Governance gets the same treatment, in two rollups because it shows two
different kinds of number.

### Rollup one — activity, bucketed by day

The bar chart, actions taken, oversight figures and busiest systems all describe
*a window of time*. They become one row per company per day, holding that day's
counts. Asking for "last 30 days" then reads thirty small rows instead of
sweeping thirty days of raw records.

Day buckets are the right grain because the chart is already per-day: the stored
shape and the drawn shape are the same, so nothing is re-derived on read.

### Rollup two — the state of the estate

How many AI systems, the risk mix, what needs attention, which assistants are
doing more than their rating claims. This is a snapshot that only moves when
somebody changes a setting, so it is rebuilt on the same timer and stored as one
row, exactly like the skills rollup.

## Decisions taken, and why

**Rebuild on a timer, not increment at each write.** Runs are inserted in at
least six places outside the runtime — eval fixtures, replays, skills, the
property agent, the demo seed — and their status is patched in a dozen more.
Incrementing a tally at every one of those sites means the count is wrong the
first time somebody adds a seventh and forgets. A job that reads the tables
cannot miss a write site, because it does not know or care where the row came
from. **A number that is quietly wrong is worse than a number that is slow**, and
that is the whole risk of this change.

**Recompute a short recent window each tick; freeze everything older.** Each run
of the job recomputes only the last two days of buckets and leaves earlier days
alone. That keeps the per-tick work bounded and constant no matter how much
history exists. Two days rather than one because a run that starts before
midnight and settles after it belongs to the day it started, and because the
stall recovery job takes up to a few minutes to resolve a dead run.

**Buckets outlive the raw rows, on purpose.** Runs are purged after 180 days by
the `agentRunHistory` retention pipeline. Today that silently erases history from
the governance chart — the activity happened, and the screen forgets it. Once the
counts are their own records, the governance history survives the purge of the
raw rows. That is a straightforward improvement to the compliance position and it
falls out of the design rather than being built for.

**Scope is stored, not filtered on read.** A bucket is keyed by company, with
rows belonging to no company in their own bucket. A workspace's view is its own
buckets plus the companyless ones; the platform view is all of them. That is the
register's existing scope rule, kept identical — the two screens disagreeing
about scope is how a dashboard starts contradicting the records beneath it.

**The truncation warning goes away, because it stops being true.** Nothing is
capped once the counting happens continuously, so the figures become exact. On
this screen that matters more than on any other, since these are the numbers an
auditor would rely on.

**Approvals stay live.** They are few, they are indexed, and the median wait
cannot be summed across buckets without storing every wait time. Reading them
directly stays cheap and stays exactly right.

## Phases

### Phase 1 — Day buckets (1 day)

- `governanceDayRollups` table: company, day, run outcomes, side-effect counts,
  per-agent run counts for "busiest systems", and `computedAt`.
- A pure service module that folds raw rows into a bucket, unit-tested on its
  own — the house split, the same as `governanceActivityService`.
- The rebuild mutation, and a `by_started` index on runs and tool calls so the
  recent-window read is a range scan rather than a status fan-out.
- Wire the job into `crons.ts` and `jobLedger.ts` beside the skills rollup.

### Phase 2 — The estate snapshot (0.5 days)

- `governanceEstateRollups` table, one row, the dashboard's shape.
- Rebuilt by the same job, so there is one thing to schedule and one
  `computedAt` to reason about.
- `getGovernanceDashboard` becomes a document read.

### Phase 3 — Backfill, self-check, and the read path (1 day)

- `getGovernanceActivity` reads buckets for the window.
- A one-shot migration builds every historical bucket, so the charts are full on
  the day this lands rather than starting empty.
- **The test that matters:** the rolled-up figures and a from-scratch count of
  the same raw data must agree. Proved by breaking it — change the fold and watch
  the test fail. Without this, every other test here only proves the rollup is
  self-consistent, which a wrong rollup also is.
- The screen keeps showing how old the numbers are, as the skills panel does.

## What this plan does not do

- **It does not change what the screens say.** Same figures, same shapes, same
  scope rules — computed earlier. The only intended difference is that the
  numbers stop being capped.
- **It does not touch the register, approvals, audit trail or policies screens.**
  They are already indexed reads.
- **It does not add a chart, a range or a metric.** Anthony asked why one screen
  is slow.

## Verification

- `npm run check` green: typecheck, all guards, full suite.
- The rollup-versus-raw agreement test, proved by breaking it.
- The page opened in Anthony's own browser and compared against a fast admin
  screen, with the truncation warning confirmed gone.


---

## Where this stands — end of 2026-08-18, picked up tomorrow

Anthony called time here: *"mark whatever is outstanding in the plan as
outstanding and I can pick this up tomorrow."* Everything below is committed;
the tree is clean.

### Built and verified

- Both rollup tables, the pure fold service, the cron rebuild (every ten
  minutes, beside the skills rollup), and the day-cursor backfill migration.
- Both queries rewritten onto the rollups. Approvals and retention config stay
  live, as decided.
- 21 new tests, all green in a 5,391-test suite. The agreement tests check the
  screens' figures against hand-counts of seeded rows, and were proved by
  breaking the fold and watching them fail.
- Run for real against dev: the backfill is COMPLETED there, the rebuild has
  run, and the page reads buckets. **The figures became exact on the real
  screen** — "actions taken" was silently capped at 2,007 and truthfully reads
  7,936; the "floor rather than a total" warning is gone because it stopped
  being true.

### Outstanding

1. **The runs-per-day bar chart draws empty on the real screen.** Every number
   around it is right, and the chart's y-axis scales as if the data is there,
   but no bars render. The unit tests say `mergeBucketsForWindow` produces a
   correct timeline, and the chart component is untouched — so the first move
   tomorrow is to look at what `getGovernanceActivity` actually returns in the
   browser (log `activity.timeline`, compare against the
   `governanceDayRollups` rows, which can be listed with
   `npx convex data governanceDayRollups`). Ruled out already: date-format
   mismatch (both sides use the same UTC `dayKey`), the empty-state branch
   (`runs.total` is 239, so the chart path is taken).
2. **Browser verification is incomplete.** Only the 30-day view was looked at.
   The 7- and 90-day ranges, and the workspace-scoped view at `/app/governance`,
   still need eyes once the chart is fixed.
3. **Deploy day now needs three steps, not one**, all one-shot: the company
   modules backfill (Phase 6 of the screen-kit plan), this plan's
   `2026-08-18-governance-day-rollups-backfill`, and one manual
   `governanceRollups:rebuildGovernanceRollups` so the estate snapshot exists
   before the cron's first tick.

### Worth knowing tomorrow

The `npx convex dev` watcher (running since Sunday) pushed a mid-edit state
during this build, which briefly broke the live page with a
`readBucketsForWindow is not defined` error; `npx convex dev --once` cleared
it. If the page misbehaves in a way the code cannot explain, force a clean
push first and re-judge.
