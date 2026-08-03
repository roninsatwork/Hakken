# Comax Opportunity Report Plan

Written 2026-08-03, after the CRM, the research agent, and the autopilot job
landed. This is the piece the client has been building towards: a report that
puts a pound figure on the business they are not yet winning.

## Where this has got to

Built on 2026-08-03, steps 1–3 of the order of work: the matching and gap
rules as pure tested code (22 tests), the `salesOpportunityReports` table, the
three tools and their connector ("Comax Opportunity Report"), the
`startOpportunityReport` mutation with its watchdog (11 backend tests), and
the screen at `/app/<workspace>/opportunity-report` with its hero grid, two charts,
ranked tables, run button and phase-driven progress bar. 3,929 tests pass.
The screen was verified rendering in the real app.

Setup done the same day through the admin screens: the connector installed,
the three tools switched on for the **Comax - Opportunity Report Agent**
(which Anthony had already created), and its job and brief saved.

Not yet done: step 4, the proving run on the real workspace against the nine
acceptance rules. It starts a paid agent run, so it waits for Anthony's
go-ahead, per the standing rule that nothing starts a run unasked.

## What the first live press taught (2026-08-03)

Anthony pressed Run himself, and the run failed in a way worth recording:

- **A new agent defaults to asking a person before any write.** Nobody set
  it; `getToolConfirmationRequired` parks any non-read tool call unless
  `autonomousToolExecution` is on. The run's first act was a write, so it sat
  in the approval queue for five minutes behind a bar stuck on step 1.
  Fixed by switching the agent's Human Approval off (= autonomy on), the same
  footing as the research agent — its tools can only write the report row.
- **A run resumed after approval loses its thread.** Approved, it ran the
  pricing pass, then declared the whole job done — two of three tools never
  called. That is a platform fault in the resume path, owned by the Agent
  Autonomy And Approvals Plan; filed as its own task. The tool results
  already say "call X next" and the model still stopped, so the fix does not
  belong in this vertical.
- **The screens told two lies and now tell none.** The finished modal said
  "Report ready" over a failed report (it now reports the real ending and
  reason), and the bar gave no sense of distance (it now shows "Step 1 of 3
  · 25%" and real counts as each pass lands — Anthony: *"the other progress
  bars inside the Comax section all have totals"*).
- **A run that dies after both computed passes no longer fails the report.**
  Every figure is already real and on the row; the watchdog now finishes it
  as Complete-with-exceptions, with "the agent never wrote its summary" on
  the exception list, instead of binning computed numbers for want of prose.
- The page also moved and changed clothes the same day: from under Reports to
  the workspace group beside Customers (where Anthony went looking for it),
  and from the Sales Report's premium dress to the section's flat dialect
  (*"we have designs for how pages look and this does not follow that"*).

## What it has to do

One button, one agent — **Comax - Opportunity Report Agent** — one report, two
sections:

1. **Prospect opportunities.** For every prospect on file, find the existing
   customers most like it — same kind of business, similar size, ideally in the
   same parent group — and use what those customers actually spend to estimate
   what the prospect would be worth as a customer over six months. The section
   is a ranked list: prospect, who it was compared to, the estimated revenue,
   and how confident the comparison is.
2. **Gaps inside groups.** For every customer that belongs to a chain, find the
   product categories its sibling sites buy that it does not — one home in a
   group buys toilet rolls, the other four do not — and price each gap from
   what the siblings actually spend. The section is a ranked list: customer,
   the category it is missing, how many of its siblings buy it, and the
   estimated revenue.

The report lives on a new screen under Reports, styled like the existing Sales
Report: headline hero boxes for the totals, charts for the shape of the
opportunity, the two ranked tables underneath, and a button that runs the agent
with a live progress bar while it works.

Both figures answer the same question the client keeps asking: **if we
converted these prospects and closed these gaps, what would it be worth?**

## The data truths the report is built on

These are facts about the schema today, and the report's honesty depends on
respecting them:

- **A customer is a row in the current import; a prospect is a row the
  research agent filed.** `salesDataAccounts` is the customer directory,
  `salesDataProspects` (status `NEW`) is the prospect list. Prospects inherit
  their group and customer type from the group's existing members, so every
  prospect already knows whether it is a care home or a school.
- **Bedrooms and pupils live on `salesDataCustomers`**, filled in by the
  research agent or typed by a person — never by the import. Which one applies
  is decided by `extraFieldForType` in `convex/salesDataCustomerFields.ts`.
  Some prospects and some customers will have no size on file. The report must
  say so, not guess silently.
- **Spend is exactly six months.** The workbook holds six period columns and
  nothing older; `salesDataAccounts.totalRevenue` is the six-month figure the
  customer screens already show. "Average over the six months" is this data —
  there is no longer history to reach for.
- **A group is a shared name, not a record.** Membership is "same
  `groupNameKey`" on `salesDataAccounts` and `salesDataProspects`. Note that
  `salesDataRows.parentAccount` is the account *code*, not the parent group,
  despite its name.
- **Category spend per customer** comes from `salesDataRows` (one row per
  account × product, with `productCategory` and `totalRevenue`), read through
  the existing `by_company_import_account_name` index.
- **Everything is scoped by `companyId` and keyed to the current import.** A
  re-import replaces the sales data wholesale, so a report is a snapshot of
  one import and says which.

## The design

### The sums are code; the agent is the conductor and the narrator

The matching rules and the gap rules are the whole feature, so they live in a
pure, tested service file — the same decision the prospect matcher made in
`convex/salesDataProspectMatching.ts`, and for the same reason: each rule can
be proven on its own, and the report is **built from the rows in the database,
not from what the agent says it did**.

The agent does what only an agent can do: it runs the tools in order, reads
the computed results, writes the executive summary a person will actually
read — which opportunities matter most and why, in plain sentences — and
records anything it could not do. The model never invents a number. Every
figure on the screen is traceable to the deterministic pass that produced it.

### The matching rules (section one)

For each prospect with status `NEW`:

1. **Size it.** Read bedrooms or pupils from `salesDataCustomers` keyed on the
   prospect's key — the research agent files prospect details in the same
   table, so a researched prospect already has its size where the report can
   reach it.
2. **Find comparables.** Candidates are customers of the same customer type
   whose size is on file. Same parent group first; if the group offers fewer
   than two sized comparables, widen to every customer of that type in the
   workspace, and say the comparison widened.
3. **Estimate.** Work out spend-per-bed (or per-pupil) for each comparable —
   six-month spend divided by size — take the median, and multiply by the
   prospect's size. Per-unit rates are used rather than nearest-neighbour spend
   so a 60-bed prospect compared against 40-bed customers is scaled honestly,
   and the median keeps one odd customer from bending the answer.
4. **Fall back honestly.** A prospect with no size on file is estimated from
   the plain average six-month spend of its group's customers (or its type's
   customers if the group has none), and is marked **unsized** with a lower
   confidence. The headline counts how many prospects were sized and how many
   were not — the unsized count is also the advert for running the research
   agent again.
5. **Explain every number.** Each row records which customers it was compared
   to, the per-unit rate used, and the confidence tier (same group and sized,
   same type and sized, unsized). The screen shows the working, not just the
   answer.

### The gap rules (section two)

For each group with at least two customers in the current import:

1. Build the set of product categories each member buys from `salesDataRows`.
2. For each category bought by at least one member, every member **not**
   buying it has a gap. Absent months are absence of sale, not zero — a
   category counts as bought if any of the six periods carries revenue.
3. Price the gap at the **median six-month spend in that category among the
   siblings who buy it**, scaled by size where both sides have bedrooms or
   pupils on file, unscaled and marked as such where they do not.
4. Confidence follows coverage: a category four of five siblings buy is a
   strong gap; a category one of five buys is listed but ranked beneath it.
   Each row records the sibling count either way.

### One report record, honest progress

A new table, `salesOpportunityReports` — following the shape of
`salesReports`, which already proves the pattern of an agent writing an
artifact a screen displays:

- `companyId`, `importId` (which snapshot it describes), `runId`, `agentId`,
  `requestedBy`, `startedAt`, `completedAt`.
- `status`: `RUNNING | COMPLETE | COMPLETE_WITH_EXCEPTIONS | FAILED`, and
  `phase`: `MATCHING | GAPS | SUMMARY | DONE` with done/total counts per
  phase, so the progress bar is one number from one place — the same idiom the
  research job proved.
- Headline figures: total opportunity, prospect-section total, gap-section
  total, prospects sized and unsized, gap count, groups examined.
- The two sections as rows: prospects with their comparables, estimates and
  confidence; gaps with their category, sibling coverage and estimate.
- `summary`: the agent's narrative, stored as markdown and rendered with the
  same component the Sales Report uses.
- `exceptions`: what could not be done and why — "3 prospects unsized", "group
  X has one member, no gap analysis possible" — shown on the report, not
  hidden in logs.

The newest `COMPLETE` report is what the screen shows. History stays in the
table; superseding is by recency, matching how `getLatestReport` works today.
Old reports for superseded imports remain readable but the screen labels which
import a report describes.

### The agent and its tools

**Comax - Opportunity Report Agent** is a normal `agents` row with three new
tools, registered in `aiToolExecutionService.ts` and catalogued in
`toolConnectorDefinitions.ts`, all tenant-scoped from the run context exactly
as the `salesCustomers.*` tools are:

- `opportunityReport.matchProspects` — runs the whole deterministic matching
  pass, writes the prospect section onto the report row, updates phase
  counts, and returns the computed results for the agent to read.
- `opportunityReport.findGroupGaps` — the same for the gap pass.
- `opportunityReport.saveSummary` — takes the agent's narrative and
  exceptions, marks the report `COMPLETE` (or `COMPLETE_WITH_EXCEPTIONS`), and
  refuses a summary that names a figure not present in the computed sections —
  the "claimed, not recorded" rule applied at write time rather than
  read time.

The agent's standing objective: run matching, run gaps, read both, write the
summary, save. Four to six tool calls in one run — the default platform
budget covers it several times over, and the deterministic tools mean the
spend is a few pennies of narration, not a research sweep. No multi-run job
machinery is needed; the report row itself carries the progress the bar
reads. A run-level cost ceiling of £1 is set on the agent as a guard.

### Triggering, and who may press the button

`startOpportunityReport` is a `tenantMutation` copying the shape
`startResearchJob` proved: refuse if a report for this workspace is already
`RUNNING`, insert the report row, insert the `agentRuns` row (`QUEUED`, titled
`Opportunity report · <import file name>`), schedule
`runTriggeredAgentObjective`. A stall guard marks a report `FAILED` if its run
dies without settling it, so the button can never be locked out by a dead run.

The button starts an agent run, which spends money. It is pressed by a
person, on the screen, every time. Nothing schedules it.

### The screen

`/app/<workspace>/opportunity-report`, a `SubNavItem` in the workspace's own
sidebar group beside Customers — first placed under Reports, moved the same
day when Anthony went looking for it beside Customers and did not find it;
where a person looks is where a screen belongs. It sits inside the workspace
section's layout gate, so it is fenced with the vertical and switched on by
the same module flag as the rest of the sales data section.

The page follows the premium dialect of `/app/reports` and the component
inventory of the AI Costs screen:

- **Hero grid** (`MetricBlock` pattern, hero box spanning two columns): total
  six-month opportunity as the headline number, then prospect revenue, gap
  revenue, and prospects priced (sized vs unsized) as the supporting boxes.
- **Charts** (recharts, theme tokens, `ChartExportWrapper`): opportunity by
  parent group (bar), and gap revenue by product category (bar) — both built
  from the report row, no synthetic data anywhere on the page. The hardcoded
  radar-chart numbers on the Sales Report are the anti-pattern and are not
  copied.
- **Two ranked tables**: prospect opportunities (site, group, size, compared
  to, estimate, confidence) and group gaps (customer, category, siblings
  buying, estimate), sorted by estimate, with the working visible on each row.
- **The agent's summary** rendered above the tables, labelled as the agent's
  reading of the computed results.
- **Run control**: the toolbar idiom from the customers screen — the button
  (disabled while running), the live progress bar driven by the report row's
  phase counts, a line saying what it is doing now, and the completion state
  with exceptions listed. Empty state before the first run explains what the
  report does and that it needs researched prospects to be useful.
- Every string in `messages/en.json` **and** `messages/it.json`, new
  `salesData.opportunityReport` namespace — the i18n structure test fails the
  build otherwise.

## How we will know it worked

Acceptance rules, all proven on the real Comax workspace:

1. Pressing the button produces a report from a single run, with the progress
   bar moving through matching, gaps and summary, and no admin screen needed.
2. Every prospect with status `NEW` appears exactly once in section one, with
   an estimate, the customers it was compared to, and a confidence tier — or
   appears in the exceptions with the reason it could not be priced.
3. A sized prospect's estimate equals the median per-unit rate of its named
   comparables times its size, reproducible by hand from the rows on screen.
4. Every gap row names a category at least one sibling genuinely buys in the
   current import, and its estimate is reproducible from the siblings' spend.
5. No number on the screen exists anywhere but the report row, and no figure
   in the agent's summary is absent from the computed sections.
6. Pressing the button while a report is running shows the running one rather
   than starting a second; a run that dies leaves the report `FAILED` with a
   reason, and the button works again.
7. A re-import followed by a fresh run produces a report labelled with the new
   import; the old report remains readable and labelled with the old one.
8. The screen matches the Reports dialect, exports its charts, works in both
   languages, and the i18n structure test passes.
9. The whole run costs pennies, the cost is visible on the run record, and
   nothing starts without a person pressing the button.

## Order of work

1. The matching and gap services as pure, tested rule files, plus the
   `salesOpportunityReports` table and its queries. — one day
2. The three tools, their registration and connector definitions, the agent
   created and bound, and `startOpportunityReport` with the stall guard. —
   one day
3. The screen: hero grid, charts, tables, summary, run control, empty state,
   both languages, sidebar entry. — one day
4. Prove it on the real workspace against all nine rules, with the research
   data already on file. — half a day

Roughly three and a half days.

## What this plan does not do

- It does not schedule itself. A person presses the button, because it starts
  a paid run.
- It does not change what a prospect is, how prospects are found, or the
  matching rules that stop a discovered site duplicating a customer — the
  Workspace Customer Research Agent Plan owns those.
- It does not write to customers, prospects, or research findings. The
  report's tools write only to `salesOpportunityReports`.
- It does not touch the imported spreadsheet, ever.
- It does not create opportunities in any external CRM. If the report earns a
  follow-on action, that is a new conversation.
