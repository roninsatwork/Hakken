---
product: Hakken
documentation_type: End-user guide
feature_area: local business profiles and listings
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/local-business-profiles.md
last_reviewed: '2026-10-26T11:30:14+00:00'
reviewed_against: current implementation
status: Current
---
# Local Business Profiles And Listings

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** local business profiles and listings
> **Reviewed:** 26 October 2026, 11:30:14 GMT (Europe/London)
> **Source path:** `docs/end-user/local-business-profiles.md` · **Status:** Current

Hakken's Local area brings together saved business listings, office comparisons and observed profile activity. It helps a company see which public profiles represent its offices, which nearby businesses it watches and what the stored evidence suggests checking. The feature reads public listing evidence through the collection system. It does not connect you as an authenticated owner of Google Business Profile or edit a listing on Google, Trustpilot or Tripadvisor.

Start from an owned website in Visibility and open Local. Business profile is the office-level view; Every office compares locations; Your listings manages the company's links to public listings; Rival activity shows retained observations. Maps and local market reports use the same office setup but have their own evidence and comparison rules.

## Set Up Your Listings

Your listings at `/app/sites/[siteId]/local/listings` separates your own profiles from watched rivals and provides a business search. Choose Google, Trustpilot or Tripadvisor, then enter the business name and town as accurately as possible. The search accepts between two and one hundred twenty characters after spaces are normalized. A vague name can return a similarly named business in a different place, so inspect the source, address and website before linking anything.

Find is a real collection request, rather than a search of Hakken's existing table alone. Local must be enabled for the active company before it can buy that search. A company collection schedule being off does not disable an explicit Find: the two controls serve different purposes. Repeating the same search within its reuse period can share an existing purchase rather than creating another equivalent request.

The screen can show a search waiting for results, failed, completed with matches or completed without matches. An empty supplier answer can be a legitimate result. It does not prove that the business does not exist on the public service, especially if its name or town was ambiguous. Keep the selected source in mind when interpreting a result.

Choose This is us for a profile belonging to your business, or Watch as a rival for another business you want to compare. These actions link a public record to this website's company holding. They do not claim ownership on the external service, transfer a listing between companies or change the public business identity.

## Offices, Rivals And Limits

Google profiles marked as your own become offices for the Local comparisons. Your own Trustpilot and Tripadvisor pages also remain linked for relevant reputation workflows, but they are not Google map offices. A business can have records on several sources, so the rival list may group multiple linked source records by website while still retaining their separate identities.

Office and rival limits come from the website's resolved Limits settings. Hakken refuses a Google-office link above its office limit and a rival link above the applicable rivals-per-office limit. These are configuration limits, not a fixed number this guide can promise for every company. Linking the same record again updates its role rather than intentionally duplicating the link.

A newly linked rival is associated with the nearest Google office when coordinates are available. Where coordinates cannot establish that distance, the first suitable office is the fallback. A rival without a particular office association is considered against every office. Check the displayed association before treating its comparisons as a precise local-market definition.

Unlink removes the company's connection to that record for this website. It does not delete the shared public listing or erase it from the supplier. Removing an office clears its rivals' specific office association; those rivals then apply across the remaining offices. This can change later comparisons without deleting the rival links themselves.

## Who Can Change The Setup

Listing changes are available to members of the company except the oversight roles, and only on the company's own website. Oversight access can read the setup but is refused by the write handlers. Tracked competitor holdings do not provide a separate place to link offices. Verify the active company and owned website if an action is refused.

These checks protect company setup; they do not prove a person controls a public profile. Marking a record This is us is a local declaration. Use the external service's own claim and verification process if you need to manage its public content or ownership. Do not interpret a successful Hakken link as that service's ownership approval.

Linking a Google profile can also queue its full profile reading when Local is on and the stored reading predates the current refresh period. This is a collection side effect of linking, not merely a display preference. When Local is off, linking an already held record can still update setup, but it does not use that path to buy a fresh profile reading.

## Read The Business Profile

Business profile opens at `/app/sites/[siteId]/local`, with an office selector when more than one Google office is available. It shows the saved listing identity and profile-reading time alongside figures such as review growth, map-box appearances and comparison ratings or photos. Missing evidence is shown as unknown rather than an automatic measured zero.

The profile checklist considers claim status, primary and additional categories, description, address and phone, website, hours, booking link, services, photos and replies. These are implementation rules that identify potential work. They are not proof that every flagged difference is commercially harmful or that matching a rival's category would be correct for your business.

Some rules are deliberately simple. Hours are considered present when at least one day is known. Services need at least one service and one recorded price for the favorable verdict. A booking link can be flagged when comparable profiles have one; an absent link is not automatically a failure when that comparison supplies no example. The website check compares normalized saved hosts.

Photos are compared with the available rivals' average when known. Replies compare answered reviews with the reviews Hakken holds, using an eighty-percent threshold. The denominator is the retained review set, not necessarily every review on the public platform. Unknown claim status, photos or review evidence can remain unknown instead of being diagnosed as an actual business failure.

## Understand The Comparisons

The map-box figure counts selected checks where the office appeared in the first three saved results, out of the checks available for that office. It is not a universal percentage of all Google users, all towns or all searches. Search selection comes from the company's private active tracking list and office assignment rules.

The thirty-day review-growth figure compares the newest weekly reading with a reading at least thirty days old. It is unknown if that older baseline is missing. Weekly observations replace earlier observations in the same week, so the difference is an observation-based comparison rather than a transaction log of individual reviews arriving or disappearing.

People-also-look-at information comes from the saved profile and any corresponding records Hakken holds. Some businesses can have a name and rating but lack a fully read profile. A watched marker means your company watches that record; appearing beside your profile is not itself proof that you selected it as a rival.

Review topics on the profile combine supplier topic counts with averages from reviews Hakken has read and assessed. Different review coverage can produce different counts or missing topic stars. Treat those figures as evidence from their respective retained sources, rather than forcing them to equal the public headline review count.

## Every Office And Rival Activity

Every office at `/local/offices` places your Google offices side by side, including profile checks, answered-review share, review growth and map-search positions. A zero map position means the office was not among the observed results; a missing position means no corresponding check was available. The distinction matters when deciding whether to improve a profile or first obtain suitable evidence.

The summary's checks are not identical in every respect to the individual profile view. For example, the all-office checklist does not supply the same people-also-look-at booking comparison. A different fix count can therefore reflect comparison context, rather than a new public change between two clicks.

Rival activity at `/local/activity` combines posts, offers, events, questions and changes inferred from retained weekly readings. The selected date period applies to its headline activity figures, while the returned timeline includes held observations beyond that interval. Open questions count retained unanswered questions on your own offices, rather than only new questions inside the selected period.

Activity is a bounded feed, retaining the newest one hundred lines per listing. It is not an exhaustive archive of everything a business ever published. Public questions are replaced by later observed question sets, and a later reading can show an answer without Hakken having posted it. The report offers observation and follow-up context, not a public posting or answering action.

## Retention And Next Steps

Linked listings are protected from the normal cleanup for listings unseen for ninety days. Unlinking does not itself immediately erase the public record; an unlinked and sufficiently old unseen record can later qualify for cleanup. Weekly histories are retained with their listing lifecycle, while activity stays bounded and the newest search context replaces earlier searches for that source.

For a useful housekeeping session, first verify the correct office identities, then compare the saved reading dates and choose a small set of concrete issues to investigate on the external service. Confirm any public changes there through its normal authorized process. A later Hakken observation can show the resulting saved evidence; a local link or checklist verdict cannot prove a live integration is accepted or a customer outcome improved.

See [Websites And Visibility](./websites-and-visibility.md) for company holdings and [Google Search Tracking](./google-search-tracking.md) for the private search list. The [developer guide](../developer/local-business-profiles.md) records the filing and permission boundaries. Local market, Maps and review workflows remain separate coverage areas in the documentation inventory.
