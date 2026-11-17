---
product: Hakken
documentation_type: end-user guide
feature_area: Search Console
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/search-console.md
last_reviewed: '2026-11-05T08:44:16+00:00'
reviewed_against: current implementation
status: Current
---
# Search Console

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Search Console
> **Reviewed:** 5 November 2026, 08:44:16 GMT (Europe/London)
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

Under the four boxes, Performance has four charts:

- **Each day.** Clicks, impressions, click-through rate or position, with the
  dates before drawn underneath.
- **Out of every 100 clicks.** Where your clicks came from. Pick brand
  searches, other searches, and the ones Google hides. Or pick devices,
  Classifications or rich results.
- **What Google shows, and what gets clicked.** Two rows of 100. A band that
  gets narrower going down is shown a lot but clicked less.
- **Which keywords Google shows, and which get clicked.** A dot for each of
  your 300 keywords with the most impressions. Keywords with no clicks aren't
  drawn, and the line under the chart says how many.

Classifications count clicks from every country. Everything else counts your
home country.

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

Pages are the exception. A page's clicks and views count every country, not
just your home country, so your pages add up to more than the clicks shown
for your home country. Google only counts the searches it keeps private when
no country is chosen, and without them a page can show a small part of its
real clicks. Each screen with page figures says so. Your keywords, and your
website's own totals, are still your home country's.

## Searches, pages and tracked lists

**Keywords** examines the searches associated with the website's results.
**Pages** examines the site's pages. Opening an individual record gives more
context than the list alone. A page can receive traffic from many searches,
and one search can surface more than one page. Google can withhold rare
searches, so adding every visible search row is not a reliable way to rebuild
the site's total clicks or all of a page's traffic.

Each list keeps to one line a row: the name, then a few figures. Impressions
are headed **Shown**; hover over it to see the word. **Up or down** is how a
row's clicks moved against the days before. Click a row to open its own
screen. That's where you track it and see everything else about it.

A keyword's own screen shows its clicks each day, with the span before laid
under them. Then it shows which of your pages Google showed for it, and which
got the clicks. The top row is where 100 impressions went, and the bottom row
where 100 clicks went.

The tracked keyword and tracked page screens narrow attention to the things
the company has chosen to follow. Untick one there to stop tracking it. A company tracking a search is a different
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

## Rolling periods, custom dates and the eye

The shared Dates menu now offers This week, Last week, This month, Last month, Last 3 months, Last 6 months and Last 12 months. Quarters and This year are no longer current choices. Weeks start on Monday. The rolling choices run back by whole months from the source's newest day; they are not financial quarters. The comparison is the block before, while an incomplete calendar week or month uses the corresponding portion of the preceding period. Read the actual bounds rather than treating the menu label as proof that every date has data.

Where custom dates are supported, the comparison covers the same number of days immediately before the chosen span. Choosing dates does not create missing source history. A new connection may open on This month if it has nothing for Last month. Dates and chart step travel in the address, so check the link's filters when comparing two screens. An older quarter bookmark falls back to the section's opening choice.

Supported website data pages also have [What Hakken Sees](./what-hakken-sees.md) in the top-bar eye. Its findings and conversation use the page context; a setup page is not evidence of collected figures. New checked writing uses the configured company credits, while reused writing and a follow-up Assistant answer follow separate rules. This update reviews date and eye integration only; the earlier connection and retention sections retain their original source-review scope. It does not certify every later report change or a live deployment.

Search Console's lists can distinguish a ready-made period from dates requiring a Google request. A custom range or a detail/country not kept ready can therefore load differently from a prepared list. Wait for the page's response and read any refusal instead of assuming a spinner means there were no searches. The date picker does not change Google's privacy filtering or reporting-day basis. A website's totals and the sum of named search rows can still differ.
