---
product: Hakken
documentation_type: End-user guide
feature_area: paid search reporting
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/paid-search-reports.md
last_reviewed: '2026-10-26T11:42:27+00:00'
reviewed_against: current implementation
status: Current
---
# Paid Search Reports

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** paid search reporting
> **Reviewed:** 26 October 2026, 11:42:27 GMT (Europe/London)
> **Source path:** `docs/end-user/paid-search-reports.md` · **Status:** Current

Paid search in Hakken describes advertising observations saved from third-party search evidence. It helps a team see whether a website appeared to advertise, which paid searches were retained, estimated visits and estimated costs. Use it for investigation and competitor context. It is not a connected Google Ads account, an invoice view or a campaign editor.

Open a website in Visibility and select Paid search at `/app/sites/[siteId]/paid`. Paid keywords is at `/paid/keywords`. The website must be held by the active company; the same reporting foundation can describe an owned website or a tracked competitor. A competitor report does not expose that company's advertising account or financial records.

## What The Report Uses

Paid evidence comes from the ranked-keywords response Hakken already collects. That response can contain organic results and advertisements. Hakken separates paid rows from organic rankings, so seeing a paid search does not mean the website earned the same position in unpaid results.

The everyday ranked-keywords request defaults to one hundred rows ordered by estimated visits. Advertisements among those rows supply the retained paid-keyword list. The wider organic keyword-list workflow is not a promise to collect every paid advertisement. As a result, a supplier headline paid-search count can be much greater than the examples held in this table.

Opening the report does not buy a special paid-search request, contact Google Ads or change a budget. The current observations depend on the upstream collection's scope, place and successful filing. A configured collection interval alone cannot prove the last request completed or that the current evidence is fresh.

## Start With The Date Range

The overview uses the site's selected date range and chart step. It displays the newest available paid observation within the resulting series, including its evidence day. Selecting an older interval can therefore show older paid-search facts. It does not necessarily show today's latest observation from outside that interval.

The chart lets you choose paid keywords, estimated traffic and estimated traffic cost. Selecting measures changes the visible series and the chart's CSV columns. It does not change collection settings or request a different supplier sample. A missing series point means an observation is unavailable for that point, rather than that the business stopped advertising.

Hakken shows the no-advertising explanation only when there is an actual selected observation with zero paid keywords. With no observation, it cannot draw that conclusion. Even an observed zero is scoped to that stored source and time; it is not a certificate that no advertisement ran anywhere on any platform.

## Understand The Three Measures

Paid keywords is the supplier's reported count for the relevant stored website/place observation. It is different from the exact number of retained detailed rows. A headline count can describe a wider supplier dataset than the list Hakken can currently show.

Paid traffic is estimated visits associated with the observed advertising evidence. It is not measured clicks from an authenticated advertising account, Google Analytics sessions, conversions or customers. Do not use it as the denominator for a precise conversion-rate calculation unless you separately establish a compatible measurement source.

Estimated traffic cost describes the supplier estimate of what those visits might cost. It is displayed in dollar terms. It is not the company's approved budget, actual card charge, Stripe bill, revenue or money spent through Hakken. A large number can be useful for prioritizing investigation without becoming a financial statement.

Cost per click on a keyword is also source evidence, not the actual amount paid for a particular click or a promise of what your next campaign would pay. Missing costs remain unknown. A row with missing estimates should not be treated as a free advertising opportunity.

## Browse Paid Keywords

Paid keywords lists the retained searches with available advert position, volume, cost per click, estimated visits and estimated cost. The evidence day belongs to the row's saved response. A landing page is retained with the row even though the main table emphasizes the search and numerical columns.

Search matches word starts in the keyword and saved page path. Heading sorting applies across the held candidate set before paging. Keywords begin alphabetically when selected; positions begin with the smallest positive-style number available; volumes, costs and visits begin highest first. Blanks remain missing rather than being invented to make sorting look complete.

The usual Sites page sizes are twenty-five, fifty, seventy-five and one hundred, opening at twenty-five and remembered by the shared controls. These are screen page sizes. Increasing them does not make the upstream hundred-row response larger or recover every advertisement counted in the supplier total.

When the supplier's reported count is larger than the unfiltered held list, the screen describes that partial coverage. When you type a search, its smaller matched total describes your filtered table rather than the supplier's overall advertising count. Clear the search before comparing those two coverage figures.

The reader has a separate ceiling of 1,100 held candidates and signals a cut if more exist. That is a safeguard for this report, not a promise that the routine request brings 1,100 paid rows. Most ordinary lists can be substantially smaller because the advertisements share the upstream response with other result types.

## Open A Search And Read The Summary

Selecting a row opens the shared keyword detail. That is the same evidence family used by other search workflows; it does not open an advertising campaign or give controls to change bids. Check the detail's own source and saved date before assuming every panel refers to the advertisement you selected.

What Hakken sees on the paid-keyword page summarizes all held paid rows returned to the report, even when the search box narrows the visible table. It can point to the highest estimated cost or strongest estimated traffic example. This difference is deliberate: a summary can still name a search hidden by your text filter.

The summary's cost total adds available row estimates and treats missing values as no contribution. It is consequently a sum over known estimates in the retained sample, not evidence that every missing cost was zero. Do not expect it to equal the supplier's broader headline cost estimate.

## Export The Right Evidence

The overview chart export uses the selected date interval, saved points and chosen measures. It is appropriate for discussing the observed trend and should travel with its source and estimate labels. A chart export does not include every individual keyword row behind each earlier observation.

The paid-keyword Download action exports the held paid dataset through the shared table-export service. It takes the site, kind and sort settings; it does not take the table's text search. Therefore a downloaded file can include rows hidden by the current search. Do not share it assuming that filtering the screen removed those rows from the file.

Exports are bounded by the configured download row limit and a six-million-byte CSV limit. The export reports whether it completed, and the shared download control can warn when it is incomplete. A complete export means the supported retained dataset fit those limits, not that every advertisement in the market or supplier headline was captured.

Columns include keyword, advert position, volume, estimated cost fields, landing page and last checked day. Preserve the date and estimate labels if you move those figures into a planning spreadsheet. Rounding in exports and display can differ from raw stored precision without representing a new advertising event.

## Replacement And Retention

The paid-keyword table represents the newest accepted response for the website and configured place. Filing a newer response replaces the previous current list, including clearing it when the new response contains no paid rows. It is not a complete row-level history of every advertisement ever observed.

The filing path refuses an older-day result when newer evidence is already known, so reparsing an old response should not normally bring stopped advertisements back. This protection is day-based; it does not provide a separate detailed timestamp history for multiple same-day responses. Historical headline series and the current keyword list have different retention shapes.

An empty current list can coexist with a nonzero older chart point or broader supplier total. Compare the evidence days, selected chart interval and retained detail coverage before calling that contradiction a defect. If it still cannot be explained, give the maintainer the site, configured place, day and export completeness state.

## Practical Use And Boundaries

Use these reports to identify searches worth investigating, compare the website's saved paid and organic context and prepare questions for the person managing advertising. Verify actual spend, conversions and campaign status in the authorized advertising and analytics systems before changing financial plans.

Viewing a report, sorting a table or exporting evidence does not approve launching an advert, raising a budget or changing a landing page. The application provides reporting foundations here. Local implementation and tests also do not establish that renamed external services or deployed integrations have passed live acceptance.

See [Organic Keywords And Pages](./organic-keywords-and-pages.md) for unpaid search evidence, [Google Analytics](./google-analytics.md) for retained analytics context and the [developer guide](../developer/paid-search-reports.md) for parsing, replacement and export rules. These sources answer related questions with different evidence; preserve those distinctions when turning the report into business decisions.
