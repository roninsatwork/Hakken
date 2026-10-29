# Reliable Insights for large websites

**Approved for phased implementation, 26 October 2026. Overall: about 80%. Deployed to the development backend on 29 October and run live on More Handles: every failure of 26 October held, but the run did not refresh the whole section — the two biggest competing-page groups ran past the model's 180 seconds twice (see "Live acceptance run — 29 October 2026"). A fix for those was made and deployed the same morning, and a second run was stopped by Anthony before it finished, because Insights is to read only data the sections have already downloaded (see "Second live run — 29 October 2026, stopped"). Acceptance now waits for `insights-sections-only-plan-2026-10-29.md`. Anthony requested a pause at this phase boundary, then explicitly authorised committing all finished work in this checkout and pushing `dev` so he can change machines.**

Anthony approved working through the plan in manageable phases and asked for a durable handoff in case he needs to leave before it is finished. Save progress here after each meaningful milestone. The later instruction authorises one combined commit and push to `dev`, including the other agents' finished work. No push to `main` or production release is authorised. Pause after publishing that checkpoint; do not deploy the backend or start another live Insights run until Anthony resumes.

More Handles must be able to refresh its whole Insights section using its saved data and the existing source rules. Work must continue safely when a website needs more than one step, and the result must say which sections completed. The same approach must serve larger clients without a separate repair for each website.

## Failures observed on More Handles

The Insights rerun on 26 October exposed these failures while other specialists continued:

| Work | Recorded failure | Code to investigate |
| --- | --- | --- |
| Insights history | Memory exceeded the default runtime's 64 MB allowance | `insightHistory.fetchHistory` accumulates source answers and records before saving at the end |
| Choosing a page for each search | Database function exceeded its one-second execution limit | `insightCompeting.groupsForRun` builds the groups and gathers their supporting data in one query |
| Track record | Database function exceeded its one-second execution limit | The shared catch in `insightsRun.readAndDecide` covers change gathering, change saving and open-finding checks; identify the exact failing call before changing it |
| Conversion page reviews | The model returned no answer within the existing 180-second allowance | `insightsRunAfter.reviewPages` and its model input size, batching and saved fallback results |
| Measurement health | Return validation rejects the saved `others` field in an Analytics health check | `insightsReading.measurementInternal` duplicates an older health-result shape instead of reusing `googleAnalyticsSchema.healthResultValidator` |

The run ended with `SUCCESS`, eight published findings and a weekly brief despite those four failures. Its normal screen-summary stage also reported seven of eight summaries written. The completion checks must distinguish valid omissions and rejected prose from failed or older results.

The run also recorded an unavailable PageSpeed key and a PageSpeed 429 response. Those are source-access conditions, separate from the four execution failures. Missing speed figures must be reported as unavailable, rather than interpreted as a poor speed result or repeatedly requested.

The existing collector reliability work provides the patterns to reuse: [collection reliability](collection-reliability-plan.md), [Analytics on large sites](ga-big-site-reliability-plan.md), `collectionSteps.ts`, `googleAnalyticsSteps.ts` and `searchConsoleSteps.ts`. Insights currently has step watches, but those can finish a stranded run; they do not provide the collectors' saved continuation through every piece of work.

## Scope and rules to preserve

- Keep the agreed date choices, source history windows, country boundaries, conversion definitions, scoring and evidence checks.
- Preserve the current summarisation rules, including the existing rows grouped under “other”. Do not reduce the data examined or lower row limits to make a large website appear to pass.
- Reuse saved source data where it supplies the same dates, dimensions and measurement. Distinct people and other non-additive figures must retain their existing counting rules.
- Keep each company's private data scoped to its own website hold throughout reads, temporary work and saved outputs.
- Continue to resolve agents, models and spending limits from configuration.
- Respect Google's quota reserves and save progress before waiting. Resuming must not repeat already completed downloads or model calls unnecessarily.

The plan covers the current Insights surfaces for More Handles: summary, this week, your month, strategy, reports, findings and their categories, cannibalisation, track record, leaderboards, enquiries, AI search, opportunities, page plan, funnel, page reviews, experiments, measurement and sources. Some are saved outputs; others read underlying data. Their refresh checks must reflect that difference.

For a manual full-section rerun, the proposed report policy is to regenerate the current weekly brief and the latest monthly and board reports, using each report's own period and matching evidence. Replace a latest report only after its replacement passes validation; retain older archived reports. Preserve experiment states, manual decisions, tracking lists and their configured schedules.

## Phase 1 Measure the entire run

Map every Insights page to the data and stage it reads. Capture More Handles' actual record counts, largest source answers, packed record sizes, query work, memory use, model input size and stage duration. Trace the precise timeout inside the Track record catch. Include downstream reports, reviews and screen summaries, rather than stopping at the four logged failures.

Separate source refusal, quota waiting, missing configuration, execution failure, unavailable data and a valid empty result. Record the current results on a manageable fixture so later changes can be checked for numerical and decision parity.

**Deliverable:** a failure inventory, section coverage map and measured batch sizes. Each affected read or worker has a bounded input and payload target derived from those measurements.

## Phase 2 Make history processing fit in memory

Use the existing Node worker pattern for source-heavy Insights history work. Divide work by source, kind and date span, page through large answers, aggregate incrementally and save completed pieces as they finish. Store the next position so an interrupted worker resumes from its last completed piece.

Handle all nine existing history kinds, not only the source answer that happened to exhaust memory. Reuse equivalent retained collector data where possible; retain direct source requests where the saved data cannot reproduce the required measurement. Keep whole-month distinct-person counts whole.

**Verification:** match the current calculations on representative fixtures; stop a worker between pieces and prove that it resumes without losing saved work or double counting. Measure peak memory on More Handles and on a larger generated dataset. Extra memory provides room; bounded processing provides scale.

## Phase 3 Break up expensive database reads

Move large group-building calculations out of single database queries. Read indexed pages of supporting data, process them in bounded worker steps and save results that the screens can read cheaply. Gather titles, page classifications, volumes and difficulties once per relevant batch instead of repeatedly for each group.

Apply the same treatment to the exact Track record bottleneck found in phase 1. Page through open findings and changes, check them in batches, and save each outcome once. Audit the other Insights reads and writes for the same pattern so the next large dataset does not just move the timeout elsewhere.

**Verification:** preserve the complete group, finding and outcome sets across batch boundaries. Check tenant isolation, stable ordering, duplicate prevention and query work. Compare the results with the reference fixture and measure the deployed reads on More Handles.

## Phase 4 Make every stage resume safely

Extend the existing watched-job service to cover the heavy Insights stages. Save each stage's inputs, completed pieces and next position. Reuse stored source answers and valid model decisions when a worker resumes. Prevent two reruns from processing the same website concurrently, and prevent a superseded run from replacing newer results.

A quota wait must book its own continuation. An interrupted worker must continue from saved progress. A permanent source or configuration problem must name what is missing and leave unrelated work able to complete. Recovery must remain bounded and must not become an endless retry loop.

Batch model-backed page reviews by measured input size, save completed batches and reuse them on continuation. A timed-out model call must have a recorded disposition and a bounded recovery path. Retain the existing evidence checks and clearly distinguish a rule-based result from a completed specialist review. Do not solve the timeout by simply increasing every model's allowance.

**Verification:** interrupt history gathering, group building, finding checks and downstream writing; confirm continuation, one saved outcome per piece, bounded retries and a terminal result. Repeat with a model timeout, quota wait, duplicate start and a newer rerun arriving before the older one finishes.

## Phase 5 Make completion reflect the whole section

Track completion and input freshness for each part of the coverage map. Agree which outputs are required, which are optional and which can validly have no findings. Required work must not be treated as complete because the weekly record was saved or an exception was caught.

Proposed behaviour: keep the last completed results readable while replacement work runs; clearly identify pending, failed or older sections. Publish each complete replacement safely, and finish the whole rerun only when all required work has a recorded outcome. Optional source failures remain visible alongside the usable results.

Include the Report Writer, measurement, opportunities and plans, cannibalisation, conversion reviews, page decisions, track-record checks and specialist screen summaries. Apply the proposed latest-report policy to a manual full-section rerun; retain the existing due-only policy for scheduled runs. Validate every regenerated report against its own dates. Preserve archived periods and manual experiment state.

**Verification:** fail each downstream stage in turn and confirm that the section does not claim a complete refresh. Verify that users continue to see usable prior results and can identify exactly what remains pending or unavailable. Any screen changes use the existing drawing guide and screen kit.

## Phase 6 Prove the whole section on large sites

Use representative fixtures based on More Handles' measured size and distributions, then a dataset ten times larger. Exercise long history, high-cardinality page/search pairs, many findings and large page/channel records. Test the bounded work and result parity without adding flaky per-test timing overrides or raising existing test-speed allowances.

After the normal repository gates pass, deploy to the development backend and run More Handles through the complete pipeline. Check every section against the coverage map, including stored timestamps, source dates, completed stages, failures and the visible result. Check a smaller client as a regression comparison. Distinguish a real empty result from a missing calculation.

Use Node 24.22.1 and `npm ci` for local verification. Run the repository's environment, guards, lint, type, test, coverage, browser smoke and build gates before proposing a push. Live validation must budget Google requests, preserve the quota reserve and record model spend. No push or production release is part of drafting this plan.

**Acceptance:** More Handles completes every required Insights stage; interrupted work resumes without babysitting; no section silently retains an old result while claiming freshness; calculations retain the agreed meaning; and the larger fixture demonstrates bounded work rather than merely a larger runtime allowance.

## Delivery order and approval

Build in phase order, with a measured acceptance check after each phase. Report both overall implementation progress and the current phase's progress, along with what passed and any remaining blocker. Keep the existing dated plans as records; this plan adds the Insights work they did not cover.

The agreed delivery starts with phase 1: measure the failing queries and produce the complete coverage map, then use those measurements to make the history and database fixes.

## Progress and handoff

| Phase | Status | Evidence and next action |
| --- | --- | --- |
| 1 Measure the entire run | Baseline complete | Individual reads reproduced; exact Track record query identified; section coverage map and extra Measurement validator failure recorded below |
| 2 History memory | Local implementation tested | Node worker; monthly page-heavy requests; immediate record saves; metadata pagination and indexed retention cleanup. Monthly source/kind continuation and quota waiting tested; large answers stream into accumulators; live memory proof remains |
| 3 Database reads | Local implementation tested | Annual page changes read one saved part per query in a Node worker with source-build guards. Cannibalisation reads packed parts and classifications in batches. Change saves use 25 rows per transaction; finding and change reads paginate past the former caps, saving each finding batch. Deployed read measurements remain |
| 4 Continuation and model reviews | Local implementation tested | Shared watched chain; source/month positions; separate ownership, group-review and downstream pieces; bounded stalled work and model retries; exact-request answer reuse; stale-publisher guards. Live interruption/recovery proof remains |
| 5 Whole-section completion | Local implementation tested | Required-stage outcomes now determine the final status; downstream work has seven watched pieces; incomplete specialist reviews retain previous results; manual latest-report targets preserve dates and board evidence. The existing Notice now shows per-website whole-section status, including older unverified runs. Full verification and live acceptance remain |
| 6 Large-site verification | Local gates passed; live acceptance pending | Representative 150,000-page history and 150,000-current/10,000-removed comparisons pass. Full tests, coverage, smoke and both production builders pass. Development-backend acceptance remains |

At every stopping point record the branch, changed files, completed checks, deployed state, active jobs, known failures and exact next command or action. Preserve unrelated local changes. Keep local verification separate from a successful live rerun. A failed stage remains unfinished even if the parent run is marked successful.

Current branch: `dev`. There are substantial pre-existing documentation edits and edits to `convex/googleAnalyticsChannelReads.test.ts` and `convex/googleAnalyticsReads.test.ts`; these belong to other work and must be preserved.

The 26 October More Handles rerun has ended. It published eight findings and a weekly brief, with the four run failures listed above. The Measurement validator failure was found separately during phase 1. Do not use that run as proof that the whole section refreshed. No new analysis run is needed until the relevant fixes pass their checks.

### Current implementation checkpoint

- Changed `convex/insightHistory.ts`; added `convex/insightHistoryWork.ts` and `convex/insightHistorySteps.ts`. The existing history entry point delegates to the Node worker. Large monthly page reports have one month per request and save each result immediately. The initial metadata read uses four-record pages; retention reads expired records by kind instead of loading the entire history on each save.
- Changed `convex/insightsReading.ts`: Measurement now reuses `healthResultValidator`; annual page-change comparisons delegate to a Node action and read one stored Analytics part per query. Each list's slot and hash are checked, and an incomplete or replaced build raises an error instead of producing false page removals.
- Added `convex/insightsReadingSteps.ts` and its three regression tests; changed `convex/insightsRun.ts` to invoke the annual comparison as an action.
- Added monthly request-span and save-before-next-month checks in `convex/insightHistory.test.ts`, plus the health-result regression in `convex/insightsReading.test.ts`.
- Node 24.22.1 `npm ci` completed with zero audit vulnerabilities. The focused history and reading tests pass (11 tests); the new annual-comparison tests pass (3 tests). Type checking passed after explicit worker return types were added. Convex code generation has run; its CLI explicitly states that code generation does not modify application code running on the deployment. No application deployment, full live rerun, commit or push has been performed for these fixes.
- The final local gates are recorded below. Real large-site acceptance on the development backend remains; do not describe the live repair as finished.

Cannibalisation's compound query has been split: `insightCompetingSteps.ts` reads individual packed parts, reuses the period book and unpacking helpers, and loads classifications, titles, volumes and difficulties in batches of 25. Three tests compare its complete decisions with the former calculation, reject a replaced build and enforce lookup batch limits. The combined 20 history/reading/competing tests passed and TypeScript passed before the recovery changes below.

Recovery work in progress: `collectionSteps` now recognises an `INSIGHTS` chain, dispatched by `insightsRunWorker.ts`. The normal website start books that chain and returns an existing active run for a duplicate start. `insightHistorySteps.ts` plans source/kind/month pieces with fixed newest dates, saves the next position in the watched chain and books its own continuation after a quota wait. `insightsAsk.ts` reuses successful complete model answers from that run's logs, keyed by the full prompt, system brief and resolved configuration; at most two recorded failures of that same request are allowed. The existing log table has optional cache fields and an index; its existing 90-day purge applies. The recovery tests now cover saved next-month continuation, hourly quota waits without rapid retry, duplicate starts, stopped-chain recovery, company isolation and complete model-answer reuse without a second call or charge. Invalid review answers stop after two recorded attempts. The separate 37-test run covering history, period views, AI search, decisions, boxes, annual reading and model reuse passed. Further publishing guards and report-target tests were added after that run and are being checked. No application changes have been deployed.

New local files include `insightsRunWorker.ts`, `insightsRunState.ts`, `insightsAsk.test.ts`, `insightsReports.test.ts`, `utils/insightHistoryRun.ts` and `utils/insightRunStages.ts`. Additional edits cover the shared watched-chain enum and dispatcher, optional exact-request cache fields on the existing `agentLogs` table, required-stage logs, publishing guards, report targets, box retention and smaller page-review batches. The Track record's path comparison now indexes precomputed word sets while preserving its existing similarity threshold and tie order. Period, AI-search and page-decision queries now read only the history kinds they use.

The latest focused run passed 46 tests across 12 files, including history continuation and quota waiting, report targets and archive retention, cancellation guards, company isolation, source-day replacement, period views, AI search, decisions, exact-request model reuse and UI wording. A separate specialist-batch test prepares two groups in distinct pieces, then replays both without another model call or ledger entry. The generated API bindings were refreshed; this does not deploy application code.

Larger fixtures now cover (1) 150,000 landing pages streamed in 25,000-row Google answers, preserving every visit/enquiry in the existing 1,500-row top-and-other result and counting all 12 API requests; and (2) 150,000 current pages against 10,000 removed pages, retaining every comparison and the previous similarity/tie rules. The path index uses an overlap bound and memoised word sets, checked against the former all-pairs calculation on a separate fixture. No row or speed limit was lowered. The history chain records sampled worker memory using the shared collection-step service. Download booking puts recent months first, then completes all older months; source dates and date choices are unchanged.

Further review found two recovery hazards beyond the original four failures. Twenty competing-page groups could consume several model batches inside the main analysis; these now prepare in separately watched batches, and the main analysis uses the saved answers only. Search ownership no longer ends after six steps regardless of progress: it continues while making progress and stops after two successive unchanged steps. Its saved-pick lookups use batches of 50. A failed specialist/input reading cannot replace the completed weekly analysis; independently completed measurement/plan results may still save, and the main analysis gets one automatic continuation using its cached answers. Failed specialist prose retains a prior completed summary; a completed answer rejected by the evidence checks clears that screen's older prose so its current rule-based wording shows instead.

The first broad check found real source-guard issues in the new code (plain errors and a reading module beyond the 1,000-line ceiling). These were fixed using structured errors and `insightsReadingParts.ts`, preserving the existing query export. It also found an existing provider-name classification mismatch in two new documentation files: those guides describe the actual AI answer-engine catalog, so their references were classified explicitly without rewriting the unrelated documentation. Seven tests timed out while source work and other focused checks were still running; that run is not final verification. The full suite must now run against stable source with no parallel test process. Do not increase its time limits or declare those timeouts solved without the stable run's result.

The saved theme was checked against development settings and matches. The drawing kit was rebuilt. The status display reuses the existing Notice component. The in-app browser has no signed-in Hakken session; Safari control was stopped when the user changed windows. Do not interfere with their other work. CLI validation and the existing UI tests can continue; a live visual check is still outstanding.

### Requested pause and machine-switch checkpoint

Anthony requested a pause at the end of this local slice, then asked for **all finished work**, including the other agents' changes, to be committed and pushed to `dev`. Finish the mandatory repository gates, make one combined checkpoint commit and push to `origin/dev`, verify the remote matches, then stop. No new Google collection, model run or application deployment is part of this pause handoff. Anthony separately authorised read-only monitoring of GitHub checks for this exact checkpoint commit.

Final local verification on 26 October 2026:

- Node **24.22.1**, `npm ci` completed earlier, and `verify:env` verified all **51 locked direct dependencies**. `lint:all`, source guards and type checks passed.
- The final `npm run check` passed **1,038 files / 8,113 tests**, with one existing skip. Its speed gate passed: every test stayed below five seconds when measured alone. No source edits were made during that full run.
- `test:coverage` passed **8,112 tests**, with the two intended skips. `coverage:check` passed: platform lines **82.83%**, statements **79.77%**, branches **67.12%**, functions **75.92%**. No threshold was reduced.
- `test:e2e:smoke` passed **19 checks**.
- The standard **Turbopack `npm run build` passed completely after clearing generated `.next` state**. The Webpack production build also passed. Earlier attempts produced a worker port-permission error and an internal undefined-length error; fresh generated output removed those failures. The unchanged last-pushed commit `d3c105f8ad0fe75660d8b32a372d65be35cd77b1` was also built successfully in a temporary copy with the same Node and dependencies. No package, Next configuration or instrumentation change was needed. Temporary baseline copies and build outputs are not part of the checkpoint.
- The final focused run passed **232 tests across 42 files**, including all Insights calculation helpers, the status notice, quota preflight, cancellation guards and the review-writer cleanup. The later quota-module placement correction passed its **14** focused history/guard tests and is covered by the final full run above.
- Finding checks read all retained changes and indexed finding pages, save at most 25 findings per transaction, reuse today's saved page readings on continuation and refuse duplicate scoring. A regression fixture checks 51 older open findings behind 501 closed findings, then replays a saved score without increasing the tally again. Previously removed pages are paged rather than capped at 200.
- Invalid JSON fails every Insights model request. Draft and buyer-question writers require their expected array shape. Draft/panel publishing and panel synchronisation reject a cancelled or superseded run. The one-row preflight is **`googleAnalyticsQuotaActions.readAllowance`**. It was initially placed in the watched-step module; the source guard caught that mistake, and it was moved to the quota action module without weakening the guard. Its test proves current quota is requested and a saved reserve stops another request.
- The stable full run found a reply writer still finishing after its review test ended. That test now waits for scheduled work before teardown. No time limit, coverage threshold or row limit was relaxed.
- `git diff --check` passed. All finished code and documentation changes in the checkout are intentionally included in the single combined `dev` checkpoint, not only this Insights slice. Commit subject: **Improve large-site Insights reliability and refresh Hakken guides**. Push and GitHub CI confirmation are reported in the chat after publication.

Deployed state and jobs: the repair has **not** been deployed to the development application backend. API code generation only refreshed bindings. There is no `INSIGHTS` chain for More Handles. The previous run `kn740w1cz711y2dstcxkym3bw98h1bk0` is terminal (`SUCCESS` under the old, incomplete success rule); its four execution failures remain the baseline, not acceptance. No new live rerun was started. The frontend on port 3000 was stopped for the required browser/build gates. The new Insights status notice depends on the not-yet-deployed backend query, so do not treat restarting the frontend alone as a completed application update.

**After Anthony resumes:** first confirm `dev` is at the published checkpoint and install dependencies with Node 24.22.1. Re-run the gates if source or dependencies change, then deploy the checked application code to the development backend. Run `googleAnalyticsQuotaActions.readAllowance` for connection `md84a83qts02z6v6vzash0ar618gdgbq`, estimate the planned history requests and retain the required quota reserve. Start More Handles' normal whole-section run with `refreshReports: true`, measure memory and model spend, verify every required stage and every surface in the coverage map, and make the smaller-client regression comparison. If an hourly quota continuation is booked, record its exact saved position and next start. Live UI proof remains outstanding; use an available signed-in session without interrupting Anthony's other browser work.

No further repair work or live data requests should continue after the checkpoint is published until Anthony resumes. Read-only GitHub monitoring for this checkpoint is authorised; report its terminal result and stop that monitor. Preserve all unrelated work included in the checkpoint; the combined commit is intentional.


### Live acceptance run — 29 October 2026

Anthony resumed ("ok go"). On another machine, after `npm ci` (Node 24.22.1, 51 locked direct dependencies verified):

- **The deploy:** the checkpoint `4519f557` was deployed to the development backend at 08:49 with `npx convex dev --once`.
- **The allowance:** `googleAnalyticsQuotaActions.readAllowance` for More Handles read 199,999 of 200,000 tokens left for
  the day, 13,999 of 14,000 for the project's hour, and 120 thresholded asks.
- **The cost estimate:** the history plan (`insightHistorySteps.planForRun`, read-only) was 89 pieces, 70 of them
  Analytics. At about 5 tokens an ask that is about 2,000 tokens, so well over a fifth was kept in hand.
- **The run:** More Handles' run `kn7a5tr86m7fct4wdd0yfq03rh8h6nz6`, started with `insightsTeam.startWebsiteRun`
  (`refreshReports: true`), 08:51 to 09:31. It cost $0.851 against the lead's $2 limit. The most a step held was
  47 MB. The watch never had to carry a step on, and the `INSIGHTS` chain closed.

**The four failures of 26 October, each held:**

| Work | 26 October | 29 October |
| --- | --- | --- |
| Insights history | Out of memory (64 MB) | 106 records from 141 asks to Google in 4 minutes, 47 MB at most |
| Choosing a page for each search | One-second query limit | All 2,213 due searches asked; the model was sure of 1,357 |
| Track record | One-second query limit | Page changes and open findings checked; 270 changes saved |
| Conversion page reviews | No answer within 180 s | Completed |
| Measurement | Return validation failed | Measurement results saved |

Screen summaries were written for 8 of 8 screens; on 26 October it was 7 of 8. The opportunities and page plan, the page
decisions (improve 13, keep 10,453, create 20; the specialist kept 12 of 13 and changed 1), the drafts and the buyer
questions all completed.

**Not accepted: the run ended FAILED, and said so.** Its summary: "The whole section has not refreshed. Unfinished:
Keyword cannibalisation, Analysis, Reports. Completed results remain available."
- The Keyword cannibalisation specialist was asked about More Handles' 20 competing-page groups, in three watched
  pieces of up to eight, eight asks at a time.
- Seven of its answers took longer than the 180-second limit (`ASK_LIMIT_MS`). Each was asked once more; five answered,
  so 18 of the 20 groups had the specialist's review.
- "front door knob" and "tubular latch sizes" failed twice, and the run did not ask them a third time.
- Under the whole-section rule (phase 5), that failed the Keyword cannibalisation stage. The Analysis failed with it, on
  its first try and its automatic continuation, so no Reports were written.
- The week's findings and reports are therefore 26 October's, kept as they were; nothing wrong was published.

**The cause, measured:** the groups that ran past 180 seconds are the biggest, at the cap on a group's searches.

| Group | Searches | Pages | Group as asked, characters |
| --- | --- | --- | --- |
| tubular latch sizes | 200 | 6 | 137,522 |
| how to fix a door handle | 200 | 6 | 127,143 |
| black kitchen handles | 200 | 6 | 122,121 |
| antique brass kitchen handles | 200 | 6 | 119,237 |
| front door knob | 200 | 6 | 94,099 |

Two smaller groups ("rim latch" with 59 searches, "disabled toilet handle" with 45) also ran past the limit once, in a
batch of eight asked together, and answered when asked again.
- Each answer explains up to `SEARCHES_EXPLAINED` (60) searches, so the biggest groups both read and write the most.
- A group never holds more than `MOST_SEARCHES` (200), so the size of an ask does not grow with the website, and a
  fix here holds for larger clients.

**Next, for Anthony to choose:** how the biggest groups are asked, without examining less (the plan's rules forbid that).
- Give a group at the cap longer to answer, as the Head of Strategy already has (`LEAD_ASK_LIMIT_MS`, 4½ minutes), and
  ask fewer at once.
- Or ask its searches in pieces.
- Either way, More Handles is run again afterwards to accept it.

**Noticed in the figures, outside this plan:**
- The Analyst's "Sales rose to 28,623 in September". The Head of Strategy's own verdict says More Handles' checkout
  tracking inflates its recorded sales, and the Measurement checklist names it (`enquiryCountUncertain`).
- "Google clicks on product pages 0 against 0". This reads as product pages not recognised, not as no clicks.
- The page decisions call the home page "broken" while the page reviews say it converts well.
- The home page is reviewed both as `/home` and as `/`.

### Second live run — 29 October 2026, stopped

Anthony chose the fix ("Yes, fix and rerun"):
- A group at the 200-search cap is given 4½ minutes (`BIG_GROUP_LIMIT_MS`).
- A piece asks no more than two such groups together (`BIG_AT_ONCE`, `nextPiece` in
  `convex/utils/insightCompetingAgent.ts`).
- Every other group keeps three minutes, and up to eight groups a piece.

The fix was tested and deployed to the development backend at 10:53. The allowance read 199,539 of 200,000 tokens left for
the day and 13,999 of 14,000 for the hour.

More Handles' run `kn71zxjxg1zz9xrsasa9v40vqx8h6xfq` started at 10:54:
- **History:** 61 records from 66 asks to Google, at most 39 MB.
- **Pages for each search:** all 2,213 choices kept from before.
- **Groups, first two pieces:** "tubular latch sizes" and "front door knob", the two groups that failed twice on the first
  run, both answered within the new limit. "front door knob" answered inside the 4½ minutes, but close to them: its piece began at 11:03 and its answer came at 11:08.
- **Stopped at 11:04 by Anthony, after 5 of the 20 groups had been asked.** He restated the vision: Insights is to read
  only what the sections have downloaded, and this run was asking Google for history. See
  `insights-data-sources-audit-2026-10-29.md`.
- **What the stop did:** it marked the run finished and closed its chain. No later step started and nothing was
  published. The three asks already sent finished afterwards and were paid for: the run cost $0.221, about $0.13 of it after
  the stop. A stop does not cut off a model ask already sent.

The fix is therefore deployed but not accepted.

### Phase 1 measurements

Read-only calls reproduced the failure without Google or model requests. Client round-trip duration includes CLI and network overhead; it is not a measurement of query CPU time.

| Read | Result | Returned size or extent |
| --- | --- | --- |
| `insightHistory.historyTarget` | Returned | No saved Insights history records, despite the source collectors having history |
| `insightCompeting.groupsForRun` | One-second query timeout | Reproduced independently |
| `insightsReading.pageChangesInternal` | One-second query timeout | Exact Track record bottleneck; it reads and decodes both annual landing lists in one query |
| `insightsReading.newChangesInternal` | Returned | No new changes in this read |
| `insightsTeam.openFindings` | Returned | 22 open findings; 14,743 response bytes |
| `insightsPeriod.runView` | Returned empty | No periods or months because Insights history is empty |
| `insightsConversion.reviewInputs` | Returned | Four pages; 5,633 response bytes. The model timeout is not proof that this particular prompt was too large |
| `insightsReading.measurementInternal` | Return-validation failure | Stored Analytics health checks include `others`, which its local validator excludes |
| `insightsReading.planInternal` | Returned | 100 opportunities and five page-plan entries; 32,173 response bytes |
| `insightsReading.monthlyInternal` | Returned | 13 Analytics months and one market-share month |
| `insightsReading.strategyInternal` | Returned | Four services |
| `insightDecisions.decisionSources` | Returned | 7,201 Search Console page rows; 918,160 response bytes |

The annual Analytics landing lists use seven stored parts for the current year and five for the preceding year. Six parts serve This Year. These part boundaries can be reused to make page-change reads small; reducing page coverage is unnecessary.

### Section coverage map

| Insights surface | Main saved data or reader | Refresh work to verify |
| --- | --- | --- |
| Summary and this week | `insightWeeks`, `insightFindings`, `insightQuickChecks`, period view | Main analysis, quick checks, period history, summary and report reads |
| Your month and reports | `insightReports` | Weekly writer plus the agreed latest-monthly and latest-board rerun policy |
| Strategy and services | Latest week's summary services, screen boxes | Strategy calls and specialist summaries |
| Findings and category pages | `insightFindings` | Specialist generation, Editor acceptance and source evidence |
| Cannibalisation and group details | `insightCompetingGroups`, search picks | Group gathering, ownership selection and specialist decisions |
| Track record | `insightChanges`, finding checks and tally | Page-change gathering, open-finding checks and scoring |
| Leaderboards and sources | Existing company-scoped source readers and saved boxes | Fresh source dates and valid specialist summaries |
| Enquiries and source details | `insightsPeriod`, `insightHistory` | History completion and correct period comparisons |
| AI search | Existing AI observations, question panel and summary | Current saved observations and summary, preserving tracked questions and collection schedules |
| Opportunities and page plan | `insightPlans`, page decisions | Plan calculation, decisions and their summaries |
| Funnel and page reviews | `insightConversions` | Measured review inputs, model disposition and saved review results |
| Experiments | Saved experiments and conversion reads | Updated evidence while preserving manual experiment states |
| Measurement | `insightMeasurements`, Analytics health and day comparison | Compatible health validator and completed measurement checks |
