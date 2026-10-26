---
product: Hakken
documentation_type: Developer guide
feature_area: review intelligence and reply drafts
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/review-intelligence.md
last_reviewed: '2026-10-26T11:39:07+00:00'
reviewed_against: current implementation
status: Current
---
# Review Intelligence

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** review intelligence and reply drafts
> **Reviewed:** 26 October 2026, 11:39:07 GMT (Europe/London)
> **Source path:** `docs/developer/review-intelligence.md` · **Status:** Current

Review intelligence consists of supplier collection, packed shared review evidence, tenant report projections, configured topic decisions and private company reply drafts. The customer routes are `src/app/(dashboard)/app/sites/[siteId]/reviews/page.tsx`, `reviews/rivals/page.tsx` and `reviews/say/page.tsx`. They read `siteReviews.yourReviews`, `reviewsAgainstRivals` and `whatCustomersSay`. The visible copy action is clipboard output; no public reply-posting operation is implemented by these screens.

## Planning And Source Parsing

`reviewPlanning.reviewSteps` skips tracked holdings and companies whose Reviews part is off. It combines own GOOGLE offices and own non-Google linked profiles, then relevant watched rivals. Own review depth starts from the profile total with a minimum margin and a supplier ceiling; later depth combines newly indicated reviews, `reviewsRecheck` and ten extra rows. Rival depth comes from resolved limits and uses a thirty-day reuse period.

`ownReviewDepth` caps requested depth with `GOOGLE_REVIEWS_MOST`, 4,490. This common planner bound should not be represented as an unlimited first import. `localReviews.recheckDepth` finds the depth down to the oldest held unanswered review within ninety days. Counts and that lightweight recheck field let planning avoid reading the full packed review set just to estimate each request.

`reviewParse.parseReviews` resolves IDs by supplier, accepts timestamp-derived day and star values, drops rows missing those required facts and deduplicates IDs within the answer. Trustpilot identity derives from its review URL; Google and Tripadvisor use supplied review IDs. Text combines applicable title and body and is truncated to fifteen hundred characters. Reply parsing retains a date and an approximation marker where available.

Provider credentials and transport use the existing collection action paths. No request, credential value or supplier result containing real customer data was accessed for this documentation review. Source and local tests establish implementation only, not live service acceptance or deployment status.

## Shared Storage And Merge Rules

`localReviews.ts` reads `listingReviewParts.by_listing_part`, bounded to twelve parts. Each part holds up to one thousand rows with packed dates, stars, reply dates, guide markers and optional approximation markers; parallel arrays hold text, names and topic marks. Readers therefore expose at most twelve thousand rows per listing through this path even if storage or supplier history is larger.

`writeReviews` orders newest first with ID tie-breaking, rewrites only changed parts and removes excess parts it read. `mergeReviews` deduplicates by review ID, preserves a known precise reply over a new missing or rougher date, and preserves topic analysis only when review words remain unchanged. A text change makes that review eligible for analysis again rather than treating old topic results as newly verified.

`isAnyonesOwn` checks up to fifty company links. If any is OWN, filing retains text and names; otherwise merging removes text, names and topics from the shared review set. This is a shared-listing policy, not a per-reader text copy. Removing one company's link does not itself immediately purge words, and another company's OWN link can keep them eligible for retention.

`fileReviews` resolves the shared listing, merges observations, writes packed parts and updates `reviewsHeld`, `reviewsRecheck`, `reviewsAnswered` and available public total. It calls local change propagation, removes answered drafts in bounded holding scans and schedules topic analysis or drafting for eligible own reviews. These steps do not establish that an external reply was sent by Hakken.

## Tenant Projections And Dates

`siteReviews` tenant queries start with `requireMySite`. `ownListings` uses the group's setup and either a selected valid Google office or all configured offices plus linked own non-Google profiles. An unavailable office argument falls back to aggregate scope rather than independently reading that arbitrary listing. Membership and selected office context must remain separate from shared listing identity.

`yourReviews` weights Google headline ratings by the stored public counts for included offices. It computes period and previous-period new counts from review days using UK calendar-period helpers, and chart buckets from the selected step. Waiting and oldest waiting use all held unanswered rows, while returned detail rows also span the held set. Do not imply that changing the date menu narrows every field identically.

Reply speed excludes `replyRough` records even though their reply date counts as answered. The period function filters review days, not a separate history of reply events. Some old comments describe read dates, but the parser currently uses supplier timestamps for review day. Document the executable behavior rather than repeating that comment as product truth.

`reviewsAgainstRivals` chooses a valid selected office or the first, relevant rivals, and linked non-Google profiles with suitable own/rival host context. Period counts and answered shares use held reviews. The Google history chart calls `reviewsAtEnds`: current known total minus held rows dated after each endpoint. Incomplete coverage returns null before the oldest held review rather than inventing a complete earlier history.

## Topic Decisions And Continuation

`reviewJudging.ts` implements decision key `discovery.review-topic`. `reviewsToRead` selects an OWN link within the first fifty links and uses that company's resolved decision configuration. Topic marks are written to the shared review record, so this is not a distinct private classification for every company linking the same public listing. That selection and sharing should remain explicit in implementation discussions.

`readNewReviews` stops without requests when the decision is absent or OFF. Otherwise it processes eight reviews against at most twelve profile topics, in groups of twelve requests at once. Each request has its topic in its own state. The resulting plus/minus marks indicate praise or complaint; a not-mentioned result contributes no mark.

Only reviews whose topics all received qualifying model answers are marked read. A rules fallback does not justify completion. Successful work with more unread reviews schedules another turn. A failed model round leaves incomplete reviews for later filing. The no-topics branch writes empty marks for that turn and returns without the normal successful-model continuation, so do not promise every unread record is drained immediately in that case.

`readAgain` clears topic marks and schedules rereading. It is an internal maintenance mutation with potential paid AI consequences, not an operation authorized by this guide or this documentation pass. Changing a model, decision mode or interpretation and rerunning it requires separate operational scope.

`whatCustomersSay` aggregates retained own topic marks, current-year complaints and available profile topics. Rival topic counts come from saved profile topics rather than identical full-text model processing. Read/unread counts and topic counts have different meanings; one review can contribute several marks. Star distributions come from saved profile fields and can have their own coverage limits.

## Private Reply Drafts And Costs

`reviewReplies.ensureReplierInternal` maintains the system replier agent without overwriting its active switch. `repliesToDraft` selects textual unanswered reviews, checks up to fifty OWN links, requires Reviews on for each company and skips known drafts from up to five hundred holding records. It selects ten reviews per company turn. It does not recursively schedule every remaining waiting reply in the drafting action.

`reviewReplyActions.draftReplies` gathers written COMPANY_CHAT instructions, including company rules and memories, then resolves the company's stored chat model configuration. It generates a reply, records staff model usage and stores up to two thousand trimmed characters. A caught failure breaks that company's review loop, leaving remaining reviews for later filing. No posting endpoint is called.

`writeReplyDraft` replaces or inserts by holding and review ID, with listing identity and drafted timestamp. That key does not include listing ID, a distinction to preserve when investigating supplier ID collisions across linked profiles. The report reads at most two hundred drafts and returns twenty matching waiting textual reviews. This is a bounded projection, not proof that all eligible drafts are absent when a card is missing.

`perReplyUsd` averages the latest twenty transactions for the shared replier agent across companies. It returns a processing-cost indicator, not the active company's spending total or a fixed retail charge. Prompt/response recording follows the staff transaction path, so retention of review-related information is not confined to packed review words and draft tables alone.

## Retention And Verification Evidence

`keepRules.ts` retains review parts with the listing lifecycle and treats drafts as latest data. `dropAnsweredDrafts` checks at most fifty listing links and five hundred drafts per own holding; observed answering triggers bounded deletion. `localSweep` clears associated review parts and other data for sufficiently old unseen unlinked listings. Do not describe those bounded processes as immediate guaranteed erasure everywhere.

`reviews.test.ts` covers supplier parsing, rough/precise reply dates, text retention, repeat merges, recheck depth, own depth and reconstructed historical counts. `reviewsLoad.test.ts` covers report read budgets. These tests were read, not run, and do not prove model quality, provider purchase success or live posting. See [Local Business Profiles And Listings](./local-business-profiles.md), [Collection Operations](./collection-operations.md) and the [user guide](../end-user/review-intelligence.md) for adjacent setup and workflow context.
