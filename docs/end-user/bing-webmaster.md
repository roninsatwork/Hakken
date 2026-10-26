---
product: Hakken
documentation_type: end-user guide
feature_area: Bing Webmaster
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/bing-webmaster.md
last_reviewed: '2026-10-26T08:55:34+00:00'
reviewed_against: current implementation
status: Current
---
# Bing Webmaster

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Bing Webmaster
> **Reviewed:** 26 October 2026, 08:55:34 GMT (Europe/London)
> **Source path:** `docs/end-user/bing-webmaster.md` · **Status:** Current

## What Bing Webmaster adds

Bing Webmaster brings an owned website's Bing search performance and selected
crawl/index observations into Hakken. It answers a different question from
Analytics: whether Bing showed the website and people clicked, rather than
what visitors did after arriving. It also offers a comparison with saved
Google Search Console figures. Use it to identify a source of traffic worth
examining and pages whose search exposure needs investigation.

Open `/app/bing-webmaster` and choose the website. A website's pages are under
`/app/bing-webmaster/<siteId>`. The menu groups Performance, Keywords, Pages
and Crawling, followed by Against Google and Connection. These are implemented
routes and reads; their presence does not prove that Bing credentials, a live
connection or a complete history exist in your deployment.

The local implementation reviewed for this guide is newer than the GA4/Bing
status paragraph still present in [PRODUCT.md](../../PRODUCT.md). That document
remains the authority for intent; the [documentation inventory](../index.md#documentation-coverage-inventory)
records the discrepancy for review. The existence of Bing reports does not
establish delivery of every planned Hakken attribution or business-outcome
feature.

## Who can connect and read

A company administrator or super administrator can connect one of the
company's own websites. Company members can read their authorized figures.
A watched competitor is not eligible for private Bing access merely because
its host appears in Visibility. Ownership of the company relationship and
permission in the Bing account both matter.

Use the Connection page to start Bing's sign-in. The platform operator first
needs to configure the Bing application and encrypted-token storage. If setup
is unavailable, ask the operator to inspect configuration. Repeatedly signing
in with a personal account cannot create a missing deployment application.
This connection asks to read Bing Webmaster information. It does not grant
Hakken permission to edit the website, submit changes or instruct Bing to
recrawl pages through this feature.

Select an account with a verified site representing the intended website.
When one verified site covers the whole website, the connection can select it
automatically. If several sites qualify, review the offered choices before
confirming. A prefix covering a path, a root address and a whole-domain match
can represent different coverage. Check the actual site address rather than
assuming that similar labels describe identical data.

## Complete setup and understand failures

The sign-in state expires after fifteen minutes and can be used once. If an
old return link cannot finish, start again from Connection. A refusal to grant
access, no suitable verified site, a revoked grant and a temporarily busy
provider produce different explanations. Read the attempt result before
changing account or requesting operator assistance.

Successful connection stores the chosen site and starts the collection path.
The scheduled collector continues regular work. Collection is separate from
sign-in: the website may be connected while recent days, lists or page checks
are still arriving. A blank chart at that stage is not evidence that the
website has never received a Bing click.

The Connection page records status and available history/freshness details.
Use those to distinguish an active connection from figures left over after
a disconnect. If access later needs repair, reconnect through the same page.
Do not send an access token, client secret or sign-in return URL to a colleague
as a troubleshooting shortcut.

## Read Performance before drilling down

Performance shows saved daily clicks and impressions for the chosen period.
Start with a complete period such as Last month, then inspect changes in the
chart before drawing conclusions. A click is not a lead or sale, and a high
impression count does not establish that the traffic is useful. Follow the
question through to the relevant page and, where available, downstream
[Google Analytics](./google-analytics.md) figures.

The date control uses the shared calendar periods: This week, Last week, This
month, Last month, This quarter, Last quarter and This year. A period still
in progress should be read alongside the corresponding portion before it.
The chart step can be day, week or month where supported. Choices travel in
the URL as you move through the section, so inspect them when two screens
appear to disagree.

Bing's daily website totals and weekly keyword/page lists are different source
shapes. A period's detail list can be built from whole weeks available from
Bing rather than an exact daily reconstruction for every search. Look at the
dates shown beside a list before comparing it with a website's daily chart.
Do not assume a calendar-period label makes the two source shapes identical.

## Keywords, pages and detail views

Keywords describes the searches Bing reported; Pages describes the website
addresses associated with results. Lists can be searched, sorted and paged.
Click a record to inspect it rather than assuming the first visible page of
rows is the entire report. The table's total, filters and period are part of
the meaning of any export or screenshot you share.

An individual keyword view can request the pages associated with that
keyword; an individual page can request its keywords. These detail requests
can ask Bing when the screen opens, while the ordinary lists use retained
collection data. A provider failure in a detail therefore does not mean the
saved overview has disappeared. It means that extra question was not answered
successfully at that moment.

Rates and positions from very few impressions are weak evidence. The current
interface treats fewer than ten impressions as a small sample and presents
related rate/position values quietly. A search moving from one click to two
can show a dramatic percentage change while representing very little
activity. Use both the counts and the rates to judge whether the difference
warrants action.

A position figure summarizes appearances and is not a fixed promise of where
every searcher saw the website. A page's title can also differ from the URL
stored for it. When reporting a suspected problem, include the page address
and dates, not only the readable title.

## Crawling and Against Google

Crawling brings together Bing's crawl totals, errors and blocking observations
with selected important pages and their recorded index/read status. It can
show when Bing last read an important page beside the Google observation
available for that page. A missing check is different from a confirmed
not-indexed result. Read the recorded status and timestamp before treating
an absent value as a negative finding.

These screens report observations; they do not repair robots rules or force
a search engine to index a page. The connection uses read permission.
Any website edit or request for additional provider capability would be
separate work requiring its own approval. If Bing has not read an important
page recently, first confirm the address and the age of the saved check.

Against Google compares Bing information with what Hakken holds from
[Search Console](./search-console.md). There is a significant scope difference:
Bing's figures cover every country, while the Google figures use the website's
main home-country web results. The comparison is useful context but is not
an all-country, like-for-like market-share measurement. If Search Console is
unconnected or lacks the period, Google's side can be unavailable; that does
not mean Google produced zero clicks.

## History, scheduling and disconnecting

The collector retrieves website-day information and Bing's weekly keyword
and page data. It writes changed weekly lists and builds prepared period
views. Important-page checks run on a separate weekly cadence within the
collector. Their age can therefore differ from the last website-day fetch.
Use the relevant observation time rather than assuming every panel updated
together.

Weekly keyword/page parts are kept for thirteen months in the current
implementation. That is a retention policy for accumulated data, not a
promise that a newly connected account immediately receives thirteen months
of source history. Bing's available source window, the age of the connection
and completed collection determine the actual coverage. Website-day totals
and live detail answers have different storage shapes; do not infer one
universal retention duration for every Bing datum.

An administrator can disconnect on Connection. Hakken forgets its stored Bing
keys and stops collection while leaving collected figures marked with the
disconnect time. The integration does not implement remote grant revocation;
if you need to withdraw the provider-side grant, do that in Bing Webmaster
Tools itself. Removing the company's website relationship is a different
operation that schedules cleanup of the hold's Bing data.

For support, provide the website, connection state, chosen Bing site, period,
record address and visible error. A persistent access issue needs the account
or operator to act; repeating a busy request indefinitely is not a solution.
The [developer guide](../developer/bing-webmaster.md) explains the authorization,
collection and cleanup boundaries. This documentation review made no Bing
calls and verified no deployed connection.
