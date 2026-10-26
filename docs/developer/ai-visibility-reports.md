---
product: Hakken
documentation_type: Developer guide
feature_area: AI visibility summaries, citations and app projections
audience: backend and frontend developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/ai-visibility-reports.md
last_reviewed: '2026-10-26T11:16:50+00:00'
reviewed_against: current implementation
status: Current
---
# AI Visibility Reports Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** AI visibility summaries, citations and app projections
> **Reviewed:** 26 October 2026, 11:16:50 GMT (Europe/London)
> **Source path:** `docs/developer/ai-visibility-reports.md` · **Status:** Current

AI visibility combines private holding-scoped question membership with shared structured answer facts and retained app extras. `siteAi.ts` reads mention/share/source projections, `siteListAi.ts` maintains per-question and list summaries, `siteFigures.ts` joins citations and historical series, `siteAiApps.ts` handles ChatGPT app businesses/read evidence, `siteAiPageDetail.ts` joins a read page to other evidence, and `aiDemand.ts`/`siteAiDemand.ts` plan and expose monthly phrase demand.

## Entry Points And Tenant Scope

Customer routes under `/app/sites/[siteId]/ai` include mentions, share-of-voice, sources, businesses, read, read/page and demand. All reviewed public query entry points use `tenantQuery` and `requireMySite`. The supplied site id is a company holding; the active company is derived from authenticated context, not trusted from the URL. `listHold`, `groupOwner`, `myRivals` and private `holdLists` helpers determine the relevant owned-site list and comparison group.

Mention summaries are not an invitation to read every raw answer that mentions a hostname. `readMentions` joins the company's question rows and permitted per-question answer summaries. `shareOfVoice` reads one list summary and emits the current site plus its tracked rivals. Cited-page reads enumerate only permitted prompt/engine/location combinations. Shared provider purchasing does not turn list membership or a company's chosen brand names into global public data.

## Maintained Question And List Rows

`recordListAnswer` updates owned holding summaries when an answer lands, skips tracked-competitor holdings as owners and verifies engine-specific place. Company brand names are applied through the list-group context before counts are calculated. `questionEngine` uses the newest answer to set latest stance and accumulates named/recommended/warned counts over the supplied newest-answer window. `ANSWER_WINDOW` is two hundred in the current tracking-stat implementation.

`siteListQuestions` holds per-holding/place/prompt engine counts and website-group observations. `siteListAiSummary` holds aggregate engine counts, cited pages and other named websites; `by_hold_prompt` and `by_hold` support those bounded reads. Summary changes compare canonicalized payloads before replacing a row, avoiding writes when the meaning has not changed. The counts are projections, not source records an operator should edit to make a chart agree.

Question add/edit/remove schedules recounts; answer filing requests a delayed list summary. The normal summary delay is twenty seconds. Recounts work in chunks of ten questions, sweeps remove bounded stale rows and actions read question chunks of two hundred. A per-key rebuild guard serializes summary work; contention schedules another attempt, with begin/end handling in a finally block. It is scheduled convergence rather than atomic cross-screen freshness at the end of every source mutation.

## Mentions And Share Calculations

`listMentions` expands the selected question engines and returns asked, named, recommended, warnedAgainst, lastAskedDay and lastStance. An absent engine summary returns no latest stance; an existing answer window with no site entry returns NOT_NAMED. A current table read accepts no date-range argument. Historical chart queries use a separate series path, so selecting chart dates does not transform the latest stance table into a historical interval query.

`shareOfVoice` returns named counts for group sites and asked/last-day context per engine. The UI calculates share from the sum of group mention counts, with zero when the group denominator is zero. Overall share pools counts across engines before division. It is not named divided by asked, and an answer naming two websites contributes to both group counts. The label must not become an assertion about every business or all public AI activity.

`addUpList` includes only engines still selected for questions in the private list. Replacing an engine set or changing the group can legitimately change the denominator. The current list can include paused questions in summary reads, whereas app-evidence reports select active questions; preserve that difference when comparing panels. A summary's date is not proof that an external provider accepted a new request at the moment the screen opened.

## Citation Coverage And History

`citedPagesOf` reads at most one hundred question rows and expands their selected engines with `answerPlace`. Each permitted prompt/engine/place query reads two hundred citation rows plus a sentinel before aggregation. Coverage records cut conditions for question or citation bounds. It groups page paths, engine identities and first/latest days. The returned count is within that evidence scope, not a complete list of every answer citing a host.

`siteListAi` also maintains group citation totals through internal count helpers and summary writes. Historical overlays read `siteListAiDays` rather than deriving old charts from today's whole answer scan. Retention and recomputation mean a chart, a current summary and the raw answer browser have different windows. Full wording expires separately from structured named/cited facts, as documented in the [saved-answer guide](./ai-questions-and-answers.md).

## App Business And Read Projections

`appAnswers` in `siteAiApps.ts` currently selects only chatgpt. It reads active questions selecting that engine, bounded by resolved prompt limits and the hard prompt ceiling, then takes four newest answer-index rows per question and retains candidates with extras. Missing extras do not trigger an unbounded search for four older usable app answers. Do not document these panels as all-engine reports or guaranteed four complete app observations.

`businessesRecommended` uses newest/previous eligible answers for comparison figures and the small retained set for usual business order. Business identity matches a host or normalized known company name; that is a heuristic. Its Maps comparison uses only the first office returned by local setup and stored listing/check evidence. No external map or review request is made by this read. UNKNOWN/OFF/BOX/BELOW states describe the available local comparison, not a universal live Maps position.

`readNotCited` deduplicates normalized read pages per answer, compares them with saved citation sources and classifies hosts as YOURS/RIVAL/OTHER. It counts a competing cited host when an answer read the selected site's pages. This is co-observation, not a proved causal reason for citation selection. `aiPageDetail` uses the same bounded app evidence to list answers, alternate cited pages and related Brand Radar question evidence. An arbitrary URL argument is normalized for comparison; the query does not fetch that URL.

## Demand Planning And Read Flow

`demandSearches` first includes the holding's active tracked searches within its resolved tracking bound, distinguishing manual from AI_SEARCH origin, then adds up to one hundred highest-volume organic keywords without duplicates. `aiDemandSteps` skips tracked competitors and companies whose aiDemand part is off. It refreshes missing/stale phrase-location volume after thirty days and batches provider request parameters through the collection planner. This is scheduled shared data collection, not a direct read-time supplier call.

`aiSearchVolumes` is keyed by keyword/place and stores monthly volume/history. `siteAiDemand.aiDemand` uses `groupOwner`, joins available AI demand, stored Google volume and packed monthly series, and returns nulls when figures were not measured. A selected phrase's Google rank volume fallback and AI volume need not represent the same collection date. The newest month is metadata on the held rows, not a count of today's website visitors or a customer lead metric.

No pricing amount or credential value should be inferred from a source comment about an earlier provider trial. Actual collection uses the configured operations and backend environment; current provider availability and external commercial pricing were not checked here. The credit ledger can record collection work independently of this report's displayed demand figures.

## Limits, Maintenance And Tests

Important bounds are the two-hundred-answer mention window, one-hundred-question source scope, two-hundred citations per expanded question/engine read, four app candidates per active question, one hundred supplemental organic demand keywords and bounded list-group/summary reads. Cut flags are present on some outputs but not a universal completeness assurance across all panels. Keep missing, not-yet-filed, expired and measured-zero states distinct.

Relevant tests include `siteListAi.test.ts`, `siteAiPageDetail.test.ts`, `aiAppsLoad.test.ts`, private-list tests and the AI-answer interpretation helpers. They check group/tenant scope, recalculation after list changes, bounded app reads and read-versus-cited evidence. This documentation pass inspected source/declarations without executing them. No collection, browser, supplier request, data fill, app gate or live integration verification was performed.

For separately authorized implementation work, preserve private membership before shared fact reads, use the maintained summary path and avoid a query per question/engine on every ordinary screen render. Repair a stale projection through its owning lifecycle rather than changing a customer total by hand. Current local implementation is not proof of deployed provider acceptance, rename cutover or every planned Hakken product outcome.
