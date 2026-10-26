---
product: Hakken
documentation_type: End-user guide
feature_area: page decisions and create candidates
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/page-decisions-and-create-candidates.md
last_reviewed: '2026-10-26T12:18:49+00:00'
reviewed_against: current implementation
status: Current
---
# Page Decisions And Create Candidates

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** page decisions and create candidates
> **Reviewed:** 26 October 2026, 12:18:49 GMT (Europe/London)
> **Source path:** `docs/end-user/page-decisions-and-create-candidates.md` · **Status:** Current

The Page plan screen includes a website-wide set of suggested page decisions alongside its focused priority plan. It helps a company review which known pages might need improvement, merging, a redirect, removal or no immediate change, and which searches suggest a missing page. These are saved recommendations. Opening a row or downloading the list does not alter a public website.

Open Insights and choose Page plan at `/app/insights/page-plan`. Select the intended owned website. The wider decision tables are separate from the older thirty-page priority list, even though both appear on the same screen. Their evidence, bounds and saved timestamps can differ.

## Scope And Company Access

The decision report reads the active company's owned website holdings. Without a website selection it prefers an owned site already holding decisions, then an eligible first site. It does not combine every company website into one page catalogue.

A known public hostname or another company's page path does not grant access to private recommendations. The tenant read checks the selected holding. A tracked competitor can contribute retained comparison evidence to an owned site's analysis but does not become a place to run your own whole-site page plan independently.

The page-decision build starts from Hakken's known holding-page list. It is not a new crawl of every currently reachable URL. A public page missing from that list is outside this calculation until another workflow discovers and records it. Conversely, an old URL can remain evidence worth investigating after its public behavior changes.

## Check When It Was Calculated

The screen reads a latest saved decision set with a calculation timestamp. It does not recalculate the whole site on opening, change the website's classifications or ask suppliers for new results. The general Insights period menu is not an input that rewrites these saved decisions for every selected month.

The build combines retained landing-page and page-view evidence, Search Console pages, incoming-link examples, the newest crawl, existing page priorities, competing-page recommendations and conversion reviews. These sources do not necessarily share one observation date.

A recommendation should therefore be reviewed against the actual current page before implementation. If a recently fixed page is still marked broken, check the saved crawl and calculation dates before assuming the fix failed or requesting another change.

## Understand The Five Decisions

Improve means the retained evidence or another specialist workflow suggests work on the page. Reasons can include an existing page-plan priority, competing intent, duplicate or thin content, non-indexability, orphaning or a conversion review. It does not necessarily mean rewrite all its words.

Merge means the competing-page evidence recommends consolidating into an indicated owner. Redirect means a page should preserve useful linking or navigation context while moving to an appropriate destination, sometimes without a chosen destination yet. Remove means the rules or a specialist propose taking a page out. None is executed through this read-only table.

Keep means no higher-priority applicable rule selected another action, or a supported specialist decision retained the page. It is not a guarantee the page has no technical, legal, content or commercial issue. A quiet page can still be needed for visitors, compliance or navigation.

The distinction between advice and execution is especially important for Merge, Redirect and Remove. Verify the intended destination, inbound links, user need, page purpose and normal implementation approval before any actual website change. An empty destination field is not permission to redirect arbitrarily.

## Rule Order Matters

Broken status or recognized broken-page flags are considered first. A broken page with observed external or internal linking can receive Redirect; without that evidence it can receive Remove. This branch comes before the later unused-page protections, so the report must not be described as universally protecting every important page from a removal recommendation.

A competing-page merge comes next, then applicable priority-plan actions and competing differentiation/linking advice. Pages with no retained views, visits, impressions or clicks can be considered unused, but only when view evidence is available and other conditions apply. Missing whole-site view data is not automatically measured zero usage for that rule.

The unused-page rule protects home/list pages and configured needed types such as service, company, legal and product. Those protections are scoped to that rule, not proof every earlier rule or external business situation is safe. Current classification is therefore part of the evidence to inspect.

Later rules consider duplicates, thin pages with observed activity, non-indexable pages with activity, orphan pages and conversion-review recommendations. The first applicable rule supplies the initial decision, so a page meeting several conditions does not display every possible issue as separate primary actions.

## Read The Supporting Figures

Annual landing-page visits and enquiries come from the retained whole-month history, while page views use a separate saved annual page slot. A page can be read after another landing page without being a landing page itself. This is why the unused-page rule needs view evidence rather than assuming no landing visits means nobody sees it.

Google impressions/clicks use the retained last-quarter page evidence. Linking domains come from a compact held backlink list, excluding lost examples. That is a bounded source, not proof of every backlink on the internet. Missing linking-list evidence remains different from a verified complete absence of links.

Crawl flags and status come from the newest saved technical audit. A crawl can be incomplete, and the decision set inherits that limitation. Read [Technical Site Audit](./technical-site-audit.md) before treating missing flags as a full technical pass.

Enquiries still mean the configured analytics conversion mapping, not automatically paid customers or revenue. A recommended merge or removal cannot establish what commercial effect a public change would have, even when a source figure is present.

## Specialist Decisions And Attribution

The rule can hand up to forty prioritized non-Keep pages to the Page decisions specialist, excluding pages already covered by competing-page advice or a carried specialist decision. The model does not necessarily review every page in the displayed set.

Valid specialist answers need an offered page, a recognized decision and a reason. Merge/redirect suggestions need a known different target unless preserving an existing untargeted decision. Removal is constrained by stored external links and protected page types in that specialist check. These are software guardrails, not a complete check of current public website needs.

A prior specialist call can carry forward when the relevant rule signature remains unchanged. That signature concerns categorical evidence, so numerical traffic changes do not always require new prose. Check the decision week and attribution rather than assuming every row was newly judged by a model.

Failed or refused specialist answers leave the rule available. A fallback recommendation can still appear without a model-written explanation. The report identifies who decided; it does not record that your business approved or implemented the recommendation.

## Pages To Create

The create-candidate table combines supported content-gap searches and selected buyer questions. Content-gap candidates need at least two ranking rivals and a known monthly search volume of at least fifty. Close variants can be grouped so repeated word forms do not automatically become separate page briefs.

Buyer-question candidates come from the saved question panel when they were built from a search and the owned website does not currently rank for that search in its retained keyword copy. A question candidate need not meet the same rival-count threshold as a gap candidate. Read its source label before comparing candidates.

The table retains up to twenty candidates ordered by known volume and supporting rival evidence. It proposes searches to address, not finished page text, a publishing schedule or approval to create every possible page. Verify existing content and intended buyer need before commissioning another URL.

A missing candidate can reflect incomplete keyword copies, missing question-panel evidence or the cap. Its absence does not prove every buyer need is covered. A candidate's presence likewise does not prove the business offers the service implied by an ambiguous query.

## Bounds, Downloads And Follow-Up

The build paginates through known pages but retains only the first two thousand ordered decisions in the normal saving path. Its overall page count can be larger than the detailed rows returned. Do not present a chart over retained decisions as a complete exact classification of every public page without that context.

Filters and local list downloads narrow the supplied saved rows. They do not expand the retained decision bound or fetch missing crawl/history facts. Separate downloads for page decisions and proposed creates are snapshots of those tables, not deployable redirect rules or CMS import instructions.

The current set replaces the prior saved decision parts. It is not a complete version archive of every earlier recommendation. A row or reason changing can reflect refreshed inputs or attribution rather than completion of a public change.

For a practical review, confirm the site and calculation date, inspect important destructive recommendations individually, establish the current page purpose and agree any actual implementation separately. See [Insights Strategy And Planning](./insights-strategy-and-planning.md), [Competing Pages And Search Ownership](./competing-pages-and-search-ownership.md), [Page Reviews, Funnel And Experiments](./page-reviews-and-experiments.md) and the [developer guide](../developer/page-decisions-and-create-candidates.md).
