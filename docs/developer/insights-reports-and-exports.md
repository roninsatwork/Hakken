---
product: Hakken
documentation_type: Developer guide
feature_area: Insights reports and exports
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/insights-reports-and-exports.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Reports And Exports

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Insights reports and exports
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/developer/insights-reports-and-exports.md` · **Status:** Current


Insights reporting saves WEEKLY, MONTHLY and BOARD records, reads them through company-scoped projections and builds monthly/board PDF downloads on the client. This guide covers report production, persistence, reader state and export behavior. Core findings remain in [Insights Findings](./insights-findings.md); strategy, period measurement, experiments and other advanced workflows have separate queue units.

## Entry Points And Stored Contract

Customer routes are under `src/app/(dashboard)/app/insights/`: `reports`, `reports/[reportId]`, `your-month` and `summary`. `insightsReads.ts` supplies `insightsReports`, `insightsReport`, `insightsLatestReport` and `markInsightReportRead`. Shared client pieces are `_components/ReportParts.tsx`, `ReportDownload.tsx` and `ReportPdf.tsx`.

`insightsSchema.ts` defines `insightReports` with company, holding, kind, period, covered-from/to, title, status, optional readAt/runId, body and creation time. `by_company_created` supports recent library reads; `by_hold_kind_period` identifies a website's report kind/period. The body validator in `utils/insightSummary.ts` carries narrative sections, facts, findings, work, scorecard and monthly evidence.

Stored report content is a snapshot of that write, but storage is not immutable or versioned. `insightsTeam.saveReport` deletes a first existing same holding/kind/period record, then inserts a new Written record. This creates a new ID and resets read state. Documentation must not promise permanent historic links or an append-only audit archive.

## After-Week Production

`insightsRunAfter.afterWeek` advances through separately booked after-week parts. Reports has one retry after five seconds; a repeated failure records a failed stage while later parts continue. Whole-section success now requires every required stage to succeed; completed outputs remain available when the final run is FAILED.

Inspect the section refresh notice, stage results and actual report rows when investigating missing production. Older runs without recorded stage evidence cannot establish a whole-section refresh. This guide did not invoke a run, scheduling mutation, paid model call or provider query.

`writeReports` first saves a weekly brief from accepted findings and the saved week summary. It takes up to five headline points and three next actions. It then asks `reportTargetsForRun` which monthly and board records are due or explicitly being refreshed and constructs their bodies through the configured report-writing role and shared `insightsAsk` helpers.

Models resolve through stored execution configuration rather than a model literal in these reporting functions. `filled`, `lines`, fact maps and editorial numeric checks constrain accepted text. Those checks ground generated content in supplied facts; they are not a mathematical proof of causal correctness or a guarantee all retained facts are complete.

## Due Rules And Date Semantics

`reportsDue` targets the previous month and suppresses monthly production before day four. A stored MONTHLY record for that period suppresses another ordinary due write. The rule does not prove a scheduler ran on the fourth, and a missed month is not automatically a complete historical backfill of every missing month.

For BOARD, the due key is the current quarter. Any existing matching record suppresses another normal due write. `writeReports` uses covered-from as today minus ninety days and covered-to as yesterday. Preserve this trailing-window behavior instead of describing the record as necessarily the last closed calendar quarter.

Monthly facts come from `monthFactsInternal` and selected current market evidence. A new monthly target runs from the first through the actual final calendar day of the target month. Base scorecard, findings and monthly series are carried from the saved week inputs, so not every body field is independently recomputed from one perfectly synchronized monthly dataset.

Board facts are selected from ninety/365-day analytics and Search Console keys plus market, AI and Local evidence. The headline has additional typed-number/token checks and a bounded fallback. Missing or rejected model content can yield sparse sections or fallback text without proving generation used an independently verified complete business dataset.

## Tenant Readers And Bounds

`sitesFor` starts from readable company holdings and keeps OWNED relationships. A supplied site ID is checked through `requireMySite`, then filtered against owned entries. A tracked competitor site consequently does not become an independent report scope merely because the user can open its Visibility page.

`insightsReports` reads at most four hundred newest company reports before filtering to the selected owned-site IDs. It projects titles, periods, dates and status rather than bodies. The bound can exclude older retained records for a selected site when many other company reports occupy the initial read window.

`viewOf` rejects a foreign company and checks the stored report holding. `insightsReport` returns null for a missing row. `insightsLatestReport` takes the first period-ordered row of a kind per eligible holding, then chooses the newest created record among those candidates. It is one report, not a merged company-wide report for every owned site.

`markInsightReportRead` is a tenant mutation allowing a member's same-company Written record to become READ with readAt. Missing, foreign or already-read records no-op. The state is global to the report within that company; there is no per-member receipt table or approval decision in this mutation.

## Client Lists, Detail And CSV

The report list filters title word starts and kind locally, uses shared Sites pagination and exports the filtered catalog through `ListDownload`. The catalog export contains title, kind, covered dates and written date. It does not contain every saved body and does not bypass the reader's four-hundred-record bound.

The detail page automatically marks a Written record read in an effect. `useAdminAction` is configured for quiet background retries. A visible report and a pending read marker can coexist. Reading must not be described as business sign-off, source validation or proof that another member saw the document.

`ReportParts.reportLines` turns points, risks, opportunities, next and optional decision into a section/words table. `ReportTop` projects monthly facts or up to four scorecard figures, and draws the saved monthly enquiry series. Its chart CSV uses those saved month/count values. The section CSV is another local projection, not a new analytics export.

Summary consumes current selected-period data, newest-week findings/conversion context and the latest board report. The existence of a period selector does not make every saved report in the surrounding view regenerate to that period. Detailed period alignment and source readiness remain separate measurement contracts.

## Browser PDF Contract

`ReportDownloadAction` returns no control for a missing report or WEEKLY kind. It dynamically imports `ReportPdf` only when requested, sets a busy state and clears it in finally. It has no dedicated error notice in that action wrapper; a download failure should not be reported as a successful server-side stored PDF.

`downloadReportPdf` renders the saved report with `@react-pdf/renderer` to a browser Blob, creates an object URL, clicks a temporary download link and revokes the URL. No backend file record is created and no email sender runs. The filename includes host, monthly/board kind and period.

The monthly template declares two A4 pages and board five, with cover/summary/market/quarter/plan composition. Long content and renderer wrapping can affect actual output; template declarations alone do not certify every production document's layout. The browser renderer uses built-in Helvetica/Courier and the print palette, separate from dashboard theme fonts.

`usePdfWords` supplies translated fixed labels and status/measure names from the interface language. The saved generated narrative is not retranslated by the download action. `changeOf` uses percentage-point differences for percent units and relative percentage change for count comparisons, returning a dash when a required comparison is unavailable or its prior count is zero.

PDF scorecard and finding sections also have bounded displayed subsets. Exporting the report does not produce the supplier's raw evidence, every historical observation or an independent reconciliation of its facts. A local downloaded file is outside backend retention after the user saves or shares it.

## Retention And Validation Evidence

`keepRules.ts` declares insight reports as two-year data cleared through `saveReport`. The writer removes up to twenty expired company records on a save using two times 365 days. There is no exact-anniversary deletion guarantee from that path, and replacing a period is separate from expiry cleanup.

`ReportPdf.test.tsx` contains local rendering evidence for monthly and board templates, while `insightsLoad.test.ts` includes library/report read-budget coverage. These sources were inspected, not executed; no PDF was generated during this Markdown pass. Existing tests cannot be cited as new visual QA, live model-quality acceptance or deployed integration proof.

Use the [user guide](../end-user/insights-reports-and-exports.md) for report interpretation and [Insights Findings](./insights-findings.md) for the prior evidence pipeline. PRODUCT.md remains unchanged, including the distinction between foundations and intended product surface and section 33's external rename cutover. Report storage and local code are not evidence that all live sources, deployment resources or business outcomes have been accepted.

## Manual refresh and historical evidence

`startWebsiteRun` propagates `refreshReports` from a manual parent run unless explicitly supplied. `reportTargetsForRun` then prefers the saved current-period report or latest saved report for each kind. It preserves that record's original period and covered-from/to dates. Rewriting an older board report uses its stored facts, findings, scorecard and monthly evidence rather than attaching current figures to historical dates. Monthly narrative uses the selected month facts while retaining the prior report's base evidence when refreshing. Ordinary scheduled due creation still suppresses a stored matching period and waits until day four for a new monthly target.

A missing or invalid monthly/board model answer now throws and keeps the previous report. The after-part retry and per-run answer reuse are described in [Insights Findings](./insights-findings.md#durable-refresh-recovery-and-source-generations). Same-period successful replacement still creates a new ID and resets read status; preservation on failure does not make successful rewrites immutable. These behaviors were read from concurrent local source and focused test declarations, without invoking report generation or establishing live acceptance.
