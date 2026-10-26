---
product: Hakken
documentation_type: end-user guide
feature_area: website holdings and Visibility navigation
audience: company members and platform administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/websites-and-visibility.md
last_reviewed: '2026-10-26T08:59:02+00:00'
reviewed_against: current implementation
status: Current
---
# Websites And Visibility

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Website holdings and Visibility navigation
> **Reviewed:** 26 October 2026, 08:59:02 GMT (Europe/London)
> **Source path:** `docs/end-user/websites-and-visibility.md` · **Status:** Current

## The website is the starting point

Visibility starts with the websites your company owns and the other websites
it has chosen to watch. Open the section at `/app/sites`. The initial list
organizes owned sites with their tracked competitors beneath them. Choosing
a row opens that company's view of the website, not an unrestricted global
account. This guide covers that organization, shared controls, setup ownership
and removal boundaries. Detailed AI, backlinks, local, paid and other report
families still need their own reviewed guidance.

A website can be known to Hakken because several companies hold it. Supplier
observations can be shared so the same host does not need an independent
purchase for every watcher. Your company's choices remain separate: which
sites you watch, which of your own sites a competitor is compared with, your
tracked searches and questions, and your private source connections. Another
company watching the same address does not acquire your private Analytics or
Search Console figures.

The section describes implemented data views, not a guarantee that every
part of Hakken's product vision has been delivered. In particular, a traffic
estimate or an AI mention is not an asset profit-and-loss record, a lead or a
sale. For the distinction between platform foundations, implemented exceptions
and planned product direction, read [PRODUCT.md](../../PRODUCT.md). Known
status discrepancies between that document and newer code are recorded in the
[documentation inventory](../index.md#documentation-coverage-inventory).

## Owned sites and tracked competitors

An owned website represents your company's own site. A tracked website is
somebody else's site that your company has chosen to observe. A competitor
can be paired with one of your owned sites, which gives the comparison its
context. A business running more than one website should check which owned
site each rival sits beneath rather than assuming every competitor is a rival
for every part of the business.

The initial list can fold competitors beneath their owned site and can also
show tracked websites watched against none of your sites. Expand a site to
inspect its rivals. Search narrows the company's list and unfolds an owned
site when a matching competitor needs to be shown. A company with one owned
site can see its competitors without an extra expand action.

Ownership is a workspace classification, not a claim that Hakken verified
legal ownership of every host. It controls which private integrations can be
connected and how collection is planned. If a site is incorrectly classified,
ask the platform administrator to inspect the relationship. Do not connect a
Google account to an unrelated competitor just to get past a missing-data
screen.

## Who manages the list

The customer-facing Visibility list is a read surface. Website setup and
relationship changes currently belong to platform super administrators.
Company members should not expect an Add or Delete control simply because
they can read the website's reports. A company administrator's rights to
manage their own private source connection are separate from platform rights
to edit the central holdings configuration.

The platform administrator works under Admin → Companies → the company →
Websites. The broader Admin → Websites section is the global host registry
and collection/cost area. These two levels serve different purposes. The
company screen attaches or removes a relationship; the global screen manages
a host that may affect several companies. Be precise about which operation
you are requesting.

When a website is added, review the normalized host shown by the form. A URL
such as `https://www.example.com/products?ref=mail` identifies `example.com` for
this registry. A distinct subdomain such as `shop.example.com` remains a
separate host. A path is not a way to register another independent website
record for the same host. If your reports need a specific path or a separate
shop, discuss the intended scope before adding an address.

## Location, schedules and inherited choices

A company can watch a site from a selected location. This is a company-side
setting: two companies watching the same host may care about different
places. A result for one location should not be presented as a universal
ranking for everyone. Check the site header and market/location context when
comparing a result with another company or a direct browser search.

Collection schedules can be inherited from the company or overridden for a
website. Inheritance is a live relationship, not a one-time copy. If the
company's schedule changes, a website still following it moves with that
change; a website with its own override can keep a different cadence. The
collection switch is also distinct from cadence. A schedule can exist while
collection is disabled.

A competitor paired with an owned site follows that site's comparison
schedule and location rather than an unrelated independent setting. Changing
the pairing can therefore change the context of future observations. Ask the
operator to verify the intended pair, location and effective schedule
together. A date in the interface describes expected work, not proof that a
supplier response has successfully returned.

Some limits are inherited separately from schedules. Collection quantities,
retained detail and displayed rows are not all the same limit. A result may
say only part of a larger source list is held. Read that coverage note before
reporting a visible count as the website's entire population.

## Reading the initial list and site header

The initial list shows summary signals such as AI mentions, keywords, leading
positions and estimated traffic where available. Some figures can be absent
while a source has not returned. Absence is not the same as measured zero.
A recent attempted collection also does not establish success: the backend's
last-collected indicator looks for a request that actually returned ready
data.

Open a website to see the site context and the section menu. A competitor
uses the same family of report pages, but its owned/tracked relationship and
pairing still matter. Private first-party source sections, including
[Search Console](./search-console.md), [Google Analytics](./google-analytics.md)
and [Bing Webmaster](./bing-webmaster.md), have their own ownership and
connection requirements. Shared supplier data must not be mistaken for a
private source connection.

Saved summaries let the interface show a website without recalculating all
underlying purchases and questions every time you open it. They can have a
different timestamp from an individual detail. When two signals appear to
conflict, inspect source, period, location, held coverage and freshness before
assuming the calculation is wrong.

## Use tables consistently

Sites tables use numbered pages with 25, 50, 75 or 100 rows, opening at 25.
Your browser remembers the rows choice per type of page. If browser storage
is unavailable, the current visit still works but the choice may not survive
a reload. Changing a page-size preference is not a data write or a request
to collect more supplier rows.

Sort by a table heading. The first selection uses the column's useful order,
and another selection reverses it. Sorting applies to the complete list the
view is using, not merely the visible page. Blank values are kept apart from
real measurements. A large server-backed report and a small company-site
list can use different loading mechanisms while keeping the same controls.

Search, filters, dates and pagination can be reflected in the address so
Back returns to useful context. Read the footer carefully: a count can be an
exact count of what is held while a separate note explains that the supplier
population is larger. Exported or copied figures should retain that
qualification, along with their source and dates. Do not turn an “at least”
count into an exact claim in a customer report.

## Removal, deletion and next steps

**Remove from this company** detaches that company's relationship. The
implementation removes company-side choices and schedules cleanup of its
private lists, source connections, related page records and other hold data.
The shared host and supplier data can remain for other companies. A removed
competitor is also removed from the relevant comparison context and dependent
summaries can be recounted.

**Delete the website** on the global platform surface has a much wider effect.
It removes the shared host and schedules cleanup of holdings and collected
data for every affected company. It is not a shortcut for hiding one
company's row. Before requesting it, have the operator inspect all watchers
and confirm the intended scope. Cleanup proceeds in batches; disappearance
of a row is not evidence that every related stored record vanished in the
same instant.

If something looks wrong, report the company, website, owned/tracked
classification, pairing, location, dates and the specific report. That gives
the operator enough context to inspect the right relationship without
starting another paid collection. The [developer guide](../developer/websites-and-visibility.md)
explains identity, authorization and cleanup. This documentation review
changed no holdings, started no collection and checked no live integration.
