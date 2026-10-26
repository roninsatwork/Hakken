---
product: Hakken
documentation_type: End-user guide
feature_area: Insights reports and exports
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/insights-reports-and-exports.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Reports And Exports

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Insights reports and exports
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/end-user/insights-reports-and-exports.md` · **Status:** Current


Insights reports collect a saved account of what Hakken observed, what its analysis suggests and what to investigate next for an owned website. The report library includes weekly briefs, monthly reports and board reports. Reports are useful for reviewing evidence with a business team, but a generated explanation is not proof of causation, completed repairs or increased sales.

Open Insights and choose Reports at `/app/insights/reports`. Your month opens the latest saved monthly report, while Summary combines current period information with the latest weekly analysis and available board report. A report's saved content and the surrounding current dashboards can describe different observation windows. Read the report's covered dates and written date before comparing them.

## Select Company And Website

The report library is scoped to the active company and its owned websites. Use the website selector to focus on one of those sites. A tracked competitor is not an independent source of your company's reports, even though competitor evidence can appear inside an owned website's analysis.

Without a website filter, the library combines eligible reports from the company's owned sites. The latest-report views choose a single newest applicable report; they do not merge every website into one newly written company-wide document. Always check the host printed on the report before presenting its figures as company-wide totals.

Another company's report identifier does not grant access. A missing or inaccessible direct link can produce the not-found state. Reports can also disappear from an older direct link when the same period is regenerated and its record replaced. That is different from a new business conclusion that the website or capability was removed.

## Browse The Report Library

The library lists report title, website, kind, covered dates, written date and status. It returns up to four hundred recent company reports before the owned-site selection is applied. A very busy company can therefore have older retained reports outside this listing window, especially when filtering to a less active website.

Text search matches report titles and the kind control selects weekly, monthly or board records. These controls narrow the saved list locally; they do not ask the analysis team to rewrite a report or contact any source integration. Paging shows the available list in manageable groups rather than expanding the underlying four-hundred-record read.

The list's CSV download contains the filtered report catalog, including title, kind, covered dates and written date. It is not a bulk export of every report body or a PDF archive. Keep the website context alongside any catalog you share so that similarly named monthly reports are not confused.

## Weekly Briefs

A weekly brief is saved from the week's accepted findings and summary. It can include the overall verdict, a leading story, up to five finding headlines and up to three next actions. A brief with little narrative can reflect a sparse accepted finding set rather than a failure to produce a much larger research paper.

The week is a saved analysis period, not a guarantee every data source completed a fresh live check that week. Source facts can differ in age and coverage. A weekly brief can also be rewritten for the same site and period, replacing the saved record and returning its status to Written.

Weekly briefs can be opened in the report view and their displayed sections downloaded as CSV. The report PDF action is deliberately unavailable for weekly records. The absence of a PDF control does not mean a weekly brief is incomplete or unreadable.

## Monthly Reports

Your month at `/app/insights/your-month` reads the latest saved monthly record for the selected scope. Monthly report generation targets the previous month only once the current month's day is at least the fourth, and only when that monthly record is absent. Actual production depends on a suitable Insights run and its report-writing step.

This is a due rule, not a promise that every report arrives at midnight on the fourth. A source problem, disabled or unavailable writer or partial after-run failure can leave the latest report older. Opening Your month reads available content and does not generate the missing report.

The body combines monthly facts and selected findings with saved supporting summary material. Its covered-to date comes from the available monthly enquiry fact, with a day-twenty-eight fallback when that fact cannot supply an end. Inspect the dates actually printed rather than assuming the title proves complete coverage through the last calendar day.

The report's monthly headline figures read the facts stored in that body. They do not refresh silently from today's Analytics or Search Console values. Later source corrections can therefore disagree with an earlier report until a separately authorized regeneration replaces it.

## Board Reports

A board report is keyed to the current quarter and is due when no record exists for that site and quarter. Its implemented covered dates are the trailing ninety days ending yesterday when written. It is not necessarily a report on the last completed calendar quarter, even though the navigation and document use quarter language.

The report can include an executive headline, summary, selected findings, risks, opportunities, next priorities and a proposed decision. The narrative is grounded in the selected retained facts and the configured report writer. It does not establish that the business approved the decision or that Hakken executed the recommendations.

Scorecard comparisons can use stored ninety-day and prior-year evidence. Different measures can have different source readiness, and some older data can be missing. Do not treat a favorable status label as a comprehensive financial audit or a controlled experiment proving why a metric moved.

## Open And Read A Saved Report

A direct report page at `/app/insights/reports/[reportId]` shows its saved summary, figures, monthly enquiry chart and section rows. The body contains the words and evidence saved when that record was written. It is not a live editable document in this report screen.

Opening a Written report automatically marks it Read. This status belongs to the report record for the company, not a separate private reading receipt for each member. Another authorized member may consequently see Read after someone else opened it. It does not prove the board approved it or every recipient read it.

The page retries a failed read-status write quietly through the shared action helper. The report can still be visible while its status update is pending. Do not repeatedly request report generation just because the read marker has not changed immediately.

The section CSV download contains the report's displayed points, risks, opportunities, next steps and decision when present. The chart export contains its saved monthly enquiry series. Neither is a fresh source-system query or proof that every number has been independently reconciled after writing.

## Download A PDF

Monthly and board reports offer a PDF download. Hakken loads its PDF renderer when requested and creates the file in the browser from the saved report. This path does not email the report, publish it externally or store a generated PDF in Hakken's backend.

The monthly template is designed as two A4 pages and the board template as five, including its cover and sections. These are template structures, not a guarantee every unusually long stored narrative fits exactly the same rendered page count. The existing local PDF tests are implementation evidence; this documentation review did not render or inspect a production report.

Headings and fixed labels use the screen's language, while the saved report narrative remains the content already written. Downloading in another interface language is not a request to translate or rewrite every saved paragraph. Check the file's language and content before sharing it.

The filename includes website, report kind and period. A local download creates a copy under your control; Hakken's later retention cleanup cannot recall copies already shared. Use your normal company process for handling internal reports, including any business-sensitive findings they contain.

## Saved Facts, Current Summary And Interpretation

Summary mixes the selected period view, latest-week work and available supporting reports. A website filter can narrow those inputs, but a single latest board report remains a saved record. Do not assume changing the period selector regenerates that board report for the chosen interval.

Enquiries are the configured analytics events and mappings represented by the stored evidence. Estimated market traffic and AI mentions are different sources from measured site events. A report can place them beside each other without making them interchangeable or proving a complete impression-to-sale journey.

When a number looks surprising, identify the website, report kind, covered dates, written date and source fact before requesting a correction. The main [Insights Findings](./insights-findings.md) guide explains how a finding relates to evidence and follow-up. Detailed measurement and period interpretation remain separate workflows in the coverage inventory.

## Retention And Practical Review

Reports have a declared two-year lifecycle, applied through bounded cleanup when new reports are saved. Up to twenty expired company records are removed per save. This is not a guarantee of deletion at the exact two-year anniversary without further saves, and the four-hundred-row library bound is a separate reading limit.

Regeneration deletes the old same-site/kind/period record and creates a new Written one with a new identifier. It is not an append-only version archive. Preserve an appropriate local copy through the normal export process if your business requires the exact document it reviewed previously; do not assume the old link is permanent.

Read a report as a dated, inspectable interpretation. Verify critical figures, decide which recommendations need action and use the appropriate separately authorized workflow for repairs or external communication. See the [developer guide](../developer/insights-reports-and-exports.md) for the generation, access and export contracts. No report or local test establishes live rename-cutover acceptance or completion of Hakken's planned product surface.

## Refreshing a previously written report

A manual full Insights refresh can also rewrite the latest saved monthly and board reports. The refreshed report retains its original covered dates. A board report for an older window uses that report's saved evidence rather than silently relabelling today's figures as historical results. If the writing step cannot obtain a valid answer, the previous report stays available and the whole-section notice identifies unfinished work. Successful same-period replacement can create a new report link and reset its read state, so keep an exported copy when you need a fixed artifact for a meeting. These are local implementation rules; the presence of a download or old saved report does not establish that the latest refresh completed.
