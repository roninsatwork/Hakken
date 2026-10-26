---
product: Hakken
documentation_type: developer guide
feature_area: website holdings and Visibility navigation
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/websites-and-visibility.md
last_reviewed: '2026-10-26T08:59:02+00:00'
reviewed_against: current implementation
status: Current
---
# Websites And Visibility

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Website holdings and Visibility navigation
> **Reviewed:** 26 October 2026, 08:59:02 GMT (Europe/London)
> **Source path:** `docs/developer/websites-and-visibility.md` · **Status:** Current

## Identity, holdings and scope

The core website model separates a global host from a company's relationship
to it. `convex/websites.ts` creates or reuses global hosts; `companyWebsites`
records the company hold. `convex/sites.ts` provides the client-facing list,
site context and picker. This guide covers that foundation and shared
navigation, rather than claiming detailed review of every AI, keyword,
backlink, local, paid or radar report under `/app/sites`.

`src/app/(dashboard)/app/sites/page.tsx` groups tracked competitors beneath
owned websites. Route-local shared parts supply the website picker, menu,
filters, tables, charts and downloads. Platform administration lives under
`/admin/companies/[id]/websites` and `/admin/websites`. The former manages a
company relationship; the latter is the shared registry. Their mutation
scope and destructive consequences are deliberately different.

Read [PRODUCT.md](../../PRODUCT.md) for intent and the
[end-user guide](../end-user/websites-and-visibility.md) for the actual
relationship model. This local implementation is not proof that all planned
asset-record or business-outcome capabilities are delivered. Detailed report
families remain separate queue items in the documentation inventory.

## Normalize once and reuse the shared record

`websiteIdentity.readWebsiteHost` owns host normalization.
`websites.requireHost` converts failures into application errors, and
`findOrCreateWebsite` is the shared creation path. Scheme, ordinary `www`,
path, query, fragment and a trailing hostname dot must not create duplicate
hosts. A real subdomain remains distinct: `shop.example.com` must not be
merged into `example.com`.

The global `websites` table is indexed by normalized host. The display host
can be used for readable presentation without becoming a second identity.
`previewWebsiteHost` shows the normalized target before a write so an operator
can catch an unintended parent/subdomain choice. A feature accepting a URL
must reuse this path rather than invent another regular expression and
silently create a second record for a spelling variant.

Private source connections must not attach to the global host alone.
Search Console, Analytics and Bing figures are filed under the company's
hold, even when several companies share the same `websites` row. Shared
supplier acquisition reduces duplicate purchasing; it does not merge
customer authorization.

## Roles, relationships and pairing

`websites.ts` exposes setup mutations through `superAdminMutation` and global
reads through `superAdminQuery`. `addCompanyWebsite`,
`setCompanyWebsiteSchedule`, `setCompanyWebsiteLocation`,
`removeCompanyWebsite` and `deleteWebsite` are platform-management paths.
The client-facing `sites.listMySites`, `getMySite` and `listPickerHolds` use
tenant queries. Do not infer write permission from a client report being
visible to a company administrator.

`siteAccess.findMySite` checks the hold's `companyId` against the resolved
company; `requireMySite` refuses a foreign hold. `companyHolds` reads
`companyWebsites.by_company`, resolves the associated hosts and orders owned
sites before tracked ones. `myRivals` and `groupOwner` derive comparison
context using the company relationship, rather than a platform-wide graph
that might expose another customer's choices.

`websiteAttachments.ts` owns tracked attachments and pairing.
`addTrackedWebsite` and `addTrackedCompetitor` use super-admin mutations.
`setTrackedPairing` requires a tracked hold and resolves an owned target in
the same company, rejects self-competition, and clears settings that cease
to apply when the tracked site adopts its pair's context. A tracked site can
also have no owned pair; list readers must handle that state rather than
select an arbitrary owned website.

## Schedules, limits and private tracked lists

`companyWebsites.refreshIntervalStr` and `collectionEnabled` are optional.
Absence means inherit; saving a copy of the company value would break future
inheritance while looking identical initially. `seoScheduleService.ts`
resolves effective schedule behavior using the common schedule helpers.
A paired competitor follows its owned pair's schedule and place. Different
companies can still watch the same host with different requirements; global
fetch-rate derivation chooses applicable shared acquisition timing without
rewriting each company's choice.

Location is held on the company join as `locationCode` and `locationLabel`.
`searchConsoleCountries` holds market choices used by ready-country private
reads. Other collection and fan-out limits use `companyDataLimits` and
`fanOutLimits`, with platform/company/site inheritance. A table page size is
a presentation choice, not one of those acquisition limits.

`convex/holdLists.ts` is the required read boundary for a company's tracked
searches and AI questions. `holdSearches` and `holdQuestions` use `by_hold`
or `by_hold_active`; a null hold returns an empty list. A competitor's
comparison can read the owner's list where that is the defined relationship,
not another company's list for the same host. Writers can use reverse indexes
to file shared purchased results, but must never return those cross-company
reverse-index discoveries as a reader's tracking list.

`siteListAi` maintains list-level AI summaries when data is filed.
`sites.ts` reads summarized figures through `siteFigures`, `holdAiSummary`
and related helpers rather than issuing a question-by-engine fan-out for
every page load. Preserve that distinction when adding a report: private
list membership, shared purchased answers and maintained summary rows serve
different purposes.

## Client reads, counts and common controls

`listMySites` builds the company's overview rows. The last-collected helper
checks recent cycle lines for READY pulls with a completion timestamp; a
planned line or wholly failed run is not successful collection. Open moves
are counted to a bound and represented with a capped indicator rather than
being claimed as an exact unlimited count. Coverage helpers distinguish the
held subset from the full source population.

The initial site list is small and server-bounded, so it arrives whole;
searching and grouping can happen client-side. Larger report lists use
server reads. Shared `useSitePager` paginates a whole held list and
`useSiteSortedList` orders that whole list before paging. Server-backed
reports use the corresponding Sites pager/read path and must sort over the
full selected list rather than only the displayed page.

`siteTableRows.ts` defines 25, 50, 75 and 100 rows, with 25 opening.
`siteRowsPageKey` identifies the page type independently of the current host,
so equivalent pages share the browser preference. URL state preserves page,
search and filter context, while defensive storage handling tolerates a
browser refusing local storage. A second table names its own controls through
`tableKey` instead of colliding with the first table's parameters.

`useSiteSort` and `convex/utils/sortOrder.ts` own heading direction and blank
ordering. The first click uses the column's declared useful direction and a
second reverses it. A cut/coverage note must remain visible when the exact
held-list count is smaller than the supplier population. Do not invent a
universal 15-row admin default inside a Sites report or use an exact footer
to imply complete supplier coverage.

## Remove a company hold versus delete a host

`removeCompanyWebsite` removes company-side moves, limits, classifications,
profile and local choices, schedules private-list and source-connection
cleanup, and deletes the hold. It also schedules fan-out and hold-page
cleanup. If the removed relationship was a paired competitor, it requests
recounting for the owned list affected. The audit action is
`REMOVE_COMPANY_WEBSITE`, with the company and host context.

`googleConnection.forgetHold` handles private connection cleanup, including
Search Console, Analytics and Bing paths. `websitePurge.purgeHoldListsInternal`
and related helpers remove the company's own search/question records.
The shared host and collected supplier observations remain when only one
company detaches it. Do not call the global host deletion path to implement
a company list's Remove action.

`deleteWebsite` instead deletes the shared `websites` root, forgets its icon
and schedules `purgeWebsiteListsInternal`, `purgeWebsiteHoldingsInternal` and
`purgeWebsiteCollectedDataInternal`. It audits `DELETE_WEBSITE` with affected
watchers. The purge module chains bounded passes for lists, holdings, packed
parts and related purchased observations. The mutation's return confirms
admission of deletion, not a synchronous transaction erasing all related
records.

## Verification and remaining subareas

Useful tests include `websiteIdentity.test.ts`, `websites.test.ts`,
`websiteAttachments.test.ts`, `websiteClientView.test.ts`,
`websiteTenancyGuard.test.ts`, `websitePurge.test.ts` and the pagination drift
guard. They cover distinct identity, relationship, privacy and cleanup shapes.
This documentation review inspected relevant implementations and selected
source/test declarations; it ran no tests, browser session, mutation,
collection, migration or paid request.

The reviewed foundation does not make all report families current. Keyword
metrics, AI answers, backlinks, local reports, reviews, radar, paid results,
content drafts and detailed page classifications require their own source
review and guide coverage. Keep those queue entries open. Any future changes
to tracking membership, scoring semantics, tenant access, schedule behavior or
destructive cleanup require the repository's product agreement and full code
verification, not an incidental fix while maintaining Markdown.
