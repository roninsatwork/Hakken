---
product: Hakken
documentation_type: End-user guide
feature_area: review intelligence and reply drafts
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/review-intelligence.md
last_reviewed: '2026-10-26T11:39:07+00:00'
reviewed_against: current implementation
status: Current
---
# Review Intelligence

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** review intelligence and reply drafts
> **Reviewed:** 26 October 2026, 11:39:07 GMT (Europe/London)
> **Source path:** `docs/end-user/review-intelligence.md` · **Status:** Current

Hakken's Reviews area helps a company read the reputation evidence held for its own business listings and compare it with selected rivals. It brings together ratings, dated review observations, reply status, topic analysis and suggested replies. The reports use stored supplier observations and configured AI work. They do not continuously read every public review or post replies to external services.

Open a website in Visibility and choose Reviews. Your reviews is at `/app/sites/[siteId]/reviews`, Against rivals at `/reviews/rivals` and What customers say at `/reviews/say`. Establish your own Google, Trustpilot or Tripadvisor profiles in Your listings first. Selecting the correct public identities is essential: an excellent analysis of another business's similarly named profile is still the wrong evidence for your company.

## Choose The Scope

Your reviews can combine the company's linked own listings or focus on one Google office. Without a selected office, the report includes configured Google offices and linked own profiles on the other supported sources. Selecting an office narrows it to that Google profile. The active company holding controls access to the report and its setup.

The Reviews collection part must be enabled for scheduled review work. It is a separate control from Local's listing/profile collection. A page opening successfully does not establish that fresh Reviews collection is enabled or that a scheduled run completed. Existing stored observations can remain visible when buying new evidence is off.

Own and rival collection have different depths and frequency rules. Own listings are initially read up to the operation's limit; later runs request new reviews and a bounded recheck of recent unanswered ones. Rival review collection uses the configured recent-review depth and a thirty-day reuse period. A rival comparison therefore often has a smaller sample than your own-business report.

## Read Ratings And New Reviews

Your reviews shows the available headline ratings. Its combined Google rating weights each included office's stored rating by that profile's stored public review count. It is not a simple average of the offices, nor a fresh average of only the review rows in the visible table. Other-source ratings remain separately labeled.

The date menu controls new-review counts, their preceding comparison period and chart buckets. Review dates come from the saved supplier timestamps accepted by the parser. The chart can group counts and average stars over the selected step. The detailed returned review list contains held rows beyond the selected period, so inspect the table's own filters before assuming every visible row contributes to a headline figure.

Missing observations are not measured zero. A profile can have a public total larger than the number of individual reviews Hakken has retained, and supplier responses can omit text or a precise reply date. Differences between the profile total and the readable rows are not automatically a lost-data incident.

The initial Google collection has a maximum of 4,490 reviews. Shared storage readers also have a separate bound of twelve packed parts of one thousand reviews per listing. These limits describe different stages; neither promises an unlimited complete archive for every business or all time.

## Waiting For Replies

Waiting counts retained reviews without a saved reply date. The oldest-waiting figure describes the age of the oldest such held review. These waiting measures use the retained set rather than only reviews newly received in the selected date period. Changing the date menu can leave waiting unchanged for that reason.

Average days to reply uses reviews in scope with a sufficiently precise reply date. A reply known only approximately can count as answered but is excluded from the speed average. Missing speed is therefore different from a reply taking zero days or the business never answering anyone.

Reply evidence is learned through later collection. Posting a reply directly on the public service does not immediately update a previously stored Hakken record. Own-review rechecks reach the oldest still-unanswered review within the last ninety days, plus new-review allowance and a small margin. An old unanswered review beyond that recheck window is not guaranteed to have every later reply discovered immediately.

Use the external service to verify any urgent or disputed case. Hakken does not publish, delete or moderate a public review through these report pages. A waiting count is a follow-up aid, not permission to promise a customer something or disclose private account information in public.

## Compare Rivals Fairly

Against rivals selects an office and its applicable watched local rivals, alongside relevant linked records from other supported sources. The table separates source, stored rating and total reviews from statistics computed over held reviews in the selected period. Compare like sources and sample coverage before interpreting a ranking.

Answered share uses retained reviews inside the selected interval. Reply speed uses the subset with usable dates. A company with a tiny held sample can look much faster or slower than it would across its whole public history. The report does not statistically correct for all sampling differences or turn public review count into revenue.

The count chart reconstructs earlier totals by subtracting retained reviews dated after each endpoint from the current known total. When held reviews are incomplete, the series becomes unknown before the oldest retained review. It is a supported reconstruction from available observations, not a ledger proving every historic public count.

A rating, a new-review count, an answered fraction and a speed measure have different denominators. Do not add them together or describe all of them as customer satisfaction. Read the saved date, source and visible uncertainty alongside the number.

## What Customers Say

What customers say groups your retained review text into praise and complaints against topics from the listing's saved profile. It shows read and unread counts, topic counts and available star distributions. Review text is limited to the parser's retained excerpt, up to fifteen hundred characters including any combined title and body. The analysis does not have unlimited original text.

Topic analysis uses a separately configured Decision Maker rule, `discovery.review-topic`. It ships off and must be enabled through the appropriate administration workflow before it asks the model. Unread reviews can therefore be expected configuration behavior, not a broken screen. A failed model result can leave a review waiting for a later filing rather than marking it analyzed without evidence.

A review can mention several topics, so topic totals need not equal the number of reviews. A read review with no matching praise or complaint can contribute no topic mark. Complaints this year use the stored review day in the current calendar year, while other topic counts describe the held evidence without the main Reviews date-menu interval.

The rival-topic column uses topic counts saved on rival profiles. Its comparison is not a claim that Hakken retained and classified every rival's full review text with the same method. Read the label as comparative source evidence, and verify examples before making an operational decision from a broad topic count.

## Suggested Replies

The system can draft replies for held own-business reviews with text and no observed reply. It uses the company's configured chat model and written company instructions, rules and memories through the replier agent. The Reviews part and the replier's active setting affect eligibility. Drafting can incur recorded AI usage; merely opening the report is a read of available drafts.

The page displays up to twenty matching waiting-review drafts and offers Copy. Copy places the suggested words on the clipboard; it does not post them. Review the facts, tone and any promises before using the external service's own reply workflow. Avoid including private customer information, unsupported explanations or commitments the business cannot keep.

Drafts are capped at two thousand characters. Generation works in bounded turns and does not promise a draft for every waiting review immediately. An existing draft prevents that review being selected again through the normal draft lookup. A model failure leaves work for a later filing; it is not a customer-facing retry loop.

The displayed per-reply cost is an average from recent replier-agent transactions across companies. It is an indicative recent processing figure, not a fixed price, your own company's total spend or a guarantee of the next call's cost. Review actual usage and configured billing separately when making a spending decision.

## Retention And Practical Follow-Up

Shared review rows keep text and reviewer names when at least one company links that public listing as its own. A later filing can remove those fields and topic marks when nobody calls it their own, while retaining review figures. Unlinking alone does not promise immediate erasure of all shared words. Private reply drafts are scoped to the company holding.

When later filing observes a reply, bounded cleanup removes corresponding drafts. Draft disappearance is therefore consistent with observed answering, but it is not proof Hakken posted anything. Listing expiry can also remove associated evidence; review retention is tied to that listing lifecycle rather than an unconditional external archive.

For a useful review session, verify listing identity and observation scope, inspect important unanswered reviews, compare only suitable rival samples and read suggested replies before copying them. Follow up on repeated service complaints in the business's normal workflow. Use [Local Business Profiles And Listings](./local-business-profiles.md), [Local Maps And Market](./local-maps-and-market.md) and the [developer guide](../developer/review-intelligence.md) for the adjoining setup and evidence boundaries.
