---
product: Hakken
documentation_type: End-user guide
feature_area: Insights strategy and planning
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/insights-strategy-and-planning.md
last_reviewed: '2026-10-26T12:05:32+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Strategy And Planning

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Insights strategy and planning
> **Reviewed:** 26 October 2026, 12:05:32 GMT (Europe/London)
> **Source path:** `docs/end-user/insights-strategy-and-planning.md` · **Status:** Current

Insights Strategy, Opportunities and Page plan help a company decide which services and pages deserve investigation. They combine retained analytics, Search Console, search-rank and change evidence into service calls and suggested priorities. They do not rewrite pages, publish new content, create redirects or change the business's actual product roadmap when you open a report.

Open Insights and choose Strategy at `/app/insights/strategy`, Opportunities at `/app/insights/opportunities` or Page plan at `/app/insights/page-plan`. These views concern owned websites in the active company. Use the website selector deliberately: without a selection, these particular queries use the first eligible owned site, rather than combining every site or finding the globally newest strategy.

## Start With The Saved Week

Strategy reads the selected site's latest saved analysis week. Opportunities and the rule-based page plan read a latest saved plan record. The page does not regenerate that evidence when opened. Check the host and saved week before comparing a recommendation with a recent public website change.

A site with no suitable saved week or plan can show missing or empty content. This does not prove it has no services or no opportunities. Sources may be unconnected, retained data may be insufficient or the analysis has not saved the relevant result. The core [Insights Findings](./insights-findings.md) guide explains the analysis and evidence workflow.

The period selector elsewhere in Insights does not mean every strategy field is recalculated for that period. Service enquiry evidence uses retained twelve-month analytics comparisons, while Google click/impression evidence uses retained ninety-day Search Console windows. Their time bases are deliberately different.

## Read The Service Table

Strategy shows services and the home page identified from the company's page classifications, plus an aggregate Guides row for classified articles. It can show enquiries, visits, people, Google clicks/impressions and the current strategic call. The list is capped at forty qualifying rows and emphasizes the services with more enquiries and clicks.

A missing service can reflect missing classification, no qualifying evidence or the retained list bound. It is not an instruction to remove that service from the business. The guide aggregation also means an article may contribute to Guides without receiving its own service row.

Enquiries are configured analytics conversions represented in retained landing-page data. They are not automatically signed customers, paid orders or confirmed revenue. People, visits and Google clicks have different definitions and source windows. Avoid dividing unrelated figures into a business conversion rate without checking their scopes.

The rule keeps rows with current enquiries, prior enquiries or current Google clicks. A comment suggesting any historic click is sufficient is broader than that implemented filter. A service active only in an older click window can therefore be missing from this particular strategy list.

## Interpret The Strategic Call

Calls can mean Grow, Keep steady, Use buyers' words, Your call or For readers. Guides receive For readers. For services with no prior enquiry baseline, five current enquiries meet the rule's Grow threshold. With a known zero baseline, three current enquiries are enough for Grow.

With a positive baseline, a fall of at least half leads to Use buyers' words when the earlier count was at least ten, otherwise Your call. Growth of at least twenty percent with at least three current enquiries leads to Grow. Other cases are Keep steady. These thresholds are triage rules, not a verified commercial forecast or proof of why demand changed.

The Head of Strategy can make a supported call and provide a reason for eligible services. The screen identifies whether the saved decision came from that specialist or the rule. A specialist's reason is an interpretation of supplied evidence, not proof an independent human approved a change.

An earlier specialist call can carry forward when its underlying rule classification is unchanged. Consequently its decision week can be older than the newest analysis week. Read the attribution and reason instead of assuming every displayed sentence was freshly generated on this page visit.

## Open One Service

Opening a service reaches `/app/insights/strategy/service` with its page path. The detail reads the service from the latest saved week and joins a bounded set of saved keyword ranks for that page. It shows up to fifteen high-volume search examples and the best retained watched-rival position for each.

The query initially reads up to three hundred page-rank candidates before choosing those examples. It does not fetch all supplier keywords or a new live search result. The Guides aggregate has no individual page-rank list through this path because it represents several articles rather than one landing page.

Its Google-click share divides the service's clicks by the sum of clicks across the saved service rows, including the Guides aggregate. That denominator is not guaranteed to be every click on the entire website. Missing page classifications and row limits can affect it. Visitors per enquiry uses people from the stored service evidence, with no ratio when the enquiry count is zero.

## Opportunities Within Reach

Opportunities looks for non-brand searches around positions four through thirty. It uses retained Visibility ranks and Search Console averages. When a matching non-brand Search Console query exists, its average position can replace the rank observation for this calculation. Those are related but different measures.

Search Console-only candidates need at least fifty impressions in the retained ninety-day window. They can appear without a known landing page, monthly volume or conversion rate. Such a row is a useful investigation lead, not a ready-to-publish content brief or a guaranteed quick win.

The planner estimates additional monthly enquiries from a fixed click-share curve, a top-three average, available monthly volume or a ninety-day-impression approximation, and the landing page's annual enquiry rate. A page needs at least thirty visits before its rate is used. Missing evidence leaves estimated worth unknown.

This estimate is not revenue and is not a promise that moving a result will produce that number of enquiries. Ranking, click behavior, demand and page conversion can all change. The curve is a local planning assumption, not a newly measured click-through rate for each business.

The list keeps up to one hundred opportunities, favoring estimated worth and then estimated reach. Text and service filters narrow those saved rows. Sorting and downloads operate on the supplied candidates; they do not expand the upstream data or buy another search check.

## The Rule-Based Page Plan

The saved page plan proposes one first action per candidate page, up to thirty pages. It prioritizes rebuilding service/home pages with a sufficiently large enquiry decline, restoring a successor page after a recorded losing merge/replacement, strengthening a few near-win pages, refreshing declining conversion, and investigating guides or successful retained changes.

A Rebuild recommendation requires a prior annual enquiry count of at least ten and a current count no greater than half. A Refresh recommendation for a service/home page requires substantial current visits and a rate decline. These are thresholds over held evidence, not proof that page wording alone caused the problem.

Strengthen is limited to three selected pages with a known suitable rate and at least fifty annual visits. A guide can receive Refresh or retire after a sufficiently large enquiry decline, or Keep and add a route when it attracts a meaningful share of visits but almost no enquiries. Retire is advice for review, not an automated delete instruction.

The first applicable rule wins for a page. The ordering means a page meeting several conditions receives one prioritized action, rather than every possible diagnosis. Estimated annual stake helps order actions within the relevant group; it should not be presented as guaranteed lost or recoverable revenue.

Each planned page can list up to two saved searches it should win, selected from a bounded page-rank read. These are relevant retained candidates, not a complete keyword strategy for that page. The plan advises what a page should do; it does not supply rewritten copy through this view.

## Wider Page Decisions On The Same Screen

Page plan also displays a separate set of current page decisions and proposed pages to create. Those come from the page-decision workflow, with its own rules, specialist evidence and competing-page context. The rule-based priority list does not prove those wider decisions were all re-reviewed in the same operation.

Merge, redirect, remove, improve and keep labels are recommendations. Reading, filtering or downloading them does not execute a redirect or deletion. Before changing a public website, verify the actual page, intended role, supporting evidence and separately authorized implementation plan.

The interface can show different decision attribution for a specialist, competing-page analysis or a fallback rule. Check that attribution rather than assuming every recommendation came from a model. Detailed competing-page and decision behavior remains a separate documentation inventory area.

## Exports, Retention And Follow-Up

These screens provide local list downloads for the rows supplied to their controls, including saved service calls, opportunities and page actions. They are planning snapshots rather than raw source exports. Preserve the host, saved week and source windows when moving them into a work list.

The strategy lives in saved weekly summaries, while opportunities and the rule-based page plan keep a latest plan per holding. A new plan can replace the prior one. The current screen is not a complete version history of every past recommendation, and a row disappearing does not itself prove the work was completed.

For a practical session, choose the intended owned website, inspect missing baselines, review the largest meaningful enquiry changes and validate candidate pages against their current content. Agree actual implementation separately. See [Insights Reports And Exports](./insights-reports-and-exports.md), [Organic Keywords And Pages](./organic-keywords-and-pages.md), [Google Analytics](./google-analytics.md) and the [developer guide](../developer/insights-strategy-and-planning.md). Local suggestions do not establish deployment acceptance or delivery of the full planned Hakken product surface.
