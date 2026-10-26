---
product: Hakken
documentation_type: End-user guide
feature_area: page reviews, funnel and experiments
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/page-reviews-and-experiments.md
last_reviewed: '2026-10-26T12:12:21+00:00'
reviewed_against: current implementation
status: Current
---
# Page Reviews, Funnel And Experiments

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** page reviews, funnel and experiments
> **Reviewed:** 26 October 2026, 12:12:21 GMT (Europe/London)
> **Source path:** `docs/end-user/page-reviews-and-experiments.md` · **Status:** Current

Insights Page reviews and Experiments help a company inspect suggested conversion improvements and compare retained page figures after a person says a change went live. The Funnel page places Google visibility, clicks, visits and enquiries beside one another. These are reporting and follow-up tools; they do not edit public pages, deploy a variant or run a randomized A/B test.

Open an owned website in Insights and choose Funnel at `/app/insights/funnel`, Page reviews at `/app/insights/page-reviews` or Experiments at `/app/insights/experiments`. A page review opens below `/page-reviews/page` with a page path. Select the intended website explicitly when the company has more than one.

## Scope And Evidence Dates

The conversion views use the selected owned site, or the first owned site found in a bounded company-holding read. They read the latest saved conversion summary, page reviews and experiment records. Opening a report does not rerun the specialist, fetch the website or make a Google request.

The saved week identifies the review calculation. Its supporting page facts, annual analytics, recent analytics and behavior evidence can have different ages. A recent deployment on your website is not automatically reflected until suitable collection and analysis update the stored records.

The section's general period selector does not rewrite these saved conversion views to every chosen month or quarter. Annual page comparisons, the ninety-day funnel and last-month experiment measurements have their own contracts. Check the individual dates and source labels before comparing numbers across panels.

## Read The Funnel

The four steps are Shown, Clicked, Visited and Enquired. Shown and Clicked use retained Search Console facts. Visited and Enquired use retained Analytics Organic Search facts. The comparison uses ninety-day evidence against the corresponding earlier-year facts available to that analysis.

These are related aggregate measurements, not linked records of the same identified people progressing through every step. Search Console impressions, clicks and Analytics visits use different definitions and collection limits. A difference between them does not uniquely diagnose a broken stage.

Missing required facts stay unavailable in the funnel rather than being turned into a complete measured journey. A chart that resembles a funnel is not proof of full impression-to-sale tracking, and Enquired is the configured analytics conversion definition rather than automatically a won customer or paid order.

The adjoining source table describes retained channel visits and enquiries over twelve months with earlier comparison values when available. This is a different window from the ninety-day Google funnel. Use it to investigate where evidence changed, preserving that distinction in exported notes.

## Which Pages Receive Reviews

Page-review inputs come from a bounded set of saved money-page checks, not every URL on the website. The check-target selector considers up to four hundred known holding pages and picks up to twelve eligible home or money-type pages. It uses saved classification and clicks to choose candidates.

The underlying checking workflow can fetch page content and, when configured, ask Search Console URL Inspection and PageSpeed for evidence. It has a roughly weekly reuse interval. Those collection operations happen separately from opening this read-only page; this documentation review did not run them.

The Conversion specialist receives up to eight leading eligible page inputs after available annual page evidence is joined. A page with no recorded current visitors can be excluded. Absence from Page reviews does not establish that a page is unimportant, technically healthy or already optimized.

## Page Facts And Suggested Verdicts

A review can include title, kind, visitor/enquiry figures, earlier baselines, recent evidence, detected page facts and a suggested change. It can use available behavior evidence such as scroll depth, dead/rage clicks or quick returns. These are retained observations rather than a live replay of a customer's current session.

Detected price, proof, form and first-ask position are heuristics over saved content. A price detector can find a currency string without understanding whether that price is appropriate. A proof detector can miss a valid trust signal. Inspect the actual page before making a business decision from a boolean flag.

Verdicts include Rewrite the top, Add proof, Move the button, Add a price, Add company facts and Keep. A configured specialist can return a valid reason and steps; when it cannot, a fixed fallback rule selects the first applicable condition. A fallback can have little or no explanatory prose.

The rules consider a large worsening in visitors-per-enquiry, missing organization structured data, a first ask below the first thirty percent of content, absent service pricing and absent proof, in that order. Keep means no earlier condition selected a different action. It does not certify a perfect page or prove it produced profitable customers.

## Open A Page Review

The page detail shows the saved recommendation, comparison figures and available supporting panels. Visitors per enquiry is rounded and unavailable when the enquiry count is zero. Annual and ninety-day page fields use people in this review calculation, while experiment last-month baselines use visits. Those labels should not be casually interchanged.

Came-from evidence describes retained aggregate journeys before that page, where available. Rival cited-page examples use the company's private question context and are bounded. Neither panel proves that copying a rival's page or rearranging one button will cause a particular commercial result.

The To tasks action opens Ask Hakken with a prepared request containing the site, page and suggested steps. It does not directly create a guaranteed task record, implement the recommendation or publish a page change. Complete any task-creation and implementation workflow separately.

## How Experiments Become Ready

Saving conversion reviews creates a Ready experiment for a non-Keep page/verdict combination when one does not already exist. That identity is the page plus verdict. A later review can update the reason on a Ready record, while an existing Running or Done record prevents another identical combination being created through that normal path.

Ready is a proposed follow-up. It does not mean a change has been built or tested. Review the actual page, agree an implementation and obtain the normal authorization for your website before saying the change is live.

The experiment list reads up to fifty records in each of Ready, Running and Done. A missing record can reflect those read bounds or a different status, not an exhaustive finding that it was deleted. Screen pagination organizes that supplied list without expanding those backend limits.

## Mark A Change Live

After the relevant external change is actually live, the supported action changes the experiment from Ready to Running. Hakken records the current start time and a baseline from the latest retained last-month landing-page observation. It does not independently inspect your deployment to verify that the change happened.

The baseline is not a newly captured exact thirty days ending at the button click. The helper reads the saved lastMonth window and stores its actual from/to. Depending on source freshness and calendar timing, that can differ from the literal thirty days immediately before the public change.

If that saved source or page is missing, the current implementation can store zero visits and enquiries with empty dates. This is a known evidence limitation, not confirmed zero customer activity. Inspect the baseline dates and figures before treating the experiment as a reliable comparison; application changes to prevent or distinguish this require separate work.

The current mutation checks authenticated access to the experiment's company website. It does not add the separate oversight-role refusal used by listing management. Do not assume all company write surfaces have identical role policies merely because they share a screen pattern.

## Running, Reverting And Measuring

The Running action starts an eight-week eligibility clock. A later conversion save checks up to fifty Running records and marks due ones Done using the latest retained last-month page figures. There is no dedicated promise that the record completes at exactly midnight eight weeks later without another suitable analysis save.

Missing result evidence can again become zero figures and empty dates under the current fallback. Done therefore means a stored result step occurred, not that measurement was complete, statistically significant or favorable. Compare baseline and result windows, source readiness and concurrent business changes before interpreting the difference.

Not live returns a Running record to Ready and clears its start/baseline fields. It does not undo a public website edit. The underlying mutation also supports a dropped state, but the normal table described here displays Ready, Running and Done rather than offering every backend state transition as a customer control.

This process is before/after observation. It does not split traffic, assign control groups, enforce one changed variable or establish causation. Seasonality, source changes, marketing activity and page edits elsewhere can affect results. Treat the comparison as evidence for investigation rather than a controlled scientific conclusion.

## Exports, Retention And Practical Use

Local list and chart downloads contain the supplied saved rows and measurements. Preserve the actual baseline/result dates and source window when sharing an experiment. Do not relabel a missing-data zero as a measured loss or an Approved/Running state as proof of external deployment.

Conversion summaries keep the latest saved record per holding. Experiments have a retained-record lifecycle in the current retention declaration; these handlers do not automatically clear an old experiment just because a new week arrived. Existing same-page/verdict records can consequently affect future suggestion creation.

For a practical review, establish source readiness, inspect the page and recommendation, implement an agreed change outside these report reads, then record it live only when that statement is true. Review later dates and data completeness before claiming success. See [Insights Measurement And Enquiries](./insights-measurement-and-enquiries.md), [Insights Strategy And Planning](./insights-strategy-and-planning.md), [Microsoft Clarity](./microsoft-clarity.md) and the [developer guide](../developer/page-reviews-and-experiments.md).
