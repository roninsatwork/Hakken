---
product: Hakken
documentation_type: User guide
feature_area: organic keyword, page and position reports
audience: workspace users and customer support
source_repository: roninsatwork/Hakken
source_path: docs/end-user/organic-keywords-and-pages.md
last_reviewed: '2026-10-26T11:00:56+00:00'
reviewed_against: current implementation
status: Current
---
# Organic Keywords And Pages

> **Product:** Hakken · **Document type:** User guide · **Feature area:** organic keyword, page and position reports
> **Reviewed:** 26 October 2026, 11:00:56 GMT (Europe/London)
> **Source path:** `docs/end-user/organic-keywords-and-pages.md` · **Status:** Current

Organic keyword and page reports explain what the stored search evidence says about a website: which searches it ranks for, which pages receive those rankings, how positions have changed and where coverage is incomplete. Open a website in Visibility and use its Organic search pages. These reports describe held observations from the current collection system; opening them does not run a fresh Google search or establish the traffic, leads or sales received by the business.

Use this guide for the Keywords, Top pages, position-band, new/lost and structure views and their record pages. Private tracked Google searches, AI questions, backlink details and technical audits have distinct collection and evidence contracts. A website may have some of those records without a complete organic keyword list. See [Websites And Visibility](./websites-and-visibility.md) for adding owned or tracked websites and selecting the right company context.

## Choose The Website And Context

The website address opens the company's saved website holding, which can represent its own site or a tracked competitor. Both can use the same report routes. A competitor is not automatically another company account, and selecting a known shared hostname does not grant access to another company's private tracked search list. The server checks the holding against the active company before returning the report.

Place matters: organic rows are read for the website's selected collection location. A position observed in one market is not automatically the position a person sees in another location or account. Check the website, place and freshness notes before comparing reports. Collection limits, incomplete returned pages and data still being filed can all affect what appears; an exact table count is exact for its held, filtered list, not a census of every search the website could rank for.

## Keywords

The Keywords route is `/app/sites/[siteId]/keywords`. The table includes keyword text, position, change or comparison information, volume, CPC, traffic estimates and its ranking page as appropriate to the selected view. Rows open a keyword detail page. Search applies to keyword words, not to page addresses, so use Top pages when the question is about a URL or site folder.

Use compact filters for position band, intent, movement and difficulty. Position bands include top three, four through ten, eleven through twenty, twenty-one through fifty and fifty-one onward. Intent includes buying, researching, branded, irrelevant, other and unjudged states. Unjudged or missing figures are not equivalent to a confident classification or a measured zero. A display estimate of traffic or value should not be described as first-party Analytics visits or confirmed sales.

The default current list shows keywords in the latest held check. An older view lets you inspect records retained from earlier checks. Older is deliberately different from Lost: an incomplete new list may simply fail to include an older keyword without proving that its ranking disappeared. Use the labels and coverage message rather than treating every omission as a ranking loss.

Headings sort the whole filtered held list before the requested display page is selected. The first direction is chosen for the measure, such as best position or largest traffic, and another press reverses it. Empty values stay after known figures. Sites tables offer twenty-five, fifty, seventy-five or one hundred rows, opening at twenty-five and remembering the choice. Page and ordering parameters support links and Back navigation; they do not change collection settings or buy additional data.

## Compare Dates Without Overstating The Evidence

The comparison control fetches a prior position for the displayed keywords. That comparison column is not a whole-list sorting key because it is enriched only for rows on screen. The backend also records whether a point was checked and whether its position convention matches the latest row. A result counted among ordinary organic results is not safely comparable with a result counted across the whole search page unless the conventions agree.

Past positions may be represented by coarser retained weekly or monthly points rather than a new point for the exact old date. A blank prior position can mean unavailable evidence, a keyword outside the permitted current site list or an incomparable point. It does not always prove the site had no ranking. If a decision depends on a precise date or a particular search-page feature, inspect the record's explanation and saved evidence instead of filling the blank by assumption.

The position-band chart summarizes held positions over the page's selected dates. It is a different view of the stored time series from today's table. Current filters and the What Hakken sees summary need not describe exactly the same subset: the query's summary is intentionally computed over the current held list even when the table is narrowed. Read the summary as context rather than a total of just the selected rows.

## Wins, Losses And Position Bands

The new/lost view groups New, Up, Down and Lost movements and can distinguish a keyword that left a partially held list from a confirmed loss. Its comparison relates to the collection's saved ranking day and prior checked context, not necessarily the date on which the user opened the page. This prevents a day without new observations being presented as a fresh ranking change.

Position-band views show counts moving between ranking bands and a small closest-to-page-one selection. Those highlighted examples are not the entire keyword universe. Detailed moved-keyword pages have their own result limits. Use a highlighted opportunity to choose what to investigate, not as proof that editing a page will move it into the top ten. These screens report observations and inferred opportunities; they do not make search-engine changes.

## Top Pages And Structure

Top pages is at `/app/sites/[siteId]/keywords/pages`. Its table groups the site's ranking evidence by page and can show keyword count, estimated traffic, best position, linking domains and AI citation indicators. Search matches the page address, while section and type filters narrow the held list. The structure view groups folders/sections so a reader can see where ranking pages concentrate.

A page-type filter can use a company-defined classification when one exists; otherwise it falls back to the stored type. A displayed type is not a content edit or a publishing decision. AI citation indicators beside a page are restricted to the questions measured for this company's list and come from bounded saved citation reads. They should not be presented as an exhaustive count of every public AI answer mentioning that URL.

Open a page record to connect its organic keywords with any stored crawl, link or AI evidence. Some panels show only a short set of examples, while a summary may have a larger total. Missing audit or link details do not establish that the page is healthy or has no links; the relevant data may not have been collected or retained. External page links navigate to the website, and do not modify it through Hakken.

## Keyword Detail And Related Workflows

A keyword record can combine its ranked-list position, private tracked or first-check status, saved result-page evidence, features, related questions and comparable rivals from the company's group. A keyword found organically is not automatically added to the company's recurring tracked list. If the record offers a tracking action, that belongs to the separate tracked-search workflow and can change future collection work and recorded usage.

If the full old result page is no longer retained, the detail screen can show a saved position without the complete result layout. That is an evidence-retention distinction, not an instruction to invent the missing results. The record can also have no ranked-list row while containing another permitted first-check or tracking context. Use the explicit empty-state wording rather than assuming every detail URL corresponds to an organic keyword currently ranked by the site.

## Practical Use, Exports And Limits

Start with the right company/site/place, check whether the list is current or still preparing, then narrow one question at a time. Compare the table with its freshness and coverage explanation. Follow a keyword to its ranking page when the question concerns content, and use the page's held keywords when investigating which searches support it. Keep estimated search traffic separate from first-party Analytics/Search Console figures and from actual business revenue.

The Download all action exports the selected report kind and heading order. It does not pass the screen's current search/filter state, so do not expect only filtered rows. It is not limited to a screenshot of the visible page. That does not make them complete supplier archives or evidence that unseen rows were collected. A data gap should be reported with the website, place, filters and observation date; do not trigger extra paid collections or repeated fills merely to make a guide example look complete.

This review inspected report queries, list/record routes, shared paging, band summaries and filing/read boundaries. No app, Google request, supplier collection, browser test or export was run. The existence of these implemented reports does not declare all of PRODUCT.md Part Three delivered. Read the [developer guide](../developer/organic-keywords-and-pages.md) for exact modules, bounded reads and tenant checks; product-direction and live acceptance decisions remain separate.
