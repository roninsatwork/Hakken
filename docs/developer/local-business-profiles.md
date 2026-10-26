---
product: Hakken
documentation_type: Developer guide
feature_area: local business profiles and listings
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/local-business-profiles.md
last_reviewed: '2026-10-26T11:30:14+00:00'
reviewed_against: current implementation
status: Current
---
# Local Business Profiles And Listings

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** local business profiles and listings
> **Reviewed:** 26 October 2026, 11:30:14 GMT (Europe/London)
> **Source path:** `docs/developer/local-business-profiles.md` · **Status:** Current

Local profiles combine shared public business records with private company-to-listing links. This guide covers selection, profile assessment, office comparison and activity evidence. `siteLocalListings.ts`, `siteLocalProfile.ts`, `localReads.ts`, `localListings.ts` and the activity portion of `siteLocalMarket.ts` are the main read/write surfaces. Maps, market discovery and review assessment have additional handlers and should not be assumed fully documented by this profile guide.

## Routes And Data Ownership

Customer routes live below `src/app/(dashboard)/app/sites/[siteId]/local/`: the index is Business profile, `offices` compares offices, `listings` manages links and `activity` shows saved activity. The listing page invokes `findListing`, `linkListing` and `unlinkListing`; the profile views invoke `businessProfile` and `everyOffice`. These are retained-evidence reports except for the explicit listing actions and their collection side effects.

`localSchema.ts` defines sources GOOGLE, TRUSTPILOT and TRIPADVISOR. Shared `listings` identity is source plus supplier key, resolved through `by_source_key`; its latest fields can include website host, location, counts, profile and read timestamps. `holdListings` stores company holding, company ID, listing ID, OWN/RIVAL role, optional associated office and provenance. A shared listing's presence is not membership in a company's watch list.

Other tables include packed `listingWeeks`, bounded packed `listingActivityParts`, current per-source `listingFinds` and the Maps/review evidence consumed by profile summaries. Week and activity readers use `by_listing`; setup reads `holdListings.by_hold` and unlink lookup uses `by_hold_listing`. Do not replace company membership checks with a raw lookup of the shared listing.

## Authorization And Explicit Actions

Read handlers use `tenantQuery` and `requireMySite`. `requireOwnSite` additionally rejects `isOversightRole` and tracked competitor holdings before listing mutations. This allows eligible company members to manage their own website setup without granting platform oversight write privileges. It is not a Google or review-platform owner verification process.

`linkListing` accepts an existing shared listing ID and a role. It does not require proof of external ownership or that the record appeared in that holding's most recent Find. That is the implemented local declaration contract; do not document a supplier ownership check that does not exist. Missing records produce a not-found error requesting another Find.

`localListings` reads at most two hundred links and three per-source search contexts. Tracked holdings return no editable listing setup. Profile helpers instead use `groupOwner` to resolve the owned website's local setup when navigating related competitor context. This deliberate reuse does not authorize a competing holding to maintain an independent copy of the office list.

## Find And Purchase Reuse

`findListing` trims text and normalizes whitespace, accepts two through one hundred twenty characters and chooses a source-specific operation. `requireBuying` checks the company's Local part. This is independent of whether scheduled collection runs are enabled: an explicitly requested Find can still buy while recurring runs are off.

`buyNow` resolves the operation registry, builds an idempotency key from operation, the listing namespace, parameters and period, and looks for a reusable pull. A new pull is PENDING with company attribution, task arguments, cost initially zero and an immediate due time. `startCollector` sends pending work; an already non-pending reusable pull does not start another equivalent send through this branch.

The mutation replaces bounded earlier Find contexts for that holding/source. If a reusable pull has already filed, it copies available found IDs from another saved context. If the raw result is filed but no saved Find context remains, it schedules `parseSeoResult` again to reconstruct the result. Reuse therefore includes both purchase reuse and a filing repair path, not just returning a cached frontend array.

`localFiling.fileFound` fans one result to at most fifty Find contexts associated with the pull. Empty supplier results are valid answers for supported operations rather than universally retriable failures. The page exposes waiting, failed and available result states. None of these source paths was executed during this documentation pass.

## Linking, Limits And Side Effects

Resolved limits come from `readFanOutLimits` for the company/holding. The own-office limit counts GOOGLE listings with OWN role. The rival limit counts other rival links against the selected office, including unassigned rivals as specified by the filter. Existing links are patched with role, association and HAND provenance rather than deliberately inserted twice.

`nearestOffice` uses geographic distance when both sides have coordinates, falling back to the first available office if coordinates cannot determine a nearest match. A rival without a specific association is applicable across offices. This association is a practical setup rule, not a guarantee that a business is a commercially appropriate competitor.

A GOOGLE link whose `profileReadAt` predates the current seven-day profile period can trigger `buyNow` for `google_business_profile` when Local is enabled. `businessProfileParams` supplies the supplier key through the existing configured operation path. Linking while Local is off can still change the private setup, but does not buy that profile refresh. The local summary is rewritten after linking.

`unlinkListing` deletes the matching holding link and rewrites its local summary. For an OWN link it clears `againstListingId` on bounded rival links that referred to that office, making those rivals unassigned across offices. It does not delete the shared listing, remove a public profile, revoke an external account or immediately erase all historical evidence.

## Profile Projection And Check Rules

`localSetup` resolves the group owner, reads limits and calls `localWatchList`; that planner selection uses GOOGLE offices and GOOGLE rivals within the resolved scope. `openOffice` chooses the requested office if found, otherwise the first available office. An arbitrary office ID does not make the query read another company's office.

`profileDetails` projects CLAIMED, CATEGORY, OTHER_CATEGORIES, DESCRIPTION, ADDRESS, WEBSITE, HOURS, BOOKING, SERVICES, PHOTOS and REPLIES. Claim/photos/review uncertainty can produce UNKNOWN. Address requires both address and phone; website compares normalized hosts; hours needs some non-null day; services needs a nonempty service list with at least one priced service. These are exact checklist heuristics, not comprehensive validation of public business correctness.

Category comparison uses the most common category among other businesses in the selected map boxes. Booking flags an absent link when comparable read profiles have one. Photos compare with the relevant rivals' available average. Replies uses `reviewsAnswered` against `reviewsHeld` with an eighty-percent threshold; it does not independently query every public review. The every-office projection supplies no people-also-look-at booking comparison, so its fix count need not exactly equal the individual view.

`businessProfile` also joins saved people-also-search-for entries, available shared listings, watched markers and profile topic counts. Topic star averages use retained review judgments. Map-box coverage counts positions one through three over selected checks. Thirty-day review growth needs both a latest weekly count and a baseline at least thirty days old; lack of a baseline returns null.

## Weekly History, Activity And Cleanup

`writeListingWeek` normalizes an observation to its Monday week, replaces that week's earlier values and packs the sorted history. It stores rating to tenths alongside review, photo and claim observations. It is a weekly observation series, not an append-only event record for every profile read.

`fileProfile` upserts a whole profile, writes its weekly values, derives changed-profile activity and calls `noteLocalChange`. `filePosts` adds retained post/offer/event lines. `fileQuestions` replaces the QUESTION kind with the newest observed question set, including answered dates. Replay behavior follows these identity and replacement rules rather than blindly appending every parser result.

`addListingActivity` deduplicates by kind, day and text, orders newest first and retains one hundred lines. Questions can be replaced as a kind. `rivalActivity` uses UK-day period bounds for headline figures but returns all held timeline lines. Its open-question count concerns retained unanswered own-office questions independently of the date interval. Weekly rating/photo changes supplement rival activity; these derived observations are not public actions performed by Hakken.

`keepRules.ts` declares linked holding records as RECORD, Find contexts and activity as latest/bounded data, and weekly history as retained history. `localSweep.ts` removes old map checks and listings unseen for ninety days unless linked by a company. Listing removal also concerns associated evidence; do not promise infinite history after the listing itself becomes eligible for cleanup. Unlinking and later expiry are different operations.

`siteLocalListings.test.ts` covers Local-off purchase refusal, equivalent Find reuse while scheduled runs are off, cross-company refusal and linked-profile/office-limit behavior. `localFiling.test.ts` and profile-related local tests provide further filing evidence. Test declarations were inspected, not run. No supplier call, credential value, external claim or live rename-cutover acceptance was verified. See [Collection Operations](./collection-operations.md) and the [user guide](../end-user/local-business-profiles.md) for the adjacent operational and customer contexts.
