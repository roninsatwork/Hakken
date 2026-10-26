---
product: Hakken
documentation_type: developer guide
feature_area: Google Analytics
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/google-analytics.md
last_reviewed: '2026-10-26T08:30:17+00:00'
reviewed_against: current implementation
status: Current
---
# Google Analytics

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Google Analytics
> **Reviewed:** 26 October 2026, 08:30:17 GMT (Europe/London)
> **Source path:** `docs/developer/google-analytics.md` · **Status:** Current

## Scope and evidence boundary

Google Analytics has a routed frontend, private company connections, report collection, retained data, derived reads and tracking checks. This guide documents the implementation at commit `d3c105f8ad0fe75660d8b32a372d65be35cd77b1`. It is not a deployment acceptance record. No Google request, collection run, application session or test suite was executed for this documentation review. Two pre-existing changes in Analytics read tests were preserved; this guide does not validate those edits.

[PRODUCT.md](../../PRODUCT.md) remains the authority for intent, but its Part Three statement that GA4 is unbuilt disagrees with the modules described here. The [coverage inventory](../index.md#documentation-coverage-inventory) records that discrepancy for manual reconciliation. Do not use this implementation evidence to declare the complete asset P&L, attribution strategy or other planned product work delivered.

## Routes and frontend composition

The section root is `src/app/(dashboard)/app/analytics/page.tsx`. Website pages sit beneath `[siteId]`, where the parameter is a `companyWebsites` identifier. Shared section behavior lives in `_components/useAnalytics.ts`: `ANALYTICS_PAGES` defines the current menu, `analyticsQuery` carries shared filters, and the URL helpers preserve a detail screen's return context. `AnalyticsMenu` filters the Products item using the connection's shop flag.

The route family contains Overview, Live, Channels, Campaigns, the landing-page funnel, All pages, Conversions, Products, Visitors, Tracking health and Connection. Nested routes provide individual page, event, channel and check views. Some route names are retained implementation addresses rather than literal menu labels: Landing pages uses `funnel`, for example. Read `ANALYTICS_PAGES` before documenting a menu change from a directory listing alone.

Historical screens use Convex queries and shared list/chart components. `AnalyticsGate` in `AnalyticsNotices.tsx` handles connection prerequisites; the Connection screen handles connecting, property selection, event choices and connected details. Writes use `useAdminAction` and confirmation components. No special connection secret belongs in a browser argument or a URL. The [end-user guide](../end-user/google-analytics.md) explains the workflow without exposing these module boundaries.

## Authorization and tenant ownership

`convex/googleAnalyticsConnect.ts` declares connection changes through `adminMutation` and its status through `tenantQuery`. `beginGoogleAnalyticsConnect` calls `requireMySite`, rejects tracked competitor holds and refuses an unconfigured deployment. `chooseGoogleAnalyticsProperty`, `saveWhatCounts` and `disconnectGoogleAnalytics` also resolve the website through the caller's company relationship. Client-side `canManage` only controls presentation; the mutation builder and ownership check protect the write.

The common boundary is `convex/siteAccess.ts`. `findMySite` reads the hold and compares its `companyId` with the resolved caller company; `requireMySite` fails when that does not match. A global `websites` row may be shared between companies, but private Analytics data is indexed by the company hold. A host or global website identifier is therefore not a substitute for a checked `companyWebsites` identifier.

Historical reads in `googleAnalyticsReads.ts` use `tenantQuery` and `requireMySite`. Realtime and event-funnel actions use tenant-aware actions and server-side target resolution. Keep these checks when adding a new read path, including an Assistant tool: a tool must inherit the authorized conversation company rather than accept a model-supplied company as authority. See [Tenancy Enforcement](./tenancy-enforcement.md) for the platform builders.

## Google sign-in and connection states

`convex/googleConnection.ts` owns the shared Google grant. `newSignInState` creates a random state with a section prefix and hold identifier; pending state is valid for 15 minutes. The authorize and callback endpoints remain `/api/search-console/oauth/authorize` and `/api/search-console/oauth/callback`, including when Analytics initiates the flow. `authorizeLink` builds the server endpoint from `CONVEX_SITE_URL`.

The Google application uses `SEARCH_CONSOLE_GOOGLE_CLIENT_ID` and `SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET`, as defined in `connectorOAuthProviders.ts`. Token encryption requires `CONNECTOR_TOKEN_ENCRYPTION_KEY`; encryption behavior is in `connectorTokenCrypto.ts`. This guide intentionally lists names only. The existence of environment-variable support does not prove that credentials or an OAuth callback have been configured on any deployment.

Analytics initiates read scopes for both sections. `completeSignIn` can adopt the same grant for a waiting Search Console connection while preserving a working connection on another account. `googleConnections` and `googleTokens` hold the shared account and encrypted token material. Grant release checks for remaining use before revocation, because Google can revoke the entire application's account grant rather than an isolated site's token.

`googleAnalyticsConnect.ts` handles CONNECTING, CHOOSING, COUNTING, CONNECTED, NEEDS_RECONNECT and DISCONNECTED states. `chooseGoogleAnalyticsProperty` schedules `readWhatCounts`. That action reads event/address information; `writeWhatCounts` merges it with retained administrator choices. `readFailed` schedules bounded delayed attempts for recoverable failures. Authorization failures that need a person should remain visible rather than becoming an endless retry loop.

## Conversion definitions and consequences

`saveWhatCounts` validates event names against the connection's offered events and address names against its identified addresses. A Hakken value must be finite, non-negative and at most 1,000,000. Values are reporting assumptions in the property's currency. Event counts and Analytics-supplied values remain separate so readers can compute the selected conversion total and prefer Google's supplied value when present.

`googleAnalyticsRows.ts` supplies shared conversion and row calculations. `googleAnalyticsReads.ts` builds historical lists from those helpers rather than independently interpreting event choices. A changed local value can therefore reprice retained history. Changing the counted event set invokes `forgetCountedHistory` for dependent Insights history. Changing included conversion hosts can invalidate collection-derived figures and initiate collection again. Switching the underlying property clears incompatible stored figures before first collection for the new property.

The address model distinguishes traffic belonging to the website from conversions on additional addresses such as a shop or booking service. `utils/analyticsAddresses.ts` owns address classification and conversion selection. Do not broaden the visit filter merely because another address's conversions count. These are measurement semantics, so changes require product agreement under AGENTS.md rather than a documentation-maintenance fix.

Connecting and changing choices insert audit rows with action types such as `GOOGLE_ANALYTICS_CONNECTED` and `GOOGLE_ANALYTICS_COUNTED_CHANGED`. Metadata records the account, property and chosen definitions, never tokens. Initial saving starts `startFirstCollection`; subsequent definition changes can schedule health checks or recollection as appropriate. This is why a connection-setting save is more than a passive preference write.

## Collection, scheduling and quota handling

`googleAnalyticsAgentRun.ts` implements the `GOOGLE_ANALYTICS_COLLECTOR` role. The configured collector schedule drives regular work; first connection can start its website immediately. Each website has its own run, with starts staggered and work divided into scheduled steps. `collectionSteps` records progress, and the role-run system measures activity through progress rather than only the original start time. A whole run is not held inside one action invocation.

`googleAnalyticsJobs.ts` computes day windows and period jobs. Executable constants supersede older explanatory comments: recent daily storage is now 92 days, not the 60 or 90 days still mentioned in some comments. The newest complete day is determined in the property's time zone. New days and the preceding settling days are fetched again; finished calendar periods have settling rules rather than being assumed immutable immediately.

`googleAnalyticsSession.ts` centralizes token access, report requests and recoverable transport behavior. `ask` passes paginated results and quota observations through the API layer, preserving report progress after a partial failure. `googleAnalyticsApi.ts` requests `returnPropertyQuota`. `googleAnalyticsQuota.noteQuota` persists the last allowance and `quotaSeenOf` supplies it to later sessions. `googleAnalyticsBudget.quotaStillSeen` retains hourly observations for ten minutes and daily observations until Google's Pacific calendar day changes.

The budget keeps 2,800 project-hour tokens, 8,000 property-hour tokens, 40,000 daily tokens and 24 threshold-sensitive hourly requests in reserve. These are implementation thresholds, not a promise that external quotas will never change. At the reserve or an hourly refusal, collection waits instead of issuing repeated requests. `afterTheHour` schedules continuation an hour and two minutes later. Website collection and follow-on fills share a 4.5-hour nightly window; unfinished work can wait for the next night. Busy-service waits and one token refresh are separate from quota exhaustion. Never use a manual repeated run to bypass the quota boundary.

## Storage, queries and cleanup

`googleAnalyticsSchema.ts` contributes tables through `schema.ts`. `googleAnalyticsConnections` uses `by_hold`, `by_pending_state` and `by_status`. Daily parts in `googleAnalyticsDays` use hold/list/device/day indexes; retained coarser history uses hold/device/grain/start and hold/grain/start indexes. These encode tenant ownership and time-grain access, rather than relying on full-table filtering.

`googleAnalyticsPeriodSlots` and `googleAnalyticsPeriods` hold ready-made lists and their parts, using `by_hold_key` and hold/key/slot indexes. `googleAnalyticsPageSeries` stores page-specific series, while `googleAnalyticsTitles` stores titles keyed by hold/page. `googleAnalyticsLive` stores named event-funnel answers; this table must not be confused with the non-retained realtime response used by the Live page.

`utils/analyticsHistory.ts` defines 92 daily days, a 365-day weekly reach and a 730-day total history reach. Separate history fills in `googleAnalyticsFillAfter.ts` and related collection modules populate older data. A schema's capacity for history is not evidence that the fill finished. Period lists also serve a different purpose from summable daily series: unique people cannot generally be added across days to obtain a year's distinct audience.

`analyticsOverviewPanels` and `analyticsOverviewPagePanels` split Overview reads in `googleAnalyticsOverviewReads.ts`. Detailed page queries are in `googleAnalyticsPageReads.ts`; channel, visitor, product, event, conversion and flow reads have their own modules. Lists use shared searching, sorting and paging. Prefer those modules to adding a second calculation inside a screen or Assistant tool.

`disconnectGoogleAnalytics` marks the connection disconnected, clears pending sign-in material, audits the action, schedules shared-grant release and notifies the hold-page layer. Existing figures remain. `purgeHold` is different: it stops collection and schedules `googleAnalyticsCollect.purgeFigures` to remove connection data in batches when the company no longer holds the website. Keep disconnection and deletion distinct in support advice and tests.

## Live exceptions, health and verification

`askGoogleAnalyticsRealtime` in `googleAnalyticsRealtime.ts` asks Google directly through a tenant action. The frontend's `liveTiming.ts` limits requests to once a minute while visible, pauses after 30 untouched minutes and avoids overlapping requests. Realtime covers all countries and is not stored. `googleAnalyticsLive.askEventFunnel` is the other interactive report path; it uses a named saved answer for the requested event funnel. Do not claim all Analytics screens are free of external calls.

`googleAnalyticsHealth.ts` derives checks from collected data, stores results on the connection and notifies super administrators when a check starts failing. Tracking-health screens only read those saved results. A passing checklist is evidence about implemented checks on retained data, not comprehensive measurement certification or automatic repair.

Relevant verification sources include `googleAnalyticsConnect.test.ts` for permissions, shared sign-in, event/address choices and disconnect cleanup; `googleAnalyticsFills.test.ts` for continuation and old-history work; `googleAnalyticsHealth.test.ts` for check behavior; and the overview, page-series, product, conversion, load and look tests in the same feature family. These tests were inspected selectively, not executed in this run. Any future code change still needs the repository's normal gates, suitable fixed clocks and quota-safe mocks; documentation review authorizes none of the live collection operations.
