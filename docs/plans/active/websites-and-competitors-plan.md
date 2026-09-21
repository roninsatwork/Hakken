# One Website, Many Watchers — Websites, Competitors and the Collection Pipeline

Status: **structure, pipeline, connector and screens built 2026-09-21.**
Not yet run against live DataForSEO credentials. Owner: Anthony

Hakken is in the same business as Ahrefs and Semrush, with DataForSEO as the
core data source. This plan is the admin structure everything else hangs off,
and the pipeline that fills it. It is written so that an agent who has never
seen the repo can build the pipeline from it. Read all of it first.

Two rules from `AGENTS.md` decide most of what follows: **reuse before you
build** and **look first, every time**. A parallel schedule system was built
for this feature once and had to be deleted. Every part of the pipeline below
names the existing thing it reuses. If you find yourself writing a second one
of anything, stop.

## Part 1 — The model

### In three lines

- **A website exists once.** `example.com` is one record and all its SEO data
  hangs off it, whoever is looking at it.
- **A company holds its own websites.** Inside each of those sits the
  competitors that website is measured against.
- **Adding a host anywhere reuses the record.** Another company, as their own
  site or as a rival — same record, same data, nothing re-fetched.

```
Ronins Agency
 ├ ourshop.com          their website
 │    ├ rival-a.com     competitor
 │    └ rival-b.com     competitor
 └ ourtrade.com         their website
      └ rival-c.com     competitor
```

DataForSEO bills per call. That is the whole reason for the first line.

### What that rules out

The rule only holds while nothing company-specific lands on a `websites` row.
Each of these looks reasonable alone and each would quietly break the dedupe,
because the moment one exists two companies need two rows:

- an owning company
- a country or language
- a per-client label or note
- an owned-or-tracked flag

All of them live on `companyWebsites` or `trackedCompetitors` instead, or do not
exist yet. The `websites` row holds a host and nothing else. That emptiness is
the design, and the schema says so, because the next person will want to add one
of them.

### Decided 2026-09-21 — structure

**A website is a host.** Lowercase, no scheme, no `www.`, no path.
`https://www.example.com/uk` and `http://example.com` are one record.
`shop.example.com` is a **different** record — a subdomain has its own rankings
and its own backlinks, and DataForSEO targets work the same way.
`convex/websiteIdentity.ts` is the one place that decides this.

**No divisions.** Tried and removed the same day. A company holds its websites
directly; grouping them added a level that earned nothing once competitors moved
inside a website rather than sitting beside it.

**No countries yet.** Everything is UK. Not modelled, not on a screen, not in
the schema.

**A competitor belongs to a website, not to a company.** A rival is only
meaningful relative to the site it is compared with — the shop's competitors are
not the trade arm's. The same rival may be tracked against several of a
company's websites, and against other companies', and it is one record
throughout.

**A competitor has no cadence of its own.** It is pulled at whatever rate the
website it is measured against is pulled at. Numbers from different weeks are
not a comparison.

**Super admin only for now, shaped for self-serve later.** `companyId` is on
both company-side tables so a tenant-scoped list filters on one index, and every
handler scopes by company rather than trusting the route. The customer-facing
half is a second set of doors onto the same functions, not a rewrite.

### Schedules

The SEO schedule is an ordinary `schedules` row — the same row the workflow
and agent screens use, run by the same `workflow-schedule-dispatcher` cron in
`convex/crons.ts` through `scheduleDispatcher` in `convex/workflowEngine.ts`.
The run it starts is an ordinary agent run and shows in the agent's runs, logs
and costs. **There is no second scheduling system.** This was built once and
deleted.

- `schedules` carries `companyId` and a `by_company_agent` index;
  `getCompanySchedule` in `convex/scheduler.ts` finds a company's row.
- `companyWebsites` carries `refreshIntervalStr` and `collectionEnabled`, both
  optional. **Absence means inherit from the company.** A website following its
  company stores nothing, so changing the company moves it and an overridden
  one stays put. Copying values down at creation would look the same on screen
  and behave differently the moment the company changed.
- **Fortnightly** is part of the platform's cadence vocabulary
  (`convex/workflowScheduleService.ts`, `src/app/(dashboard)/admin/_lib/scheduleConfig.ts`),
  anchored to a user-chosen date rather than "every 14 days", so a pause or a
  backfill cannot shift it onto the wrong week. `convex/fortnightlySchedule.test.ts`
  covers it, including a three-weeks-missed catch-up.
- `convex/seoScheduleService.ts` holds `resolveWebsiteSchedule`, `isWebsiteDue`
  and `soonestPull`. All interval maths delegates to `workflowScheduleService`.
- **Absent switch reads as off.** A company nobody has scheduled costs nothing,
  so shipping the fetcher does not start spending on every client at once.
- **Spend caps are the agent's.** Agents carry `maxCostGBP`, `maxSteps`,
  `maxToolCalls` and `maxRuntimeMs`. Nothing about money goes on a company or a
  website.

### Screens

```
Sidebar
 ├ Companies
 │  └ Manage Companies                 (exists)
 └ Websites
    ├ All Websites                     /admin/websites
    └ Data Collection                  /admin/websites/collection
       └ one run                       /admin/websites/collection/<cycleId>

Company workspace
 └ Websites  (tab)
    ├ Websites                         the company's own sites
    │  └ one site                      its competitors + its cadence override
    └ Data Collection                  this company's cadence + queued/live
```

**The two Data Collection screens are not the same screen and must not drift
into each other.** The one in the company workspace is a *setting*: how often
this client's sites are pulled. The one in the sidebar is the *pipeline*: what
is going out right now, what came back, and what it cost across every tenant.
See decision 11b. The company one never shows a cost, a queue or a run.

The sidebar screen is two tables of the same rows at two stages — in the queue,
then collected — carrying the same columns on purpose. An earlier build showed
work in flight as individual requests and finished work as *runs*, which put
two different things on one screen and invited a reader to compare numbers that
were never comparable. Clicking any row opens the run it belonged to, which
lists every website that run asked about and which lines cost nothing because
somebody had already paid.

Expect three of the queue's counters to read zero almost always. That is the
design working: the worker chains schedule themselves and an empty queue starts
nothing, so the numbers are only non-zero while a cycle drains. The column that
earns its place daily is reuse, because it is the only place the shared-website
saving is visible.

The company's Data Collection screen uses `SeoScheduleFields` in
`src/app/(dashboard)/admin/_components/SeoScheduleFields.tsx`: four cadence
cards, then **one row** reading "on [Monday] at [09:00]" with the queued-vs-live
toggle at the far right of that row. Chosen from mockups; a stacked version was
rejected. Keep it one row. The screen looks for an agent named exactly
`DataForSEO Agent` and shows a "no collecting agent yet" banner until one
exists. **That banner carries the button that creates it.** It used to say
"create one from its template in the Agents section", which nobody could do:
the template picker was taken off the new-agent screen long ago and nothing in
the frontend called `createAgentFromTemplate` at all. The agent arrives as a
draft, so pressing it starts no spending.

**Remove is not delete, and they never read alike.** Removing a website from a
company, or a competitor from a website, takes that hold and nothing else — the
record and its data survive for everyone else. Deleting a website outright
happens only on All Websites, takes its data and every company's hold on it, and
names those companies before it happens.

### Built and working

- `convex/websiteIdentity.ts` — what counts as one website. Pure, 41 tests.
- `convex/websites.ts` — `findOrCreateWebsite` is the **only** place a
  `websites` row is created. Company-website and competitor CRUD, the global
  list, purge internals. 41 tests.
- `convex/utils/websiteShapes.ts` — return shapes.
- `convex/seoScheduleService.ts` — schedule resolution, above.
- `convex/dataForSeoRegistry.ts` — the registry of DataForSEO operations, 35
  tests. Four operations: `serp_google_organic` (queued, one keyword),
  `keyword_search_volume` (queued, up to 1,000 keywords), `domain_ranked_keywords`
  (live), `backlinks_summary` (live). The agent names an operation id plus
  params; the handler builds the request. Every wrong input is refused locally
  before money is spent.
- `convex/dataForSeoRest.ts` — the fetch wrapper. Credentials come from
  `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` and `DATAFORSEO_SANDBOX` in the
  backend environment. The owner sets them. **Never read them into a document,
  a log line or a commit.**
- `seoDataPulls` in `convex/schema.ts` — the task ledger and cost record.
  DISSOCIATE on `requestedBy` in `convex/personalDataService.ts`.
- `src/app/(dashboard)/admin/_components/HostField.tsx` — the address field that
  echoes the key before saving, shared by all three add forms.
- `ScheduleBuilder` and `scheduleConfig` live under `admin/_components/` and
  `admin/_lib/` because the workflow screens and the SEO screens both use them.
- The screens above, with their tests.

The pipeline, built 2026-09-21:

- `convex/seoCollectionPolicy.ts` — every number the pipeline runs on, each
  with the reasoning that chose it. No tests: it is constants, and a test would
  only restate them.
- `convex/seoIdempotency.ts` — what a pull *is*, as one string. 10 tests.
- `convex/seoCollection.ts` — chunked expansion and the reuse ladder. 10 tests.
- `convex/seoCollectionQueue.ts` — the transactional half: claim, release,
  settle, and the pingback's own mutation. 14 tests.
- `convex/seoCollectionActions.ts` — the only file here that reaches the
  network. Worker chains and result fetching.
- `convex/seoPingback.ts` + the route in `convex/http.ts` — a task id and
  nothing else.
- `convex/dataForSeoParsers.ts` — one parser per operation, pure. 10 tests,
  one of which asserts a result title written as an instruction never reaches
  the output.
- `convex/seoCollectionParse.ts` — payload to metrics, idempotent by `pullId`.
- `convex/seoCollectionSweep.ts` — the hourly watchdog and both retention
  passes, registered through `jobLedger`.
- `convex/seoCollectionReports.ts` — the queue, the history and the cost, for
  the screens. Super admin only, every one.
- `convex/seoTools.ts` — the agent's four doors, and `requireCompanyWebsite`,
  the only way a host becomes a website id. 10 tests.
- `convex/websiteTenancyGuard.test.ts` — 3 tests that keep the tenancy rule
  structural rather than remembered.
- `src/app/(dashboard)/admin/websites/collection/` — the global queue, its
  history, and one run behind them.
- The connector in `convex/toolConnectorDefinitions.ts`, its handlers in
  `convex/aiToolExecutionService.ts`, and the `DataForSEO Agent` template in
  `convex/agentTemplates.ts`.

## Part 2 — The collection pipeline

### Facts about DataForSEO this design rests on

Verified against their docs on 2026-09-21. Re-verify anything you build on.

- `cost` in USD is returned on every response, per task.
- `tag` is echoed back in the task's `data`.
- **`task_post` charges at submission, not on result.** This is the single most
  important fact in the design. A task posted twice is paid twice.
- Pingback and postback exist. The callback has a ~10 second timeout and cannot
  carry an auth header.
- Backlinks and DataForSEO Labs publish `/live` endpoints only.
- `task_post` accepts a list of tasks per request. The cap is 100 on the
  endpoints checked; confirm it per endpoint before relying on it.
- Each queued family has a `tasks_ready` endpoint that lists finished tasks in
  bulk. It is the cheap way to find a result whose pingback never arrived.

### In plain terms

A kitchen. A clock says a customer is due. One worker writes the order list and
stops. Helpers pick lines off the list and send them out, a tray at a time.
Replies come back later, one at a time, and are filed. Once an hour someone
walks the kitchen looking for a tray that was picked up and never sent, or a
reply that never came.

### Decided 2026-09-21 — pipeline

Do not reopen these.

1. **Pull once across tenants.** When a company's turn comes, a website plus
   operation is only sent if we do not already hold a result younger than that
   company's own interval. A weekly watcher is given six-day-old data and we pay
   nothing. The website's effective cadence is therefore the fastest of its
   watchers. Owner agreed 2026-09-21.
2. **`seoDataPulls` is the queue.** It gains `PENDING` and `CLAIMED` statuses and
   a due time. There is no separate task table. The knowledge base already runs
   this exact pattern — rows parked at `pending`, an atomic claim, self-chaining
   drain actions — in `convex/knowledge.ts` (`claimNextPendingUrlInternal`,
   `claimNextPendingFileInternal`) and `convex/knowledgeActions.ts`
   (`processWebsiteQueue`, `processKnowledgeFileQueue`). Copy that shape.
3. **Companies start when their schedule says.** No per-company offset. The
   queue sets the pace, so 200 companies on "Monday 09:00" is 200 order lists
   written at 09:00 and one steady stream of sends, and the screen never lies
   about the start time.
4. **Queued by default, live by company switch.** Queued is cheaper and a
   schedule nobody is waiting on does not need an instant answer.
5. **Pingback, not postback.** The callback carries only a task id. We fetch the
   result ourselves with our own credentials. A forged callback achieves nothing.
6. **One agent.** The `DataForSEO Agent` starts a cycle and stops. Fan-out,
   sending and parsing are plain plumbing — no model call, no agent run.
7. **The agent never sends.** Sending is the workers' job, so a single run can
   never post 100k tasks, and a crashed run cannot leave paid tasks untracked.
8. **Keyword discovery is one job; position tracking is many.** A site may have
   tens of thousands of ranked keywords. `domain_ranked_keywords` returns them in
   one call and is on for every site. Per-keyword position tracking
   (`serp_google_organic`, one task per keyword per cycle) is a registry job the
   plan can switch on, sized in the table below.
9. **Costs are the operator's own.** DataForSEO spend is absorbed and customers
   never see it. Every surface over pulls, cycles and rollups is super-admin only.
10. **Raw results live on the pull row with a TTL, metrics go to their own
    tables.** Raw SERP JSON kept *forever* would dominate storage cost; kept
    nowhere, a parser bug would mean buying a month of data again. So it is
    kept on the row and cleared by the sweep after its window.

    **Corrected 2026-09-21, during the build.** This said file storage. It
    cannot be: Convex file storage on this platform is swept of anything
    without an upload reservation, because the upload gateway is the registry
    for browser-uploaded files. A raw payload parked there would be deleted
    within the day, and threading internal payloads through a gateway built
    for user uploads with tokens and quotas would be the wrong shape entirely.
    `uploadIngressGuard.test.ts` is what caught it.
11. **Dashboards read rollups, never the pull table.** Same rule as
    `governanceDayRollups` and `inventoryRollups`.

11b. **The collection screens are global, never per company.**
    **Corrected 2026-09-21 by Anthony, against this plan's own build order,
    which had put a run history under the company's Data Collection tab.** Two
    reasons, and the second is the one that matters.

    The queue is one shared pipeline. A per-tenant slice of it describes
    something that does not exist, because companies do not have queues, the
    platform does.

    And every figure on these screens is Hakken's own spend. The company
    workspace is the half that becomes customer-facing later — "a second door
    onto the same logic" — so anything put there is something that has to be
    taken away again. Keeping collection out of it now removes a future
    migration rather than merely tidying a screen.

    A settings form and an operational log are also different kinds of screen.
    Data Collection is four cards and a switch, read once and left alone. A log
    grows forever, and under the form it pushes the one decision below the
    fold.
12. **No agent reads SERP text in this slice.** The collecting agent never sees
    results. Later analysis agents get normalised metrics, not page titles. That
    closes the prompt-injection path rather than fencing it.

### Records

Two new tables, one extended, two for metrics, one rollup. All in
`convex/schema.ts`, each with a doc comment as long as the others there.

**`seoCollectionCycles`** — one per company per collection run. What a screen
shows; what retention purges as a unit.

```
companyId, scheduleId?, agentRunId?, trigger: SCHEDULE | OVERRIDE_SWEEP | MANUAL
status: EXPANDING | SENDING | COLLECTING | DONE | CAPPED_PLAN | CAPPED_SPEND | FAILED
cursor?: companyWebsiteId          expansion resumes after this row
counts: { planned, reused, sent, ready, failed }
totalCostUsd
cappedReason?, error?
startedAt, finishedAt?
index by_company_started [companyId, startedAt], by_status [status]
```

**`seoCycleLines`** — one per (cycle, website, operation). This is how a cycle
refers to a pull it may not own: a pull made for Acme on Monday is a line in
Rival's Wednesday cycle with `reused: true`.

```
cycleId, companyId, websiteId, operationId, pullId, reused: boolean
index by_cycle [cycleId], by_pull [pullId], by_company_website [companyId, websiteId]
```

**`seoDataPulls`** — extended, not replaced.

```
status: PENDING | CLAIMED | SUBMITTED | READY | FAILED       (was SUBMITTED | READY | FAILED)
dueAt                    when a worker may send it
idempotencyKey           operation : websiteId : paramsHash : cycleDate
cycleId?                 the cycle that created it
claimedBy?, claimedAt?   worker id and time; how the sweep finds stuck rows
attempts                 sends tried; three and it is FAILED
pingedAt?                when the pingback arrived
resultJson               the raw response, cleared by the sweep after its window
rawTruncated?            true when the response was too large to keep at all
new indexes: by_idempotency [idempotencyKey], by_status_due [status, dueAt], by_task [taskId], by_cycle [cycleId]
```

`submittedAt` becomes the time the row was created; add `sentAt` for the time
it was posted, because those are now different.

**`seoWebsiteMetrics`** — hot, small, permanent. One row per website per day per
operation with the handful of numbers a screen plots.

```
websiteId, day (YYYY-MM-DD), operationId, pullId, metricsJson (small: counts, totals, top-level scores)
index by_website_day [websiteId, day], by_website_operation_day [websiteId, operationId, day]
```

**`seoKeywordPositions`** — hot, permanent, only written when position tracking
is on. One row per website per keyword per day.

```
websiteId, keyword, day, position?, url?, searchVolume?, pullId
index by_website_keyword_day [websiteId, keyword, day], by_website_day [websiteId, day]
```

**`seoDayRollups`** — what screens read. Scope is `company:<id>` or `platform`,
same shape as `knowledgeImportQuotas` uses for its scope key.

```
scopeKey, day, pulls, reused, sent, ready, failed, costUsd
index by_scope_day [scopeKey, day]
```

Nothing here goes on `websites`. Metrics are keyed by `websiteId` and read only
through a company's join row — see Part 3.

### The flow, step by step

**1. The clock.** The dispatcher finds the company's `schedules` row due, and
starts an agent run for the `DataForSEO Agent` exactly as it does for any other
agent. Nothing to build here.

**2. The order list is opened.** The agent's standing objective tells it to call
one tool, `seo_start_collection`, and finish. The tool handler (in
`REGISTERED_TOOL_HANDLERS`, `convex/aiToolExecutionService.ts`) inserts a
`seoCollectionCycles` row for the run's company at `EXPANDING`, schedules
`expandSeoCycle` with no cursor, and returns the cycle id. The agent run ends.
One model call per company per cycle is the whole model cost of the pipeline.

**3. The list is written in pages.** `expandSeoCycle` (internal mutation, new
file `convex/seoCollection.ts`) loads `SEO_EXPANSION_PAGE` company websites
after the cursor. A Convex mutation is a bounded transaction, so a single run
cannot write 100k rows — paging is not optional. For each website:

- Resolve its schedule with `resolveWebsiteSchedule` and skip it if not active.
  Decide if it is due with `isWebsiteDue`, using as `lastPulledAt` the newest
  `seoCycleLines` row for this company and website.
- Collect the targets: the website itself and every `trackedCompetitors` row
  under it. A competitor is pulled at the website's rate.
- For each target and each operation in the site's job list (every registry
  operation whose plan switch is on for this company), build the idempotency
  key and go through the **reuse ladder**:
  1. A `READY` pull with the same website, operation and params, completed
     within this website's resolved interval → write a line, `reused: true`,
     count `reused`. Send nothing.
  2. A `PENDING`, `CLAIMED` or `SUBMITTED` pull with the same key → write a
     line, `reused: true`. Somebody else has already asked; the answer will
     serve both.
  3. Otherwise insert a `PENDING` pull with `dueAt = cycle.startedAt + (n × SEO_DUE_SPACING_MS)`
     where `n` is the running count of sends in this cycle, and write a line
     with `reused: false`. Count `planned`.
- Check the plan limit as you go (Part 3, item 5). Over it: stop expanding,
  mark the cycle `CAPPED_PLAN`, leave the rows written so far.

Then reschedule itself with the last website as cursor. When the page is short,
mark the cycle `SENDING` and call `startSeoWorkers`.

The `dueAt` spacing is the whole fairness and rate-limit design. A twenty-task
tenant clears at once; a five-thousand-task tenant spreads itself over hours,
and a small tenant queued behind it is not stuck because its rows are due
sooner. No scheduler, no fairness algorithm.

**4. Helpers take trays.** `startSeoWorkers` schedules `SEO_WORKER_WIDTH` chains
of `processSeoQueue` (internal action, `convex/seoCollectionActions.ts`), the
same way `startKnowledgeFileQueue` fans out. Each chain:

1. Calls `claimSeoBatch` (internal mutation). This reads `by_status_due` for
   `PENDING` rows with `dueAt <= now`, takes up to `SEO_BATCH_SIZE` **of one
   operation** (one request goes to one endpoint), and in the same transaction
   patches them `CLAIMED` with a worker id and time. Claim and mark are one
   transaction on purpose: several chains are awake and a read-then-patch pair
   would hand the same row to two of them, and here that costs money. Before
   claiming it checks the spend cap (Part 3, item 6). Over it: claim nothing,
   mark the affected cycles `CAPPED_SPEND`, return empty.
2. For a `QUEUED` operation, posts the batch as one `task_post` request, each
   task carrying `tag = pull._id` and `pingback_url` pointing at the route in
   step 5. From the response it records, per task, the DataForSEO id and the
   cost, and patches each row `SUBMITTED` with `sentAt`. A task the response
   rejects is `FAILED` with the message. **A row that has a `taskId` is never
   posted again, by anyone, ever.** Re-posting is a second charge for data
   already bought; if you need its result, fetch it.
3. For a `LIVE` operation, sends as the endpoint allows, stores the raw body to
   file storage, patches `READY` with cost and `rawFileId`, and schedules
   `parseSeoResult`.
4. On a 429 or a 5xx, patches the batch back to `PENDING` with `attempts + 1`
   and `dueAt = now + backoff`, and chains itself after the backoff. Three
   attempts and the row is `FAILED`. This is what `processWebsiteQueue` does
   for Firecrawl.
5. Chains itself: at once if the batch was full; at the next `dueAt` if rows
   are pending but not yet due; **not at all** if nothing is pending. An empty
   queue runs nothing. The owner does not want a per-minute cron here.

**5. Replies come back.** `POST /api/seo/pingback` in `convex/http.ts`, taking
`id` and `tag` from the query string as DataForSEO sends them. The handler:

1. Looks the id up on `by_task`. No row, or a row not at `SUBMITTED` → `200`
   with an empty body and nothing else. This is the cheap miss that makes a
   forged or replayed callback worthless, and it is what stops a flood of made-up
   ids turning into a flood of our own fetch calls.
2. Patches `pingedAt` and schedules `fetchSeoResult(pullId)`.
3. Returns `200`. Nothing is parsed inline. Their timeout is ten seconds and a
   handler that parses inline starts failing exactly when volume makes it
   matter.

`fetchSeoResult` (internal action) GETs the registry's `resultPath` with our
credentials, stores the raw body to file storage, patches `READY` with the cost
DataForSEO reports and `rawFileId`, bumps the cycle counts and the day rollup,
and schedules `parseSeoResult`. A task DataForSEO reports as failed is `FAILED`
with its message.

**6. Filing.** `parseSeoResult(pullId)` reads the raw file and writes
`seoWebsiteMetrics` and, for position tracking, `seoKeywordPositions`. One
parser per operation, in a new `convex/dataForSeoParsers.ts` beside the
registry, pure and unit-tested against a saved sample response. Parsing is
idempotent: rows are keyed on `pullId` and re-parsing replaces them, so a parser
bug is fixed by re-running parse over the raw files, not by re-buying data.
When every line of a cycle is `READY` or `FAILED`, the cycle is `DONE`.

**7. Rollups.** Every transition to `READY` or `FAILED` increments the company's
and the platform's `seoDayRollups` row for that day. Screens read only those.
No screen sums `seoDataPulls`.

**8. The hourly walk.** One cron, `seo-collection-sweep`, registered in
`convex/crons.ts` through `internal.jobLedger.runJob` like every other job, so
it appears on the jobs screen with its overdue flag. Hourly, not minutely: it
exists to catch failure, not to drive normal operation. It:

- returns `CLAIMED` rows older than `SEO_CLAIM_TIMEOUT_MS` to `PENDING`;
- for `SUBMITTED` rows older than an hour with no `pingedAt`, calls each
  family's `tasks_ready` and schedules `fetchSeoResult` for any of ours it
  lists;
- marks `SUBMITTED` rows older than `SEO_RESULT_TIMEOUT_MS` as `FAILED`
  ("no result");
- closes cycles whose lines are all settled;
- starts an `OVERRIDE_SWEEP` cycle for any company with a website whose own
  override makes it due now (a daily site under a weekly company is only ever
  reached this way — see open questions);
- calls `startSeoWorkers` if any `PENDING` row is due. A second set of chains
  next to a live one is harmless because claiming is atomic, so liveness does
  not need tracking.

**9. Retention.** Follow the existing retention job pattern — look first; do
not add a new purge mechanism. Raw files are deleted after
`SEO_RAW_RETENTION_DAYS`; the pull row stays, because it is the cost record.
Cycles and lines are purged after `SEO_CYCLE_RETENTION_DAYS`. Metrics are
permanent. Because a pull can belong to several companies' cycles, **pulls are
purged by age, never by cycle.**

### Sizing

Set once, in `convex/seoCollectionPolicy.ts`, with a comment on each saying why.

| Constant | Value | Why |
| --- | --- | --- |
| `SEO_EXPANSION_PAGE` | 100 websites | one mutation stays well inside Convex limits with competitors and ~6 operations each |
| `SEO_WORKER_WIDTH` | 4 | enough for domain-level; raise to 8 when position tracking is on |
| `SEO_BATCH_SIZE` | 100 | DataForSEO's per-request cap on the endpoints checked; confirm per endpoint |
| `SEO_DUE_SPACING_MS` | 250 | a 5,000-task tenant spreads over ~20 min; a 20-task tenant is instant |
| `SEO_CLAIM_TIMEOUT_MS` | 10 min | a claim older than this belongs to a dead chain |
| `SEO_RESULT_TIMEOUT_MS` | 24 h | DataForSEO's queued results are usually minutes; a day means it is not coming |
| `SEO_MAX_ATTEMPTS` | 3 | same as the knowledge queue |
| `SEO_RAW_RETENTION_DAYS` | 30 | long enough to re-parse after a parser bug |
| `SEO_CYCLE_RETENTION_DAYS` | 90 | one quarter of history on the collection screen |

What position tracking does to the numbers: a site with 10,000 tracked keywords
is 10,000 queue rows a cycle, roughly six dollars at DataForSEO's queued rate,
and 100 `task_post` calls. A thousand such sites weekly is real money. The
agent's spend cap is the brake, and the batch size is what keeps the call count
sane. The per-plan keyword allowance (open question 1) is what keeps it
predictable.

### The DataForSEO connector and agent

- **Connector definition** in `BUILT_IN_TOOL_CONNECTORS`,
  `convex/toolConnectorDefinitions.ts`. Tools:
  - `seo_list_operations` — the registry's model-facing descriptions.
  - `seo_start_collection` — step 2 above. Only meaningful from a scheduled
    run.
  - `seo_request` — enqueue one operation for one host the company holds. Goes
    through the **same** reuse ladder and enqueue function as expansion, so an
    ad hoc ask cannot buy something we already have. This is the "second door"
    the customer-facing version will also use.
  - `seo_read_metrics` — normalised metrics for a host the company holds.
    Metrics only. Never raw results, never SERP titles or snippets.
- **Handlers** in `REGISTERED_TOOL_HANDLERS`, `convex/aiToolExecutionService.ts`.
- **Template** `DataForSEO Agent` in `convex/agentTemplates.ts`, with a standing
  objective that says, in effect, "start the collection cycle for your company
  and stop". The Data Collection screen looks for that exact name.

### Build order

Each step ends green on the full guard list below and on `npx convex dev
--once`. Commit after each step on `dev`.

**Steps 1 to 11 were built on 2026-09-21 and are committed.** What the build
found is recorded against each step; the two corrections it forced are decision
10 and decision 11b above.

1. **Fix the four failing UI tests** left by the schedules rework. They assert
   the old cadence shape: `src/app/(dashboard)/admin/websites/page.test.tsx`
   (2), `src/app/(dashboard)/admin/websites/[websiteId]/page.test.tsx` (1),
   `src/app/(dashboard)/admin/companies/[id]/websites/site/[companyWebsiteId]/page.test.tsx`
   (1). Everything else is green. **Done.** Both of the `page.test.tsx`
   failures had a second cause worth knowing: with the cadence word gone every
   fixture fell through to "not fetched", so the test looking for that phrase
   found it twice and could not say which row it had.
2. **Schema.** The tables and extensions in "Records". Classify every new table
   in `convex/personalDataService.ts` — the tests fail until you do. Schema
   comments as long as the existing ones. **Done.** None of the new tables
   holds a link to a person, so the classification test passes without a rule;
   add one the moment that changes.
3. **Policy and idempotency.** `convex/seoCollectionPolicy.ts` (constants) and
   the key builder, pure, with tests: same inputs give the same key, param order
   does not matter, a different cycle date gives a different key. **Done**, 10
   tests. Keyword order *is* significant, because DataForSEO returns results
   positionally and a reordered list is a different request.
4. **Expansion.** `expandSeoCycle` and the reuse ladder in
   `convex/seoCollection.ts`. Tests: a fresh result is reused and nothing
   inserted; an in-flight pull is reused; a stale one is re-planned; `dueAt`
   spacing; cursor resumes; plan cap stops it with the right status; nothing is
   written for an inactive website; competitors follow their website's rate.
   **Done**, 10 tests. Pin any test of a weekly schedule to real dates: whether
   one is due depends on the weekday, and a floating clock makes it pass or
   fail by the day it runs.
5. **Workers.** `claimSeoBatch`, `startSeoWorkers`, `processSeoQueue`,
   `fetchSeoResult`. Tests: two claims never overlap; a row with a `taskId` is
   never posted; 429 backs off and increments attempts; the chain stops on an
   empty queue; spend cap blocks a claim and marks the cycle. Use the sandbox
   for anything that touches the network. **Done**, 14 tests. `postDataForSeoTask`
   now wraps a batch version rather than duplicating it, and a 429 or 5xx
   raises `DataForSeoBackoff`, which is caught at the one call site and turned
   into a queue release — a rate limit is "later", not a failed attempt.
6. **Pingback route** in `convex/http.ts`. Tests: unknown id is a no-op 200; a
   row not at `SUBMITTED` is a no-op; a good id schedules exactly one fetch.
   **Done.** The route never logs the query string: it is attacker-chosen text.
7. **Parsers** in `convex/dataForSeoParsers.ts`, one per operation, from saved
   sample responses. Re-parse replaces, never duplicates. **Done**, 10 tests,
   including one asserting that a result title written to read as an
   instruction never appears in the parsed output — it is not filtered, it is
   never read.
8. **Rollups and sweep.** `seoDayRollups` updates, `seo-collection-sweep` in
   `convex/crons.ts` via `jobLedger`. Tests for each sweep duty. **Done.** A new
   cron also needs a cadence in `EXPECTED_EVERY_MINUTES` in `jobLedger.ts`, or
   `cronsWiring.test.ts` fails.
9. **Connector, handlers, template.** Wire the four tools and the agent
   template. Run the Data Collection screen; the banner should go away.
   **Done**, and it does — but only after the banner was given a button, since
   no screen offered the flow its own words described. Adding a handler also
   means updating the expected list in `aiToolExecutionService.test.ts`.
10. **Screens** (super-admin only). **This step as written was wrong and was
    corrected during the build — see decision 11b.** It said to put a company's
    cycles under that company's Data Collection tab. What was built instead is
    one global screen at `/admin/websites/collection`, with a run detail behind
    it, and the company's tab left as a settings form. **Done.** Fluid layouts,
    theme tokens, `Button` from the screen kit, and alignment measured with
    `getBoundingClientRect` rather than judged from a screenshot.
11. **Retention.** Hook the two purges into the existing retention job.
    **Done**, in the hourly sweep rather than the retention job, because both
    purges are bounded passes over the same tables the sweep already walks.
    Raw payloads are cleared and the pull row is kept, because the row is the
    cost record and has to stay checkable against an invoice.
12. **Docs.** `docs/developer/workflow-automation.md` and
    `docs/developer/workflow-runtime-internals.md` get a section on the SEO
    cycle; this plan gets a "Built" date. **Done.** Automation covers the
    schedule and inheritance side, internals covers the runtime: chunked
    expansion, claim-before-send, the pingback boundary, why raw payloads are
    not in file storage, and the tenancy rule.

### Where it stands

Everything above is committed on `dev` and deployed.

The pipeline has run only against its own tests and one manual cycle, which
correctly planned nothing because the company it ran for had collection
switched off. It has never spoken to DataForSEO.

It stays that way by design until three switches are thrown, and each is
deliberately somebody's decision rather than a default. Credentials —
`DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, and `DATAFORSEO_SANDBOX=1` while the
first bill is still a surprise — live in the backend environment and are read
by `dataForSeoRest.ts` alone. The connector is defined but not added, so the
agent created from its template holds no tools. And no company has collection
switched on, because absent reads as off.

That is not an oversight in any of the three cases. It is the same rule three
times: nothing here starts spending because it was merely installed.

### Guards that must pass

`npm run check:messages`, `check:screen-kit`, `check:encoding`,
`check:pagination`, `check:layering`, `check:orphans`, `check:fences`, and in
`src/`: `theme-drift`, `doc-path-drift`, `module-size-drift`,
`no-client-specific-fallbacks`, plus `convex/personalDataService.test.ts`.

Two that catch people out:

- `check:screen-kit` freezes the count of raw `<button>` and `<input>` per
  file; a new file may have none. Use `Button` with a variant and override with
  `className`. Adding a file to `scripts/screen-kit-allowlist.json` is not the
  fix.
- `no-client-specific-fallbacks` rejects the string "Hakken" in backend and
  admin copy. The platform name is configurable.

And the Convex gotcha: `npx convex codegen` writes types locally and does not
deploy. New functions 404 at runtime while tests stay green. Always finish with
`npx convex dev --once`.

## Part 3 — Security

The owner's main concern. Each rule names the test that keeps it true.

1. **Tenancy lives only on the join rows.** `websites` is shared, so the record
   implicitly knows that Acme and Acme's rival both track the same host. No
   query may start from `websites` and walk outward to its watchers, and no
   query may return metrics for a website id the caller has not proved a hold
   on. Build one internal helper, `requireCompanyWebsite(ctx, companyId, websiteId)`,
   that resolves a website only through a `companyWebsites` or
   `trackedCompetitors` row for that company, and route every metric read
   through it. **Test:** a grep-style drift test that no file outside
   `convex/websites.ts` and that helper reads `websites` by id or index, and a
   unit test that a company asking for a host it does not hold gets the same
   "not found" as a host that does not exist.
2. **Reuse is a side channel, and a small one.** Because the fastest watcher sets
   the pace, a customer could infer that someone else with a faster cadence
   tracks a host they track, from data arriving fresher than they asked for. No
   list leaks, only timing. Accepted 2026-09-21. Do not "fix" it by showing the
   pull's originating company anywhere a customer can see.
3. **The webhook trusts nothing.** It is a public URL and cannot carry an auth
   header. It takes the task id, checks it against our own `SUBMITTED` rows, and
   fetches the result with our credentials. An unknown id is a cheap `200` and
   nothing else. **Test:** step 6 above. Also: the route never logs the query
   string, because a forged one is attacker-chosen text.
4. **Result text is data, never instruction.** SERP results are text from the
   open web; a page whose title is an instruction is a prompt injection waiting
   for an agent to read it. In this slice no agent reads results at all.
   `seo_read_metrics` returns numbers and keys. **Test:** the tool's return
   validator has no free-text field from a result.
5. **Plan limits are enforced server-side at enqueue.** A customer adding ten
   thousand keywords does not set our throughput. The expansion mutation counts
   against the company's plan and stops with `CAPPED_PLAN`. The customer can
   act on that; only the operator can act on `CAPPED_SPEND`, so the two are
   never merged. **Test:** step 4 above.
6. **Spend cap before every batch.** Checked in `claimSeoBatch`, not once at
   run start, because a cycle runs for hours after the run that opened it has
   ended. The cap is the agent's `maxCostGBP`; pull costs are USD as DataForSEO
   reports them (never converted on the way in, so they can be checked against
   an invoice). Convert at the point of comparison only — see open question 3.
7. **Credentials stay in the backend environment.** `convex/dataForSeoRest.ts`
   reads them; nothing else does. Never in a document, a log, a test fixture or
   a commit. The secret-ref policy already rejects stored raw secrets. When you
   need to know whether they are set, check for presence in code and report
   yes or no.
8. **Cost surfaces are super-admin only.** Every query over `seoDataPulls`,
   `seoCollectionCycles`, `seoCycleLines` and `seoDayRollups` is an admin query
   with the super-admin gate. A company admin never sees a dollar figure.
9. **Deleting is scoped.** Removing a company's hold on a website deletes its
   join rows and its cycle lines, and nothing shared. The `websites` row,
   pulls and metrics survive for everyone else. Only All Websites deletes a
   website outright, and it names the companies affected first.

## Open questions

Ask the owner before deciding. Keep it to one line each.

1. **Keyword allowance per plan.** Position tracking is one task per keyword per
   cycle. How many keywords may a plan track per site, and is the default on or
   off? This sizes `SEO_WORKER_WIDTH` and the storage policy.
2. **Faster overrides.** A website set to daily under a weekly company is only
   reached by the hourly sweep in this design. Is that acceptable, or should an
   override be limited to "slower or off"?
3. **Currency at the cap.** The agent cap is GBP and DataForSEO costs are USD.
   Compare using an existing platform rate if one exists (look first), else a
   super-admin backend setting for the rate. Which?
4. **Manual "collect now".** A button on the Data Collection screen that opens a
   `MANUAL` cycle would help testing and support. In this slice or later?

## Not in this plan

No countries, no path-level targets, no ownership verification, no
customer-facing screens, no crawler, no on-page audits, no P&L beyond the cost
rollups, no analysis agents reading results.
