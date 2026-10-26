---
product: Hakken
documentation_type: End-user guide
feature_area: local Maps and market reports
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/local-maps-and-market.md
last_reviewed: '2026-10-26T11:33:24+00:00'
reviewed_against: current implementation
status: Current
---
# Local Maps And Market

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** local Maps and market reports
> **Reviewed:** 26 October 2026, 11:33:24 GMT (Europe/London)
> **Source path:** `docs/end-user/local-maps-and-market.md` · **Status:** Current

Hakken's Maps and local-market reports help a company compare its offices with businesses found in saved Google Maps and local-business observations. They answer different questions: Maps shows positions for selected searches from an office's point, while Local market shows retained businesses matching an office's category around that point. Neither is a live view of what every customer currently sees.

Open an owned website in Visibility, establish its Google offices in Your listings and select Local. Map rankings opens at `/app/sites/[siteId]/local/maps`; Local market opens at `/app/sites/[siteId]/local/market`. Choose the relevant office where a selector is available. An office needs usable saved location evidence before these reports can provide its corresponding local observations.

## Set Up The Right Search Context

Maps uses the company's private active tracked Google searches, subject to the resolved tracking and fan-out limits. It assigns a search mentioning an office town to matching offices; a search naming none of their towns is assigned to all available offices with a saved point. This is word-based selection, not a judgment that every selected phrase has the same local intent.

Check your tracked list before interpreting missing rows. A search that is paused, outside the applicable limit or assigned to another town may not be part of this office's current report. Editing a private tracking list is separate from buying a new Maps observation. The report reads stored checks and does not ask Google simply because you open or sort it.

The location is the office's saved point. A position at that point is not the same as a grid of positions across a city, a nationwide search result or a customer's personalized phone session. If an office has moved or its coordinates are wrong, investigate the listing setup before treating a ranking difference as a marketing change.

## Read The Map Rankings Table

Each search row can show estimated search volume, the office's Maps position, movement since the previous saved check, the website's Google position, the leading observed business and the checked day. These columns draw on different retained records. Volume and website Google rank concern the website's configured place, while Maps position concerns the office point.

A positive Maps position means the office was present at that place in the saved result list. Zero means it was not among the businesses read in that check. Missing means there was no corresponding check available. Zero is therefore not an assertion that Google will never show the office; missing is not evidence that it ranked outside the list.

The report exposes a result depth from the resolved limits, with a fallback of twenty. A business absent from those observed results may still appear beyond the purchased depth or under another search context. Read depth alongside position, rather than interpreting not seen as a universal last place.

Movement is calculated only when the office was present in both the newest and previous checks. Positive movement means it moved up: fifth to third is plus two. An appearance or disappearance does not receive a fabricated number of places moved when one side lacks a positive position. Missing movement can therefore be the correct representation of the evidence.

Use the screen's text search, filters and heading sorting to inspect the retained rows. The shared Sites table controls paginate the available report. Paging changes what you see on screen; it does not buy additional result depth, expand the private tracking list or turn an old observation into a current one.

## Interpret The Summary Figures

Map-box coverage counts checks where the office appeared in the first three observed places. Its denominator is the selected searches that actually have a check, not all possible searches in the town. An office can have a favorable fraction over a small checked sample while many selected searches remain unchecked.

The change in map-box coverage compares only searches with both a newest and previous check. It counts the difference between how many of those paired observations were in the first three. This can have a different denominator from the overall current coverage figure, so do not subtract headline percentages and expect them to equal that count change.

Average place uses positive observed positions and excludes checked absences. On map counts positive positions; not on map counts checked zero positions. A better average can coexist with more absences because the average describes only appearances. Read all three measures together before concluding that overall local visibility improved.

The business most often first is chosen from the first stored result in each checked search. It is a count across your selected observations, not market share, revenue or the most popular company in the whole area. Your own office can be that leading business.

## Open One Search

Open a search row to inspect `/local/maps/search`. The page shows the saved day, ordered businesses, the office's place and any supplied reason for each result. Reasons come from the stored supplier response; they are evidence labels, not a complete account of Google's ranking algorithm or proof of why one business won a customer.

Businesses can be marked as your office or a rival your company already watches. An unmarked business in a result is simply another observed listing. Its presence does not automatically add it to your watch list, assert it is a direct commercial competitor or authorize a collection purchase for all its other data.

Top-box rating and review figures average the available first-three displayed businesses. Missing shared listing records can affect which businesses can be projected. Those averages describe retained examples, rather than a new independent measurement of every public rating at the time you read them.

The page is observational. It does not publish a Google post, respond to a review, change a listing category or ask Google to rank a business differently. Use the evidence to prepare a concrete investigation on the relevant service, with the saved date and location attached.

## Explore The Local Market

Local market uses the selected office's first saved category identifier, its point and the configured radius. Without a point, category or stored market result, it returns no market observation. That empty state is different from a confirmed finding that no businesses operate nearby.

The radius defaults to ten kilometers when no resolved value is available. The actual company limits also control how many businesses collection requests. The filing code retains up to two hundred fifty businesses from a market answer. A reported supplier total can therefore be greater than the visible retained list.

Rows can show category, rating, review count, distance and how often the business appears in the top three of the office's selected map checks. Distances are derived from saved coordinates, not driving directions or travel time. Missing distance does not mean the business is next door, and your own office intentionally has no rival-distance value.

The report includes your office for comparison even when it was not present in the supplier's returned market list. As a result, a displayed row count and supplier total are not guaranteed to describe the identical set. The map-box column is joined from selected search checks, which may have different saved days from the market list itself.

## Watch A Rival And Open A Business

Watch as a rival links a market listing to the owned website's private Local setup. It uses the same permissions and limits as Your listings, can associate the rival with the nearest office and may request a full Google profile refresh when Local is enabled and the stored reading is old. This action has collection implications; it is more than highlighting a row.

Open a business to see the retained comparison detail. It can combine Maps, ratings and reviews, ChatGPT business cards, Brand Radar and web mentions where those sources are held. Some sources are only read for watched competitor websites, so an untracked local business can have a useful profile with missing AI or mention comparisons.

The combined business detail uses the first configured office for several own-business comparisons. It does not guarantee that every section follows the office you previously selected on another report. Check the named office/context before comparing distances, reviews or Maps results for a business near another branch.

Matching generally relies on websites, with a narrower exact-name-and-town fallback for ChatGPT cards without a website. Similar names are not a dependable identity. If two records appear inconsistently, inspect their saved hosts and locations before merging conclusions or requesting a source correction.

## Freshness, Retention And Follow-Up

Local collection plans profiles and posts in seven-day periods and category markets in thirty-day periods. These are planning and reuse intervals, not a guarantee that a scheduled job ran successfully or that every figure has the same reading date. Maps checks have their own saved days and collection context.

Detailed map checks qualify for cleanup after ninety days. Packed office/search position histories have a different retained lifecycle, and current screen comparisons use the newest checks rather than reconstructing every past business list from those histories. Local market is a latest-result record, not a complete historical market directory.

For a practical review, verify the office and tracking list, note the evidence day and depth, inspect searches with meaningful customer intent, then investigate specific differences using the business detail and public service. A change in stored ranking does not alone prove more leads or sales. See [Local Business Profiles And Listings](./local-business-profiles.md), [Google Search Tracking](./google-search-tracking.md) and the [developer guide](../developer/local-maps-and-market.md) for setup and implementation boundaries.
