---
product: Hakken
documentation_type: User guide
feature_area: backlinks, referring websites and link evidence
audience: workspace users and customer support
source_repository: roninsatwork/Hakken
source_path: docs/end-user/backlink-reports.md
last_reviewed: '2026-10-26T11:20:21+00:00'
reviewed_against: current implementation
status: Current
---
# Backlink Reports

> **Product:** Hakken · **Document type:** User guide · **Feature area:** backlinks, referring websites and link evidence
> **Reviewed:** 26 October 2026, 11:20:21 GMT (Europe/London)
> **Source path:** `docs/end-user/backlink-reports.md` · **Status:** Current

Backlink reports describe the links to a website that Hakken's collection system has stored. They help a team inspect linking websites, individual source pages, anchor text, broken destinations, change over time and the distribution of links by attributes or origin. They are saved third-party observations, not a live crawl of every linking page, a guarantee that every link still exists or an instruction that Hakken has changed a link on another website.

Open a website in Visibility and select its Backlinks area. The same report family can open for an owned site or a tracked competitor held by the active company. The server checks that holding before returning data. Knowing a shared hostname or a detail URL does not grant access to another company's saved holding or private list choices.

## Overview And Evidence Dates

The overview shows retained backlink and linking-website figures over the selected dates, with comparison context where available. Link quality and Where links come from read the newest stored backlink summary. Those sources are not necessarily the same operation or observation date as each detailed link list. Check the saved day and coverage wording before treating a difference between summary and detail as an error.

A backlink, a referring page, a linking website, a main domain, an IP and a subnet are different counts. Several links can come from one page, several pages from one website and several websites from shared infrastructure. Do not add these figures together as a total of independent businesses or assume an IP count is a customer or publisher count.

The summary can contain missing figures. Missing is not measured zero. It can mean the operation has not returned a value, parsing did not provide it or the relevant evidence is not held. Opening the report does not fill the gap by making a provider call. A new collection needs its own authorized workflow and allowance checks.

## All Links And One Per Website

All links at `/app/sites/[siteId]/backlinks/all` offers different views of the held backlinks. The one-per-linking-website view is a representative list, while every-link mode uses the stored detailed list. A single representative row is not proof that a website has exactly one backlink. Read the selected mode before comparing the table total with the headline backlink count.

Search can match word starts in the available linking-domain, source-page, anchor and destination fields. Filters can narrow live/new/lost state and follow versus nofollow. Headings order the whole held candidate list before display paging. As with other Sites tables, row choices open at twenty-five and can be twenty-five, fifty, seventy-five or one hundred, remembered through the shared paging controls.

Where links come from and selected new/lost intervals narrow the representative list even if every-link mode was selected. This is an implementation boundary: those breakdowns do not promise the same complete row set as the unfiltered every-link copy. A table count is exact for the filtered held candidates returned by that path, subject to any cut indication, rather than a census of every link known by the supplier.

Open a source URL to inspect the external page or follow an internal domain/anchor detail link to see the saved evidence. The report itself does not contact a publisher, request link removal, submit a disavow file or repair a redirect. Those are separate decisions and actions, none of which are authorized by viewing a row.

## Linking Websites And Domain Detail

The linking-websites view at `/backlinks/domains` groups links by referring domain and can show rank, backlink count, spam score, first-seen date, status and available page/broken-link figures. Search targets the domain, and the nofollow filter means a linking website has at least one nofollow page; it does not mean every link from that website is nofollow.

A detail page can show a limited set of strongest saved links from the selected domain and its subdomains. Summary lookup can fall back to a parent website record when a precise subdomain record is absent. The displayed domain and inherited summary should therefore be interpreted with that context rather than assumed to be a newly measured independent subdomain profile.

Detail examples are bounded. The page can show fewer links than the summary count, or show link examples without a matching aggregate record. That is not proof of a broken tenant boundary or a complete missing-history event. Check the collection's list mode, saved date and retained coverage before requesting more data.

## Anchors, IPs And Networks

The anchors view at `/backlinks/anchors` groups the words used in links. An empty anchor can represent a link without recorded text rather than an invalid phrase. Anchor detail shows its aggregate figures and a limited set of matching links. Different links with the same wording are not independent endorsements, and the words do not automatically describe the business accurately.

IPs and networks at `/backlinks/ips` help explain shared hosting infrastructure behind referring websites. The server can show multiple domains and links per IP and a short list of top subnets. Shared infrastructure is a grouping observation; it does not prove common ownership, abusive behavior or that every website on a network links to the selected site.

Use these reports to understand what was stored, not to convert one technical characteristic into an automatic action. The current Hakken implementation does not remove links, alter an external host or prove why a search engine valued a link. A supplier rank or spam score is a supplied indicator, not a verified Google penalty or a legal finding about a publisher.

## Link Quality And Origin Breakdowns

Link quality at `/backlinks/quality` uses the latest stored summary's rank, spam, nofollow and broken-link figures. Where links come from at `/backlinks/where` can break links down by country, domain ending, platform/site type, item type or recorded attributes. The raw source operation and its date determine that snapshot; a current browser date does not make it a fresh measurement.

A breakdown selection can open the corresponding retained examples. Representative examples and summary totals can differ because they come from separate saved operations with different limits. When the detail is cut short, preserve the coverage notice. Do not quietly describe the first few thousand retained candidates as all links on the web.

## New, Lost And Broken Links

New and lost at `/backlinks/new-lost` uses saved link-change history grouped into chart steps. Weekly observations are kept as such; summing them into a month does not create exact daily events. A first-seen or last-seen date describes the supplier's observation, not necessarily the day a publisher created or removed its page.

Broken links at `/backlinks/broken` shows the saved broken-link pass and available response codes. A stored error can be stale, temporary or specific to the collection observation. Seeing it is not a current network test. Hakken does not automatically repair the target, restore the source page or refund historical work merely because a record is marked broken.

Before treating a loss as a business problem, compare the relevant dates, summary/list coverage and source record. A missing row in a newer partial list is not automatically the same thing as a confirmed supplier LOST state. The filing system preserves a standing list while a replacement is being assembled, so in-progress data can legitimately take time to become the visible list.

## Comparisons, Downloads And Practical Use

Compared at `/backlinks/compared` reads current figures for the company's tracked comparison group. It does not give access to every competitor database or normalize away different collection dates and coverage. Compare saved days as well as figures. A large backlink count is not automatically more revenue, more first-party traffic or a better business outcome.

Download all uses the report export kind and chosen order, not every active screen search/filter. It is bounded by the server's row and byte limits and can report that the file was cut short. Other local downloads reflect the rows supplied by their particular view. An exported CSV retains those source limits; it is not a complete supplier archive or proof of live verification.

For a useful review, start with the right company/site, check the observation day, choose representative or every-link mode, then narrow the question and inspect supporting examples. Record a discrepancy with its filters, date and coverage state rather than starting repeated paid collections. Use the [developer guide](../developer/backlink-reports.md) for exact queries, filing and limits.

This documentation pass inspected current report routes, summary/list/detail queries, packed records, filing behavior and relevant source tests. It did not run a browser, export, provider call, collection, external-link check or application test. The implemented reports do not establish completion of every planned Hakken product outcome or deployed integration/rename acceptance.
