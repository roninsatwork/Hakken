---
product: Hakken
documentation_type: End-user guide
feature_area: web mention monitoring and listing opportunities
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/web-mention-monitoring.md
last_reviewed: '2026-10-26T11:45:32+00:00'
reviewed_against: current implementation
status: Current
---
# Web Mention Monitoring

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** web mention monitoring and listing opportunities
> **Reviewed:** 26 October 2026, 11:45:32 GMT (Europe/London)
> **Source path:** `docs/end-user/web-mention-monitoring.md` · **Status:** Current

Web mentions helps a company inspect saved pages naming its business, compare that evidence with watched rival websites and find possible places to investigate for a listing or link. It combines third-party content observations, stored backlink evidence and selected Brand Radar sources. It does not monitor the entire internet in real time, contact publishers or automatically obtain a listing.

Open a website in Visibility and choose Web mentions at `/app/sites/[siteId]/mentions`. Against rivals is at `/mentions/rivals`; Where to get listed is at `/mentions/listed`. These pages use the company's owned website and the rival group associated with it. A tracked-site navigation context does not create an independent monitoring setup detached from that group.

## Names, Coverage And Collection

Collection searches by the website address and, when useful, the primary configured brand name. The name search is quoted and is omitted when it duplicates the address or is too short. Check your business profile and primary name before interpreting an ambiguous result; businesses in different industries can share the same name.

The Web mentions collection part must be enabled for new scheduled work. Mention requests use seven-day reuse periods, while backlink gaps between pairs of rivals use thirty-day periods. These are planning intervals, not a guarantee that new evidence arrives every week or that an enabled integration is currently healthy.

The parser accepts pages explicitly identified as English and with country GB, worldwide or no stated country. It excludes pages with other stated countries and pages with no recognized English language. This scope is deliberately limited. No result does not establish that nobody mentioned your business in another language, country or unindexed location.

Each request has a configured result limit. The retained website record holds at most the newest one thousand dated pages within a year when new pages are filed. A large publisher ecosystem or widely used business name can exceed that sample. The report is useful retained evidence, not an exhaustive media archive.

## Check What The Date Means

The stored day is taken from the supplied publication date when available, otherwise fetch time, with the current date used as a fallback when neither provides an accepted day. It is not uniformly the first day Hakken discovered the page. A newly found old article can therefore belong to an earlier interval rather than today's new-mention figure.

The date menu controls headline comparisons and chart buckets. The main list can still contain held pages outside that interval, because it is filtered by its own kind, tone, link and text controls rather than automatically reduced to the date-menu span. Check the row day before expecting it to contribute to the current headline.

A repeated URL is normally kept once. The filing path skips already-held URLs rather than continually refreshing their title, tone, relevance or link marker. A later public edit can consequently be absent from the saved row. For a current complaint or requested link, inspect the actual public page through your normal review workflow.

## Read All Mentions

Each row identifies a page and its host, with a saved title when supplied, day, content kind, tone, strength and link indicator. Text search matches available title and host. Kind filters distinguish the parser's broad categories such as news, blog, forum, shop, organization and other; they are source-derived classifications, not a manually curated publisher directory.

Tone is derived from the supplier's positive and negative connotation measures. It can be well, badly or neutral. Neutral also covers cases where the available scores do not cross the implemented thresholds. Treat the label as a triage clue rather than a reliable human judgment of a whole article or your customer's intent.

The separate relevance check asks whether the page concerns this business or another with the same name. It can use a configured AI decision and falls back to a title/snippet naming rule. A page marked as another business is hidden unless its host already has a saved backlink to the website. Uncertain relevance can remain visible.

These are different checks: a page can be relevant and negative, irrelevant by the name check but retained because of a linking host, or relevant with neutral tone. Do not interpret the tone label as proof that the identity check succeeded through an AI model.

## Understand The Link Indicator

The link flag comes from stored backlinks for the page's host. It is not a live inspection proving that this exact mentioned page contains a link. Another page on the same host can be the backlink evidence used by the check. Conversely, no held backlink does not prove that no link exists anywhere on the current public page.

The screen can suggest asking for a link when the stored host strength is at least one hundred, the row has no held-link marker and tone is not badly. That is a prioritization heuristic. It does not verify publisher willingness, offer pricing, business relevance or permission to send a message.

Opening a suggestion does not contact the site. Decide whether the page is appropriate, inspect the current content and follow your own outreach process. The documentation task and report do not authorize automated publisher messages or a purchase of a directory placement.

## Compare The Watched Group

Against rivals uses the owned website and a bounded group of watched rival websites. It counts retained shown pages inside the selected period, the previous comparison period, tone categories and missing-link flags. Its chart groups those observations into the selected date steps.

The group comes from configured tracking and limits. Its figures do not describe every competitor in the market. A changed rival group, different sample size or incomplete collection can change the comparison even when the underlying business did nothing differently.

Any share described by the report is a share of observed mention rows across that group. The same publisher or page can appear in more than one business's evidence. It is not unique audience reach, market share, traffic or revenue, and a higher count does not establish that the mentions were favorable.

Compare like periods and read negative-tone counts alongside volume. An absent or empty stored result can project as zero through some comparison fields, so verify that suitable evidence has actually been collected before presenting a zero as measured silence.

## Where To Get Listed

Where to get listed joins two evidence types. Brand Radar contributes external source pages quoted alongside the owned site or watched rivals. Stored backlink-gap results contribute domains linking to at least two applicable rivals while excluding the owned website in the original request.

The page groups those sources by host, classifies broad host type and shows how often the retained Radar evidence quoted it, which rivals it links to and which rivals contributed to the observation. A quoted count is not a count of unique publishers or all AI answers on the internet; multiple retained source URLs or business readings can contribute.

Already there means the host was quoted beside your own site or a retained shown mention of your business was found on that host. It does not prove an up-to-date directory account, correct contact details, an active commercial listing or a link on the exact page you plan to approach.

Not every quoted host is displayed. The combined list favors qualifying rival-link gaps, directory/review/news classifications and places already associated with your site. A missing forum or video host does not prove Radar never encountered it. Read the report as a selected opportunity list with explicit source evidence.

The headline opportunity counts describe missing placements, quoted missing places, multi-rival link gaps and already-there hosts. Kind, status and text filters narrow the table separately. Filtering a table does not change the private rival group or purchase another source check.

## Retention And Exports

Mention retention is applied when fresh URLs are filed. If no new URL arrives, the writer can return before trimming old entries. The nominal one-year window is therefore not a guarantee that every row disappears exactly on its birthday without later filing. Saved mention rows also do not preserve the full article or the snippet used for the relevance decision.

Link-gap pairs store the current observation for the website and ordered rival pair. Queries ignore pairs whose rivals are no longer applicable. A historic pair can remain in shared storage without appearing in the current company's opportunities. This is different from claiming that removing a rival deleted all its prior evidence.

Chart CSV downloads contain the saved aggregate series being displayed, with date steps and relevant tone or business counts. They are not a complete article archive or a declaration that each source page is currently reachable. Keep source, period and sampling context when sharing the file.

## Practical Follow-Up

Start by verifying the business name and monitored group, then inspect important negative pages and plausible missing-listing opportunities. Record the actual URL, saved day and reason for concern. Verify the present page before acting on an old tone or link flag, and route any website repair or outreach through its separately authorized process.

Web mentions is distinct from [Backlink Reports](./backlink-reports.md), which stores linking evidence, and [AI Visibility Reports](./ai-visibility-reports.md), which describes saved answer observations. The [developer guide](../developer/web-mention-monitoring.md) records the parsing and filing rules. These implemented reports do not establish live external rename-cutover acceptance or prove that mention changes improved leads or sales.
