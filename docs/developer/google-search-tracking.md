---
product: Hakken
documentation_type: Developer guide
feature_area: private Google tracking, first checks and SERP evidence
audience: backend and frontend developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/google-search-tracking.md
last_reviewed: '2026-10-26T11:05:39+00:00'
reviewed_against: current implementation
status: Current
---
# Google Search Tracking And Fan-Out Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** private Google tracking, first checks and SERP evidence
> **Reviewed:** 26 October 2026, 11:05:39 GMT (Europe/London)
> **Source path:** `docs/developer/google-search-tracking.md` · **Status:** Current

Private Google tracking joins a company's website holding to shared measured search facts. `holdLists.ts` owns private-list reads, `websiteCanonical.ts` common phrase validation and manual mutations, `promptFanOut.ts` per-question choices and first checks, `siteFanOutTracking.ts` customer opt-in, `siteGoogle.ts` standing/history and `siteGoogleSerp.ts` result-page summaries. `seoKeywordChecks.ts` files checked-search observations. The screen workflow is [Google Search Tracking And Fan-Out Queries](../end-user/google-search-tracking.md).

## Routes, IDs And Authorization

The main customer routes are `/app/sites/[siteId]/google/searches`, `/google/fan-out`, `/google/above`, `/google/features` and `/google/questions`. Keyword/feature detail routes reuse existing record helpers. `siteId` identifies `companyWebsites`; `requireMySite` checks it against the active company and supplies website, place and paired-list context. Use `listHold`/`listWebsiteId` when comparing a tracked competitor against the owned site's chosen searches.

Customer report APIs use `tenantQuery`. `trackSiteFanOutQuery` uses `tenantMutation`, resolves the site and explicitly refuses `isTrackedHold`. It accepts one through fifty wordings, normalizes/deduplicates them and verifies each is actually listed for that prompt and holding. Tracking selects the first displayed wording; stopping calls untick for all supplied normalized wordings and queues their first checks. It writes TICK_FAN_OUT_QUERY or UNTICK_FAN_OUT_QUERY audit evidence with source SITES.

The customer mutation does not add an independent admin/assignee guard beyond tenant membership and its explicit site/list checks. Do not describe it as restricted to platform operators or infer a universal read-only denial that is absent from this handler. Full manual keyword writes and prompt fan-out edit/generate handlers use `superAdminMutation`; their reads use the corresponding platform read wrappers. Frontend navigation and backend permission are separate evidence.

## Private Lists And Shared Facts

`websiteKeywords` is indexed through the company's holding. `holdSearches` uses `by_hold` or `by_hold_active`, and point reads go through `holdSearch`. Questions likewise use holding-scoped helpers. `fanOutFirstChecks` belongs to `holdId`, while measured positions and retained SERP facts can be shared by website/search/location. `websiteSearchStats` uses a key index for saved standing summaries. Never begin a private list read at a shared website or query and work outward to another company's membership.

`searchPositions` allows at most five requested keywords and reads at most eight hundred saved points for each. It admits full history only when the caller's own holding tracks the phrase or has its own first-check record. An untracked phrase that exists on the site's organic ranked list can read LIST-kind observations only. This prevents a guessed phrase from revealing that another company has been making one-by-one checks, including not-found results.

History aggregation takes the last observed position in each selected day/week/month bucket. `weeklyBefore` flags requests reaching beyond daily retention. The underlying policy retains daily positions for ninety days and uses coarser stored history for older ranges; a query does not buy missing exact-day evidence. Do not replace null or absent points with position one hundred. `asOfListCheck` prevents paired comparisons using evidence newer than the owning list's applicable check context.

## Common Keyword Mutations

`readSearchPhrase` returns normalized matching text plus display wording. `addWebsiteKeywordCore` checks the holding, detects a duplicate in that holding, enforces tracked-per-site limits and inserts origin metadata for HAND, AI_SEARCH or AUTO_SETUP. The shared helper is used by prompt choices, keyword research and other approved work so those entries cannot bypass common constraints. Its audit records identify the saved holding/company context; provider requests are scheduled by collection rather than performed by the public report query.

Manual `addWebsiteKeyword`, `setWebsiteKeywordActive` and `removeWebsiteKeyword` are super-admin mutations. Removing a row schedules `afterSearchRemoved` to update affected choices. Pausing/resuming and deleting are different lifecycle events. An AI_SEARCH resume rechecks fan-out room; manually entered entries are not silently converted into generated choices. Scope and counts should be read from the real shared helper before changing an editor's wording.

## Tick, Untick And First-Check State

`tick` is a no-op for an already active row, creates a missing AI_SEARCH row through the common add helper or resumes an existing one. It applies the separate fan-out limit for AI-origin entries and removes an unbought first check made redundant by recurring tracking. `untick` deletes an AI_SEARCH-origin tracking row but pauses a retained manually entered one. Observed search facts are not deleted by these list changes.

`queueFirstChecks` deduplicates phrases, skips active recurring searches and existing holding first-check rows, and inserts a missing `fanOutFirstChecks` record. If website/search/place statistics already exist, it records their checked day immediately rather than buying another initial observation. Otherwise collection can plan it later. A row can therefore mean already satisfied, waiting or purchased depending on fields; insertion is not live supplier completion.

`dropFirstCheck` removes only an entry without pull id or completed day. `leaveList` unticks only when no other prompt on that holding still lists the keyword. This protects a shared website-level choice referenced by several private questions. Prompt removal/edit/restore paths maintain persisted choice state; do not implement them as deletion of all common search history or all provider requests for the wording.

## Prompt Editing And Generation

`getPromptFanOut` combines scoped question queries, explicit company choices, search state, limits and generation state. Choice scans and displayed angle counts are bounded; generated progress presentation has a one-hour window. It is not an unlimited history endpoint. Adding a company choice attempts tick-if-room and otherwise queues a first check. Editing preserves the previous opt-in where possible and keeps a removed AI original suppressed. Removal and restoration maintain that user decision across new extraction results.

`generatePromptFanOut` checks question/company/holding context and requires the company's collection schedule to be active. It builds a provider request for each configured engine through `aiAskFor`, using prompt/location/module settings. It computes the shared request identity with a prompt placeholder rather than the website, reuses compatible existing work, or inserts PENDING `seoDataPulls` with zero initial cost and no sandbox flag. It records generated pull ids/time and starts the collector when newly requested work exists.

The return values asked/reused/sending describe admission and launch, not completed extraction. Shared request reuse is not a claim that every called engine exposed fan-out text or that no supplier cost can occur. `afterFanOutFiled` updates matching company website question contexts after a generated answer arrives. User writes remain per holding; shared buying does not make the company's private question lists global.

## Filing And Result-Page Reads

`seoKeywordChecks.writeKeywordCheck` files one measured Google search for known websites on the returned page and explicit askers absent from it. A checked-not-found point must be saved for an asker, while a never-checked phrase has no such point. A first-check requester counts as an asker even without recurring tracking, and completion marks its first-check state so the same missing result is not bought repeatedly as if unattempted.

`siteGoogleSerp` reads latest pages for the caller's selected searches and uses paired standing where relevant. `listAbove` compares against the site's found result or the first ten results when absent, marking rivals from the company's group. When full-page retention has elapsed, it can return a date/position with `pageKept: false` and no above-result rows. That is retention evidence, not a conclusive zero-competition result.

`listFeatures` summarizes observed SERP features and whether the site appears in domain-bearing features. `listQuestions` deduplicates QUESTION and RELATED text case-insensitively per kind, accumulates contributing searches/latest day and caps distinct rows at twelve thousand with a cut indicator. An extracted question is not automatically a tracked keyword. Full SERP retention is ninety days under `SERP_PAGE_RETENTION_DAYS`; read projections and stored position history have different lifetimes and meaning.

## Limits, Jobs, Configuration And Tests

The system uses the website's general tracked limit plus a separate fan-out-origin limit, resolved through current platform/company/hold rules. Bounded private-list helpers and angle reads can limit returned candidates. Collection scheduling, retry and quota behavior belong to the collection services; this guide adds no independent retry loop or direct Google call. Provider credentials remain in their owning backend configuration and no values belong in a tracking guide.

Relevant source tests include `promptFanOut.test.ts`, `siteGoogle.test.ts`, keyword-check/position tests and website tenancy guards. The prompt tests include customer opt-in, owned versus competitor restrictions, first-check idempotence, edits/removals, generation reuse and old-answer retention. This pass inspected source and declarations rather than running them. No list mutation, generation, collection, Google/paid API request, data fill or browser test was performed.

For maintenance, retain the distinction among private membership, shared measured facts and shared provider purchases. Verify the precise holding and location before changing a result query. An operator's manual deletion does not prove recursive historical erasure, while a customer untick does not revoke another workflow's independent purchase. These are implemented foundations with documented boundaries, not proof that all planned Hakken commercial outcomes or external integration cutover have been accepted live.
