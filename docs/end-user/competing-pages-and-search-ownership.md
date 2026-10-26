---
product: Hakken
documentation_type: End-user guide
feature_area: competing pages and search ownership
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/competing-pages-and-search-ownership.md
last_reviewed: '2026-10-26T12:16:11+00:00'
reviewed_against: current implementation
status: Current
---
# Competing Pages And Search Ownership

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** competing pages and search ownership
> **Reviewed:** 26 October 2026, 12:16:11 GMT (Europe/London)
> **Source path:** `docs/end-user/competing-pages-and-search-ownership.md` · **Status:** Current

Insights Keyword cannibalisation helps a company inspect groups of its own pages that appear for overlapping Google searches. It proposes which page should own each search and whether other pages should remain distinct, link to an owner or be considered for merging. The report is an evidence-backed recommendation workflow. It does not merge pages, install redirects, edit canonicals or remove content from a public website.

Open Insights and choose Keyword cannibalisation at `/app/insights/cannibalisation`. Open a group at `/cannibalisation/group` to inspect its pages, searches, suggested owners and available finding. Select the intended owned website explicitly when the company has several. The active company's holding controls access to saved groups.

## Understand What The Group Represents

The analysis starts from retained Search Console query/page observations over the saved last-quarter window. It excludes home-page and known brand-search combinations from this grouping. A group is not every page sharing a word in its title and not a complete crawl of the website's content.

For a search to count as split, at least two pages each need a meaningful share of its held impressions: the implemented threshold is ten percent. Page pairs need at least three shared splitting searches to form a connection. The connected groups are then bounded and filtered before becoming report rows.

A retained group needs at least five split searches and two hundred fifty impressions in its grouped evidence. The normal calculation keeps at most twenty groups, each bounded around six pages and two hundred search examples. The saved reader can hold up to forty groups, so these are different calculation and reading ceilings.

Absence from the report does not prove a page has no overlap, no canonical problem or no indexing issue. It can be outside the retained sample or below the thresholds. Conversely, overlap does not by itself prove commercial harm; several useful pages can legitimately appear for related searches.

## Check The Saved Dates And Sources

Each group carries the analysis week and covered from/to dates. The report reads those saved groups, not a new live Search Console response. The section's general period menu does not transform this saved group into a freshly recalculated month or quarter.

Page traffic and enquiry context comes from available retained whole-month analytics. It can use the latest twelve whole months and a recent-three-month comparison where the corresponding earlier-year months are held. Source windows differ from the query/page overlap window, and the page's full-site impressions can differ from impressions only inside this group.

Available search volume and difficulty can come from stored shared evidence. Saving new groups can queue missing volume and selected difficulty work through the collection system, but opening the report does not make those requests. Unknown values can therefore become known only after later collection and analysis.

Local code and saved results are not proof every external source is connected or that a specific production run completed. Check source readiness and the saved week before interpreting an old group against a recent public website change.

## Read The Owner Recommendation

Each search has a suggested owner among the pages actually observed for it. The fallback rule considers question versus buying intent, page type, named place and office context, relevant path words, observed clicks/impressions and available Google enquiry evidence. It does not simply give every high-volume search to the page with the most traffic.

A question-style search can favor an informational page, while a buying-style search can favor a page that sells. A location-specific search can favor an appropriate place page; a search without a named place can favor a broader page. These are word and classification heuristics, not proof of Google's intended landing page or a human's actual purchasing intent.

A configured decision model can choose among offered observed pages when its decision is acting. Otherwise the rule remains available. Uncertain or unavailable model answers do not authorize an arbitrary new destination outside the observed candidate set.

The group itself is organized around the page owning the most relevant retained demand, with impression, ownership and enquiry tie-breaks. That organizing owner does not mean every other page must disappear. Multiple pages can own distinct searches within one group.

## Keep, Link, Merge Or Differentiate

A page owning searches of its own is kept for those searches. An informational page without its own ownership can be kept with a suggested link to a selling owner. These recommendations preserve different reader needs rather than treating every overlap as duplicate content.

For a page owning none, the rule compares its group impressions with all available page impressions. When at least a third of its impressions concern the relevant group, it can recommend merging into an owner with a redirect. Otherwise it can recommend making the page clearly different. These thresholds describe the implementation, not an instruction to change a public site without review.

A page bringing enquiries can still receive a merge recommendation. The rule assumes a carefully implemented redirect can carry useful work onward; it does not verify that your actual CMS, URL mapping or conversion path will do so. Verify those facts before any real change.

The specialist can provide a reason or an allowed alternative, but cannot make a page that owns searches a merge target for removal merely by returning an unconstrained response. The report distinguishes rule and specialist attribution. It is still advice, rather than proof that a specialist or business owner executed it.

## Estimated Gains And Confidence

Potential extra clicks use available monthly search volume and the website's retained click-rate curve, or an impression-based fallback. The calculation estimates a move toward a top-three rate and floors negative projected gains at zero. Close variants can be counted once to reduce duplicated demand.

Estimated enquiries apply an owner's own annual rate when it has at least one hundred visits, otherwise the held website rate where available. Unknown volume, click-rate or conversion evidence can leave estimates missing. These are modelled opportunities, not guaranteed recovered leads, financial revenue or a measured causal cost of the overlap.

The Likely label requires at least twenty split searches and one thousand grouped impressions in the rule's evidence. Smaller qualifying groups can remain Rough. These labels are implementation thresholds, not statistical confidence intervals or proof that merging will improve rankings.

Group totals and retained search examples need not have identical scopes after bounds are applied. Do not reverse-engineer a universal business loss from a few visible examples. Inspect the source window and uncertainty with the recommendation.

## Specialist Review And Reuse

The weekly analysis can ask the Keyword cannibalisation specialist to review a group. It can retain a decision from an earlier week when the relevant group signature is unchanged. The visible decision week can therefore be older than the saved group week without implying the screen failed to refresh.

The search-owner decision path has bounded work and limited continuation rounds. The group specialist also has a time budget and can retry a failed answer once when time remains, except for a spend-limit refusal. Unreached or invalid work can retain the fallback rule rather than appearing as an invented model decision.

Written headline/story content is checked against the group's own fact references before display. A rule summary can appear where specialist wording is absent or rejected. Even accepted fact-grounded prose is an interpretation, not an independent proof of commercial cause.

## Open A Group And Follow The Evidence

The group detail can show page clicks and impressions, search gains, page decisions and search owners, with filters, heading ordering and local downloads. Its key is tied to the organizing owner page, so a different owner in a later calculation can change which detail key is current.

A linked finding can provide a recommended action and check date when the group produced a published finding. Not every saved group has one. The analysis selects only a limited set of sufficiently supported groups for proposed findings, and those still follow the normal editorial path.

Use the group detail to verify that the pages truly serve the same intent, whether a place page represents a real service area and whether an informational page deserves to remain separate. Check the current public pages and inbound links before agreeing any merge or redirect. The report does not save a CMS change or validate its deployment for you.

## Retention, Access And Adjacent Decisions

Groups are a latest-analysis set. Saving replaces the prior bounded group records rather than preserving a full group-by-week archive. Search-owner picks also retain latest per-holding/search evidence. An older group link can become unavailable after a normal recalculation; do not delete documentation or declare a capability deprecated for that reason.

The report's company-wide fallback prefers an owned website already holding groups, then an eligible first owned site. Selecting another permitted site changes the evidence scope, not the private company boundary. Another company's group identifier or shared host does not grant access to its saved recommendations.

Whole-site Page plan decisions use additional crawl, content-gap and specialist evidence beyond this overlap analysis. This guide covers the group/search-ownership workflow; the documentation inventory separately tracks the broader keep/improve/redirect/remove/create system. Neither workflow executes destructive website changes merely by displaying a label.

For a practical review, establish the site and dates, inspect the largest relevant groups, confirm page intent and source uncertainty and agree any actual public change separately. See [Insights Strategy And Planning](./insights-strategy-and-planning.md), [Insights Findings](./insights-findings.md), [Search Console](./search-console.md) and the [developer guide](../developer/competing-pages-and-search-ownership.md). These records do not establish live deployment or complete Hakken product acceptance.
