---
product: Hakken
documentation_type: Developer guide
feature_area: Insights leaderboards
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/insights-leaderboards.md
last_reviewed: '2026-10-26T12:22:39+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Leaderboards

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Insights leaderboards
> **Reviewed:** 26 October 2026, 12:22:39 GMT (Europe/London)
> **Source path:** `docs/developer/insights-leaderboards.md` · **Status:** Current

`insightsReads.insightsLeagues` projects nine possible leagues from retained `insightsReading.marketFacts`, using `utils/insightLeagues.ts`. The frontend routes are `src/app/(dashboard)/app/insights/leaderboards/page.tsx` and `leaderboards/[league]/page.tsx`, with `_components/LeagueCard.tsx`. Leagues are computed on read rather than persisted as a new ranking table.

## Tenant Context And Candidate Group

The query uses `tenantQuery` and `chosenSite`. An explicit site is checked through `requireMySite`; without selection it chooses the first owned company holding. The explicit branch does not add the owned-only restriction used by several other Insights readers, so do not describe all Insights selectors as identical.

`marketFacts` resolves the site and `loadRivalHolds`, then reads those shared websites' evidence at the site's configured place. It also uses the private list identity for AI summaries. This is the company's permitted watched group, not a cross-customer leaderboard or a census of every discovered competitor.

Hosts for normal website leagues are discovered from current SEO traffic fact keys, with the open host inserted if absent. This means having some other fact alone does not guarantee every potential website enters every league. Missing facts can reduce the group differently by measure.

The query's rivals count is based on the traffic-key host set, while asOf uses current SEO fact dates for the open host. Neither field certifies synchronized dates or equal coverage across every row, local listing and AI source. The query does not accept the general Insights period parameter.

## League Definitions

`LEAGUE_IDS` includes strength, traffic, mindshare, shareOfVoice, links, aiOverviews, recommended, cited and reviews. Strength/traffic/mindshare/shareOfVoice are marked main for navigation and card ordering. The helper only emits a league with at least two rows.

`FACT_OF` maps strength to domain strength, traffic to estimated monthly visitors, mindshare to monthly AI mentions, shareOfVoice to top-three keyword counts, links to referring domains, aiOverviews to source aggregate references and cited to distinct source-page facts. These are different sources and units; a generic value column does not make them interchangeable.

The SEO facts come from `latestFigures` at the resolved place, using rounded supplier estimates where implemented. They are not authenticated competitor Analytics. Prior facts use a historical series search around the prior year and require the same month as the latest source observation; a neighboring month is not silently substituted.

Brand Radar mention facts use each reading's latest month and available corresponding previous-year month. Stored total is supplier mention total, not the number of retained question rows. Its generated fact dates use month-start/day-twenty-eight labels, so do not claim those labels prove all calendar days were independently counted.

## Recommendations And Citations

Recommended-by-AI gathers engines with asked facts and requires recommendation facts before emitting that league. It sums `.recommended` across engines for each candidate host. Missing host/engine recommendation keys contribute zero within an otherwise available recommendation dataset, but missing the dataset does not fall back to generic mentions.

`marketFacts` builds recent recommendations from `siteListAiDays` at the private holding/place/site identity over today minus twenty-nine days through today, bounded to sixty rows per website. The league therefore has a different window from monthly Radar mindshare and cannot be called all-time recommendations.

Current cited facts come from `holdAiSummary` distinct cited-page counts. Historic cited values require the holding's prior AI evidence and read at most nine hundred citation rows per website in the prior-year range, keeping SOURCE URLs distinctly. This is a bounded historic proxy, not proof of complete provider history.

The year-evidence existence check is tied to the list owner's website in this path, rather than an independent proof of every rival's equal historical coverage. A complete-looking prior ranking can still inherit the source bounds; the league helper only knows which facts were supplied.

## Linked Review Profiles

Review rows use fact keys `local.own.<name>.reviews` and `local.rival.<name>.reviews`. The fact builder reads up to forty holding-listing links and does not filter source before adding available review counts, despite comments/labels referring to Google. Other linked platforms can contribute under the current implementation.

Rows are by listing name rather than one consolidated website-review total. Multiple own rows are possible, and `leagueOf` uses the first ranked you row for headline place and gap. Similar names share a fact-key naming concern; source identity should be inspected rather than assuming a name is a unique public profile ID.

Review values are public stored totals, not stars or the amount of text retained in `listingReviewParts`. These leagues do not grant a new read of another company's private reply drafts or review-processing configuration.

## Ranking, Shares And Missing Comparisons

`ranked` sorts current values descending and favors an own row on equal values. It assigns sequential places, not competition-style shared ranks. Historic ordering uses available before values; `placeBefore` is returned only when every current row has a before figure. A non-null before on some rows does not alone produce a move.

Shares are only calculated for mindshare and shareOfVoice and divide a row value by the sum of current row values, rounded to one decimal. This is a within-candidate-set share, not market revenue or unique people. Repeated searches/answers can contribute to several websites, and rounded shares need not sum exactly to one hundred.

`leagueOf` chooses the own row, finds the preceding row in current order and calculates `gapAbove` as a raw value difference. A zero gap can coexist with different sequential places in a tie. The gap does not estimate the implementation cost or guaranteed actions needed to climb.

Missing own data can leave place null while rivals form a valid league. Unknown prior coverage leaves move null. No arbitrary zero or neighboring historic month should be invented by a client to make a complete-looking chart.

## Client Projections And Exports

`LeagueCard` shortens website labels through `shortName`, while reviews use profile names directly. Cards plot full supplied rows with own highlighting and export place/name/value. The detailed route validates league IDs, displays an empty state for absent qualifying leagues and derives row gap/move from the unchanged ranking.

Text search filters displayed labels. `useSiteSortedList` then orders full matching rows before `useSitePager` slices screen pages. Header figures and chart still use the whole league; they are not recomputed to make a filtered subset a new ranked universe.

The table CSV uses its supplied matching/ordered rows and includes move/gap fields, while the card chart CSV uses the whole league. These are local exports of retained projections. Neither performs a provider query, modifies tracking or produces an independent source audit.

No league table adds its own retention lifecycle because the league is computed from other evidence. Underlying SEO series, private AI summaries, Radar months and linked listings retain their respective limits. Removing a rival from the group can change ranking without deleting every shared historic fact about that host.

## Validation And Adjacent Contracts

`utils/insightLeagues.test.ts` verifies recommendations differ from generic mentions, unavailable recommendation data omits that league and historic cited ranking requires complete supplied prior figures. `insightsLoad.test.ts` covers reader budgets. These sources were inspected rather than run, and they do not prove live provider completeness or commercial success.

The initial discovery inventory's cross-company wording was corrected: these leagues use the active holding's watched group. Separate cross-company learning projections in Track record have different contracts and remain separately reviewed work. Do not use a group leaderboard as evidence that all platform customers can see each other.

See [Brand Radar](./brand-radar.md), [AI Visibility Reports](./ai-visibility-reports.md), [Backlink Reports](./backlink-reports.md), [Review Intelligence](./review-intelligence.md) and the [user guide](../end-user/insights-leaderboards.md). PRODUCT.md intent and external rename cutover remain unchanged. Local ranking code and retained figures do not establish deployed service acceptance or proven leads/sales outcomes.
