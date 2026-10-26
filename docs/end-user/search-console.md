---
product: Hakken
documentation_type: end-user guide
feature_area: Search Console
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/search-console.md
last_reviewed: '2026-10-26T08:52:19+00:00'
reviewed_against: current implementation
status: Current
---
# Search Console

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Search Console
> **Reviewed:** 26 October 2026, 08:52:19 GMT (Europe/London)
> **Source path:** `docs/end-user/search-console.md` · **Status:** Current

## Purpose and access

Search Console shows how an owned website appeared in Google's search results
and which appearances led to clicks. Use it to examine searches, pages,
changes in visibility and opportunities worth investigating. It complements
[Google Analytics](./google-analytics.md), which describes measured visits and
actions after people reach the website. Search impressions, search clicks,
website visits and business conversions are different quantities. A click in
Search Console is not proof of an enquiry, order or paid sale.

Open the Search Console section at `/app/search-console`, then choose an owned
website. Its pages sit beneath `/app/search-console/<siteId>`. The website
choice belongs to your company's workspace. Members can read authorized
company figures; company administrators and super administrators manage the
connection. A competitor watched through Visibility does not give your
company access to that competitor's private Search Console account.

This guide describes reviewed repository implementation. It does not certify
that your deployment has a working Google app or that every property has been
connected. If no figures appear, establish whether the website is connected
and whether collection has completed before concluding that the site has no
search traffic. The broader Hakken product vision in [PRODUCT.md](../../PRODUCT.md)
is separate from the presence of these search-performance screens.

## Connect the website

An administrator opens **Connection** for the owned website and starts Google
sign-in. Choose an account with permission to read the correct Search Console
property, and allow the requested read access. The platform operator must
have configured the Google application and encrypted-token storage. Missing
platform setup requires operator attention; repeated attempts with the same
account will not create those settings.

Hakken finds properties that can represent the website and checks whether the
account may read them. A domain property and a URL-prefix property may cover
different portions of a site. When the flow offers a choice, check both the
property's address and its coverage instead of selecting by a familiar name.
A property covering an entire parent domain can include more than the one
subdomain you intended to analyse. A prefix with a path can cover less.

The sign-in flow is time limited. If it expires, begin again from Connection.
An account with no suitable property, access declined in consent, unreadable
stored credentials and temporary Google problems are different failure
conditions. Use the page's explanation to decide whether to reconnect with a
different account or ask the operator to repair configuration.

Search Console and Analytics share Google's connection infrastructure where
appropriate. Search Console can remain on a working account while Analytics
uses another. Disconnecting one section is not necessarily revocation of all
Google access for every website. Hakken releases a shared grant only when
remaining connections no longer need it.

## Start with Performance

After connection, begin with **Performance**. Review clicks, impressions,
click-through rate and average position for the selected dates. Click-through
rate describes clicks relative to impressions. Average position summarizes
many appearances and is not a promise that every person saw the website in
one fixed rank. A movement in average position can reflect a changed mix of
searches as well as changed results for a particular search.

Choose the result kind deliberately. The implementation exposes web, video,
news, Discover and Google News where data is available. Image search is not
collected or shown in the current menu, even though older schema definitions
still recognize it. A blank breakdown in one result kind should not be
mistaken for the whole website's performance.

The period controls use shared calendar periods rather than treating every
month as thirty days. Last month is a useful complete starting period; a
period still in progress is compared with the corresponding portion before
it. Look at the displayed date boundaries and newest available day. Search
Console figures settle over several days, so a newly available day may be
replaced with a later answer from Google.

Home-country selection also matters. The implementation keeps configured
countries ready and can request other supported country views from Google.
A country view is not always an immediately available local copy. When
comparing screenshots or links, confirm the website, dates, result kind and
country match. The menu preserves these choices in the address so moving
between pages need not silently reset the question.

## Searches, pages and tracked lists

**Keywords** examines the searches associated with the website's results.
**Pages** examines the site's pages. Opening an individual record gives more
context than the list alone. A page can receive traffic from many searches,
and one search can surface more than one page. Google can withhold rare
searches, so adding every visible search row is not a reliable way to rebuild
the site's total clicks or all of a page's traffic.

The tracked keyword and tracked page screens narrow attention to the things
the company has chosen to follow. A company tracking a search is a different
concept from Google reporting that search in one historical period. Private
tracking lists belong to the company, even when a supplier's underlying
website data is shared. Do not assume a colleague at another company can see
your list merely because they also watch the same host.

Table headings control sorting, and lists provide paging and export controls
where implemented. Read the total and filters before interpreting a visible
page as the whole population. An exported list should retain its period and
selection context when you share it outside the app. A selected page of rows
is not interchangeable with a complete export.

Hakken deliberately retains a useful subset of detailed search lines: a
search with clicks, a tracked search, a search in the top twenty positions,
or a search showing multiple pages can qualify. Website and page totals
come from Google's own totals rather than being reconstructed solely from
that subset. A historical detail view may also request Google directly. A
missing retained detail line therefore does not establish that Google never
showed it.

## Changes and opportunities

The section groups changes separately from the main figures. Position bands,
new and lost results, wins and losses, volatility and Google updates offer
different views of movement. Use them to decide what to inspect, then follow
the relevant search or page. A result moving between bands is a descriptive
change; it does not by itself establish the cause or commercial value.

The opportunity routes include Almost there, Shown but not clicked, demand
and competing-page views. Their usefulness depends on the source data and
current collection. A search with impressions but few clicks can raise a
question about relevance or presentation; it does not prove that rewriting
a title will produce a particular number of leads. Two pages appearing for
a search can warrant inspection without proving that either should be
removed.

Breakdowns such as brand versus non-brand, click rate by position, rich
results and real versus estimated figures help explain the source and shape
of the numbers. Keep actual Search Console performance distinct from
supplier estimates. A difference is a reason to investigate definitions and
coverage before changing a website or reporting an improvement.

Google-update markers supply timing context on dated charts. An update
happening near a traffic change is not proof that the update caused it.
Inspect dates, affected searches, affected pages and other changes before
drawing a conclusion. The app's saved observations can help organize that
investigation, but a notice should still be read against the underlying
figures.

## Freshness, retention and connection problems

A first collection starts after the connection is established rather than
waiting for the next regular nightly run. Recent daily collection is followed
by a paced history fill for available older totals, reaching toward Google's
sixteen-month window. On a large or busy property, different portions can
finish at different times. Read connection/progress information and dates
instead of treating an unfinished fill as complete history.

Not all historical data is stored in the same shape. Current implementation
retains detailed day lines for sixty days and stores prepared period lists
and other summaries separately. Older daily website totals can reach further
than the retained individual search/page lines. A previous guide or code
comment mentioning a rolling weekly/monthly copy of every line should not
be treated as the current storage policy.

Some reads, including other-country and individual-detail requests, ask
Google live. A live request can fail or wait even while saved overview data
is readable. Do not keep repeating the same request to overcome a quota or
busy response. Allow the platform's retry/continuation behavior to operate,
and ask the operator to inspect a persistent recorded problem.

An administrator can disconnect from Connection. This stops future
collection and records when it stopped; collected figures remain rather than
being immediately erased. Removing the company's website relationship is a
separate operation that schedules private-data cleanup. Changing to a
different property clears incompatible figures before collecting the new
property, so a newly empty view after a property change can be expected.

For help, report the website, property coverage, selected dates, country,
result kind and displayed error. Never share Google tokens or client secrets.
The [developer guide](../developer/search-console.md) explains the collection,
read and cleanup boundaries. No live Google call or deployment acceptance was
performed in this documentation review.
