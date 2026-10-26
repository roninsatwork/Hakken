---
product: Hakken
documentation_type: Developer guide
feature_area: local Maps and market reports
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/local-maps-and-market.md
last_reviewed: '2026-10-26T11:33:24+00:00'
reviewed_against: current implementation
status: Current
---
# Local Maps And Market

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** local Maps and market reports
> **Reviewed:** 26 October 2026, 11:33:24 GMT (Europe/London)
> **Source path:** `docs/developer/local-maps-and-market.md` · **Status:** Current

Maps and market reports join retained Google local evidence to the company's private website context. `siteLocalMaps.ts` implements ranking and single-search reads, `siteLocalMarket.ts` implements the category market query, and `siteBusinessDetail.ts` composes a business comparison from several stored sources. These handlers do not make live provider calls while rendering reports.

## Entry Points And Tenant Context

The customer routes are under `src/app/(dashboard)/app/sites/[siteId]/local/`: `maps`, `maps/search`, `market` and `market/business`. The market screen invokes the existing `siteLocalListings.linkListing` mutation for Watch as a rival. That action changes private setup and can trigger a profile purchase; it is not a passive report read.

Each query starts with `requireMySite` in a tenant wrapper. `localSetup` resolves the group owner's private office/rival setup through `localWatchList` and resolved limits. `openOffice` selects a matching office ID or falls back to the first configured office. An arbitrary office ID therefore does not independently widen the setup's office set.

There are narrower authorization facts worth preserving. `mapSearch` reads a supplied keyword at an authorized office point through `latestChecks`; it does not revalidate that keyword against the current private tracking list. `businessDetail` accepts `listing:<id>` and can resolve that shared public listing directly after the site check. Do not claim these shared-evidence paths enforce current private-list membership on every supplied argument. Company watch lists remain scoped separately; deciding whether to narrow shared evidence further is outside this documentation task.

## Selection And Planning

`localPlanning.localSteps` skips tracked holdings and companies whose Local part is off. It uses seven-day profile periods and thirty-day market periods. Office/rival profile, post and question work shares those period keys. Market work requires an office point and first category ID, then uses resolved radius and requested-business limits.

Map work starts from active `holdSearches` bounded by tracked limits and `withinFanOutLimit`. `officesForSearch` normalizes keyword and town into words: matching town phrases select those offices, while no named town selects all available placed offices. This is explicit lexical assignment, not geocoding a search or asking a model which town it means.

`mapCheckParams` supplies keyword, point and configured depth. `localMarketParams` supplies category, point, radius and limit. Operation parameters and registry definitions are implementation evidence, not proof that a live request ran or that a particular saved response has complete coverage. The collection orchestration owns idempotency, sending, errors and provider costs.

## Map Storage And Filing

`localFiling.fileMapCheck` upserts returned listings without treating a brief result as a whole profile, preserves their order, deduplicates supplied reason strings and packs a parallel reason-index column. `mapChecks` identity is point, keyword and day through `by_point_keyword_day`; another filing for the same key replaces the earlier check rather than deliberately appending a duplicate.

The filing path reads up to ten listing records at the same point, calculates each listing's observed place and writes a packed listing/search position history. `writeMapPlace` keys by `by_listing_keyword`, replaces a day's earlier value, orders days and packs them. Zero means not among the returned IDs. It then requests local change propagation for the bounded affected listing set.

`localReads.officeChecks` reads one or two newest map checks per selected search at the office's point. `latestChecks` reads the newest two for a supplied point/keyword. Current ranking screens derive places directly from those checks; they do not need to unpack the whole retained position history for every row.

## Ranking Projection And Denominators

`mapRankings` returns office options, selected office, configured depth and selected searches. With no office it returns empty rows and appropriately null comparison figures. A row with no check has null place; an observed result that lacks the office has zero; an observed presence is its one-based index.

Row movement is previous place minus current place only when both are positive. Map-box membership means positive and at most three. Current coverage counts checked searches; change counts the difference in top-three membership only across checks with a previous observation. Those measures have deliberately different candidate sets.

Average place excludes absences, while on-map and not-on-map counts separate positive and zero places. The most-often-first business comes from first IDs across current checks. None of those statistics is a share of all searches in a geographical area, and the average cannot be treated as a penalty-inclusive rank for absent searches.

`searchVolumesOf` first uses `siteKeywordRanks` when volume is known, then falls back to stored search volume at `site.place`. `googlePositions` reads `websiteSearchStats` for the same website/place. These are regional website-search facts joined beside office-point Maps facts. They are not necessarily from the same day or sampling frame.

`mapSearch` projects the newest check into ordered listing rows, resolving reasons from the packed indices. Missing listing records are omitted. Its box rating/review averages use the first three projected businesses, which can differ from the original first three IDs when a record is missing. It returns the office and its observed place, previous positive movement where available, website rank and retained volume without requesting a provider refresh.

## Market Storage And Totals

`fileMarket` retains at most 250 returned businesses (`MARKET_KEPT`), upserts them with light profile trust and derives straight-line distance from saved coordinates. It orders rows by known distance, packs distances and replaces `localMarketParts` through `by_market` keyed on category, point and radius. Stored total is at least the retained row count, preserving a larger supplier total where supplied.

After filing, `matchRivals` and `noteLocalChange` propagate local context. These source operations should not be conflated with an operator manually verifying every business identity or public ownership. Limited notification fan-out uses up to ten listings at the relevant point.

`localMarket` resolves the selected office's first category and point, then reads the matching current part at the resolved radius. Missing prerequisites or part produce no observation. It joins shared listing records, distances and current office-search map boxes, omits unresolved listings and adds the office if the retained supplier list lacked it. Consequently displayed rows, saved supplier total and map-box counts can legitimately concern different sets and dates.

## Combined Business Detail

`siteBusinessDetail.findBusiness` accepts a website host or listing identity. Host lookup searches watched local rivals and records near the first office in its market or saved checks. A `listing:` key is normalized and read as a shared listing directly. A watched competitor website is resolved separately through `myRivals`, so local listing identity and private tracked-website membership are distinct.

The query uses the first office for Maps, distance and several review comparisons. It does not accept an office selector argument. Brand Radar comparisons come from held readings; ChatGPT business-card evidence comes from bounded `appAnswers`; web mentions are available for an applicable watched competitor. Missing source coverage remains nullable rather than a fabricated all-source zero.

ChatGPT matching uses host equivalence when present. Without a card host, it requires an exact normalized listing name and the listing town in the address. Own-business matching can also use configured brand-name heuristics. This is evidence association, not an external identity registry. Question comparisons rank observed first-mention timestamps among the held group; they are not universal Google AI positions.

Detail also combines retained non-question activity with weekly rating/photo changes. Derived advice can identify a higher-volume question gap, relevant directory/review-source gap or faster review answering. Such statements summarize available observations; they neither execute those actions nor prove a commercial outcome.

## Retention And Verification

`keepRules.ts` declares map checks as ninety-day data, position history as retained history and local market parts as latest. `localSweep` expires checks using their creation time and clears sufficiently old unseen unlinked listings with associated evidence in bounded steps. Current check expiry and a packed history's lifetime are different concerns; do not promise reconstruction of every old result list from positions alone.

`localFiling.test.ts`, `localParse.test.ts`, `localLoad.test.ts` and `siteBusinessDetail.test.ts` provide relevant local evidence. The business tests cover watched-rival cross-source comparisons, derived summaries and a business known only by its Google profile. These files were inspected rather than executed. No provider request, ownership claim, application session or live integration acceptance was performed for this documentation pass.

See [Local Business Profiles And Listings](./local-business-profiles.md) for mutation permissions and limits, [Collection Operations](./collection-operations.md) for orchestration and the [user guide](../end-user/local-maps-and-market.md) for interpreting the reports. PRODUCT.md section 33 remains the separate rename-cutover checklist; local table and parser behavior does not establish that deployed credentials, renamed infrastructure or supplier callbacks are operational.
