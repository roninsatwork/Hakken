# Market Discovery Agent Plan

Written 2026-08-04, after the customer research agent, warm-chain prospecting
job, and opportunity report were in place.

## What this is

This is a new lane for finding cold prospects by customer type.

The existing prospecting agent does one deliberately narrow job: it looks at
parent groups the workspace already sells to, then finds other sites inside
those known groups. Those are warm prospects, because the sales story is "we
already supply your sister sites".

Market discovery is different. It searches outside the imported customer list:

1. Read every customer type in the current import.
2. Find 2 parent companies per customer type that the workspace does not
   already sell to.
3. Prove each parent company exists and belongs to its type.
4. Find that parent company's locations.
5. Add those locations as prospects, clearly marked as market-discovery
   prospects rather than existing-chain prospects.

This is a good demo because it turns the imported customer mix into a visible
growth list. It must not be squeezed into the current "Find new prospects"
button, because that button's safety rule is exactly the opposite: it refuses
groups that are not already in the spreadsheet.

## Product shape

### One new action on the Customers screen

Add a separate button beside the existing research controls:

`Find new groups`

The button starts immediately. No setup modal:

- customer types are read automatically from the current import;
- the v1 target is 2 parent groups per customer type;
- spend is governed by the Market Discovery Agent's own live runtime limits;
- the progress bar is the user's control surface.

### Clear prospect source labels

The customer/prospect list should distinguish:

- `Customer` - imported account;
- `Existing-chain prospect` - a site found inside a group the workspace already
  supplies;
- `Market-discovery prospect` - a site found under a newly discovered parent
  group.

The opportunity report should either filter or label market-discovery prospects,
so a salesperson can separate warm expansion from colder market growth.

## Progress bar requirement

This feature must have the progress bar from the start.

The person watching it needs to see:

- phase name: finding parent groups, checking groups, finding locations, done;
- current item: the group or source being worked now;
- parent groups target and accepted count, for example `7 of 12 groups found`;
- locations filed count;
- duplicates skipped count;
- review/uncertain count;
- spend used against the job ceiling;
- stop button;
- final state: complete, complete with exceptions, stopped, or failed.

Do not report progress from raw agent runs. The progress bar reads one job row
and that job row is updated by the tools as work lands. This follows the
research autopilot pattern: a run is just labour; the job is the thing a person
understands.

Suggested phase weights for the bar:

| Phase | Weight | Meaning |
| --- | ---: | --- |
| Setup | 5% | job created, agent and tools resolved |
| Find parent groups | 35% | target parent companies discovered or skipped |
| Verify parent groups | 20% | source proof accepted, duplicates removed |
| Find locations | 35% | sites added as prospects or skipped as duplicates |
| Finish | 5% | summary, exceptions and final status written |

The bar should also show real counts beside the percentage. A percentage alone
is not enough for this demo.

## Data model

### `salesDataMarketDiscoveryJobs`

One row per market-discovery press.

Fields:

| Field | Meaning |
| --- | --- |
| `companyId` | Workspace scope |
| `customerTypeKey`, `customerType` | Summary label; v1 uses all customer types |
| `customerTypes` | The imported customer types and target of 2 groups each |
| `targetGroupCount` | Total target across all customer types |
| `status` | `RUNNING`, `COMPLETE`, `COMPLETE_WITH_EXCEPTIONS`, `STOPPED`, `FAILED` |
| `phase` | `SETUP`, `FIND_GROUPS`, `VERIFY_GROUPS`, `FIND_LOCATIONS`, `DONE` |
| `agentId`, `runId`, `startedBy` | Ownership and traceability |
| `groupsAccepted`, `groupsRejected`, `groupsDuplicate`, `groupsNeedsCheck` | Parent group progress |
| `locationsFiled`, `locationsDuplicate`, `locationsNeedsCheck` | Location progress |
| `currentLabel` | What the progress line names now |
| `maxCostGBP`, `spentGBP` | Cost boundary and live spend |
| `startedAt`, `updatedAt`, `finishedAt` | Lifecycle |
| `endedReason` | Plain final line for the user |

### `salesDataMarketDiscoveryGroups`

One row per discovered parent company.

Fields:

| Field | Meaning |
| --- | --- |
| `companyId`, `jobId` | Scope and discovery run |
| `groupName`, `groupNameKey` | Parent company name |
| `customerType`, `customerTypeKey` | Claimed customer type |
| `website`, `sourceUrl`, `sourceName` | Proof source |
| `reasoning` | Why this is a real parent company of this type |
| `status` | `ACCEPTED`, `NEEDS_CHECK`, `DUPLICATE`, `REJECTED` |
| `runId`, `agentId`, `foundAt` | Traceability |

Duplicates are checked against:

- existing `salesDataAccounts.groupNameKey`;
- existing `salesDataProspects.groupNameKey`;
- earlier `salesDataMarketDiscoveryGroups.groupNameKey` rows in the same
  workspace.

### `salesDataProspects` additions

Add optional fields so existing rows validate safely:

| Field | Meaning |
| --- | --- |
| `origin` | `EXISTING_CHAIN` or `MARKET_DISCOVERY`; absent means existing-chain for old rows |
| `marketDiscoveryGroupId` | The discovered parent group row, when applicable |
| `marketDiscoveryJobId` | The job that filed it |

Existing-chain prospecting keeps its current behaviour and writes no market
discovery fields.

## Agent and tools

The user's blank Market Discovery Agent becomes the worker for this lane. It
should not hold the existing warm-chain prospect write tool unless it also needs
the shared web reader. It gets its own market-discovery tools so the two
prospecting modes cannot drift into each other.

Tool set:

1. `marketDiscovery.job.next`
   - Returns the next task for the current market-discovery job.
   - The job is authoritative, exactly as the research autopilot is.

2. `marketDiscovery.groups.record`
   - Records one parent company candidate.
   - Requires customer type, group name, source URL, website if known, and
     reasoning.
   - Refuses duplicates already in the workspace.

3. `marketDiscovery.groups.review`
   - Lets the job mark accepted, duplicate, needs-check or rejected outcomes.
   - For v1 this can be automatic for high-confidence findings and review-only
     for uncertain ones.

4. `marketDiscovery.locations.read`
   - Gives the agent an accepted parent company and the known customer/prospect
     sites it must not re-file.

5. `marketDiscovery.locations.record`
   - Records a location as a prospect with `origin: MARKET_DISCOVERY`.
   - Requires a source page listing that location.
   - Reuses the existing prospect matching rules for name/postcode duplicates.

The agent's prompt must say:

- work through the customer types the job hands out;
- do not use groups already in the workspace;
- do not infer parent companies from search snippets;
- prove the parent company exists from a page the run opened;
- prove it belongs to the active customer type;
- prefer official/provider-owned location lists;
- file locations as you find them;
- stop when 2 accepted parent groups have been found for every imported
  customer type and their locations have been attempted, or when the job tells
  you to stop.

## Reliability rules

Market discovery is colder than existing-chain prospecting, so the proof bar is
higher:

- A parent company is not accepted from a search result alone.
- A parent company must have a source URL the run actually opened.
- The source must support the customer type. For example, a school trust source
  must show it operates schools; a care group source must show care homes.
- A location must be listed on a page the run opened.
- A site already in customers or prospects is skipped and counted as a duplicate,
  not filed again.
- A group that is only a directory category, franchise search page, supplier,
  recruiter, or news article is rejected.
- A low-confidence parent group or location is parked for review rather than
  silently written.

## UI scope

### Customers screen

Add a market-discovery control next to the existing research controls:

- `Find new groups` button;
- starts immediately for all imported customer types;
- progress bar row while running, with the active type or group named;
- final modal with groups found, locations filed, duplicates skipped and
  exceptions.

The existing research progress bar must not be overloaded. Either the screen
shows a separate market-discovery job strip, or the shared strip names the job
type clearly.

### Customer/prospect list

Add a visible source label on prospect rows:

- existing-chain prospect;
- market-discovery prospect.

Add filters only if the first UI becomes noisy. The default customer view should
still remain customers, preserving the CRM decision already made.

### Opportunity report

Market-discovery prospects should be visible but not mixed silently with warm
existing-chain prospects. The report can support one of these v1 choices:

1. Include them with a clear `Market discovery` label and separate subtotal.
2. Exclude them by default and show a toggle to include them.

Recommendation for v1: include them with a label and subtotal. It makes the demo
stronger while staying honest.

## Phased build

### Phase 1 - Plan and schema

- Create `salesDataMarketDiscoveryJobs`.
- Create `salesDataMarketDiscoveryGroups`.
- Add optional origin fields to `salesDataProspects`.
- Add validators and indexes for job status, group key and job rows.
- Tests: schema accepts old prospects, rejects duplicate parent groups, and
  keeps all reads tenant-scoped.

### Phase 2 - Job and progress bar

- Add `startMarketDiscoveryJob`.
- Add latest/running job query for the Customers screen.
- Add watchdog and stop path.
- Add progress fields and percentage calculation.
- UI: direct-start button, progress bar, final state.
- Tests: start joins running job, progress counts update, stop leaves a clear
  ended reason, and no job starts without imported customer types.

### Phase 3 - Agent tools and prompt

- Add market-discovery connector tools.
- Bind them to the Market Discovery Agent.
- Add the system prompt from code, not by hand only.
- Tool execution passes `runId`, `agentId`, `companyId`, and user id.
- Tests: no source URL refused, unread source refused, duplicate group refused,
  wrong customer type parked or refused.

### Phase 4 - Location filing

- Reuse the prospect matching service where possible.
- Add market-discovery prospect origin on insert.
- Count filed locations, duplicates and needs-check rows back onto the job.
- Tests: existing customer skipped, existing prospect skipped, postcode clash
  handled with a clear review/conflict state, market-discovery origin stored.

### Phase 5 - Opportunity report integration

- Decide include-with-label or toggle.
- Add report grouping/subtotal for market-discovery prospects.
- Add UI copy and tests so cold prospects are never mistaken for warm
  existing-chain prospects.

### Phase 6 - Demo proof

- Run all imported customer types locally.
- Verify progress bar movement in the browser.
- Verify created groups and prospects in the list.
- Verify opportunity report labels and totals.
- Record exceptions and cost.

## Acceptance checklist

- The agent can find 2 new parent groups for each imported customer type.
- The progress bar shows phase, percent, current item, group count, location
  count, duplicate count, review count and spend.
- The job can be stopped and reports a plain ended reason.
- The same run cannot add a group already present in the current import.
- The same run cannot add a location already present as a customer or prospect.
- Parent group writes require a source page the run opened.
- Location writes require a source page the run opened.
- Market-discovery prospects are visibly labelled on the customer/prospect list.
- Opportunity report output distinguishes market-discovery prospects from
  existing-chain prospects.
- English and Italian copy stay in parity.
- Focused backend tests and the local typecheck pass before handoff.

## Open decisions

1. Should v1 include only one customer type per run, or allow a multi-type batch?
   Decision: multi-type batch, using every customer type in the current import.
2. Should market-discovery prospects be included in the opportunity report by
   default? Recommendation: yes, with a separate label and subtotal.
3. Should uncertain parent groups require human review before their locations
   are searched? Recommendation: yes for low-confidence groups, no for
   high-confidence groups with strong source proof.
4. Should the target stay fixed or be adjustable?
   Decision for v1: fixed at 2 parent groups per imported customer type.

## Current status

Phase 1 and the first usable vertical slice of Phases 2 to 5 are implemented.

Built so far:

- `salesDataMarketDiscoveryJobs` and `salesDataMarketDiscoveryGroups`;
- optional market-discovery origin fields on `salesDataProspects`;
- separate market-discovery connector tools;
- Customers screen direct-start `Find new groups` button;
- visible market-discovery progress strip with phase, count, spend and stop;
- automatic binding of the blank Market Discovery Agent when the tools are
  installed;
- source-opened-this-run checks for parent groups and locations;
- duplicate checks against current customers and existing prospects;
- market-discovery labels in the customer list and opportunity report;
- focused backend coverage for job start/progress, source proof, duplicate
  parent groups and market-discovery prospect origin.
- local verification passing for Convex codegen, focused market-discovery
  tests, full project check, whitespace check and production build.

Still to prove or deepen:

- run the all-types job live and inspect the browser-visible progress movement;
- decide whether low-confidence parent groups should require manual review
  before location search in every case;
- add richer opportunity-report subtotals for market-discovery prospects;
- add a small admin/operator view for discovered parent groups if review volume
  grows.

Progress: 70%.
