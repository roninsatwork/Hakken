---
product: Hakken
documentation_type: User guide
feature_area: private Google tracking and fan-out opt-in
audience: workspace users, support and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/google-search-tracking.md
last_reviewed: '2026-10-26T11:05:39+00:00'
reviewed_against: current implementation
status: Current
---
# Google Search Tracking And Fan-Out Queries

> **Product:** Hakken · **Document type:** User guide · **Feature area:** private Google tracking and fan-out opt-in
> **Reviewed:** 26 October 2026, 11:05:39 GMT (Europe/London)
> **Source path:** `docs/end-user/google-search-tracking.md` · **Status:** Current

Google search tracking records how a website appears for searches selected for its company's list. It differs from the Organic Keywords report, which describes searches found in a supplier's ranked-keyword list. Tracking asks the collection system to keep checking chosen phrases. A search can be organically ranked without being tracked, tracked without appearing in the returned results, or given a single first check without being scheduled repeatedly.

Open the website's Google search views in Visibility. Your searches is at `/app/sites/[siteId]/google/searches`; tracked fan-out queries are at `/google/fan-out`; related evidence includes Who is above you at `/google/above`, search features at `/google/features`, and questions/related searches at `/google/questions`. These pages read saved results. Opening them does not perform a live search or buy a new provider request.

## Company Lists And Competitor Context

A tracked list belongs to the company's saved website holding. It is not a global subscription attached to the hostname. Different companies can track the same website or phrase without seeing each other's list choices. Shared purchased search facts can serve several permitted readers, but the fact that someone else checks a phrase is not itself information the report should reveal.

Owned websites and tracked competitors can open similar report pages. On a competitor, the list context follows the company's paired owned site so a comparison asks how the competitor stands on the company's chosen searches. It is not permission to edit the competitor's own private tracking list. The customer fan-out control refuses changes on a tracked-competitor holding, even if its report can display relevant comparisons.

Check the company, website, location and last-check date before interpreting a result. A phrase measured in a different market can produce a different position. The position line is observed evidence at saved dates, not a guarantee of what a particular signed-in Google user would see now. A checked-and-not-found record is also different from a date with no check at all.

## Your Searches And Position Lines

Your searches lists the saved phrases, active state, current verdict and available last, previous, best and checked dates. The query prioritizes active searches, then better known positions and phrase text. Rows introduced by a fan-out tracking choice carry that origin, allowing the separate fan-out page to select them without treating every manually entered keyword as AI-derived.

The chart can show at most five requested searches at once and uses saved position points. A weekly or monthly step takes the last observed position in that step; it is not an average rank. Older daily detail is compacted under retention rules, and the page can indicate where daily history gives way to coarser retained points. A gap should remain a gap rather than being drawn as a made-up ranking at the bottom of a result page.

A keyword detail page can connect the private tracking evidence with organic ranking and a retained search page. A current tracked check and a supplier organic-list ranking are separate observations with their own dates and position conventions. Use the labels and dates before declaring an improvement, loss or contradiction. The [Organic Keywords And Pages](./organic-keywords-and-pages.md) guide explains current versus older list rows and comparison limits.

## What A Fan-Out Query Means

A fan-out query is a search wording associated with a tracked AI question: an assistant may break that question into searches when assembling an answer. Hakken groups related wordings into a topic for review. It records which configured answer engines supplied evidence, rather than assuming every proposed wording is a keyword a customer wants checked forever.

Generated queries normally appear unticked with one first Google check available. Ticking a topic tracks the first wording shown, subject to the website's limits. Stopping a grouped topic stops the tracked wordings supplied for that topic. Tracking does not edit the question's original wording, alter Google's results or prove that the AI engine will use the exact same wording on every future answer.

On an owned website, the tracked fan-out page offers the tracking change to a company user who can open the site. This is implemented by a tenant-scoped mutation rather than a super-admin-only action. Manual list administration and the full prompt fan-out editor are separate platform operations. Do not assume the same role can use every editing surface merely because its report is visible.

## First Check Versus Recurring Tracking

An unticked query can have one first check. If matching saved search statistics already exist for that website and location, the first-check record can immediately refer to them without buying the same observation again. Otherwise a future collection plans the required request. A queued first check is not an instantly completed Google result; collection must be enabled and the relevant background work must progress.

Once a phrase is tracked repeatedly, an unbought first-check entry is unnecessary and can be removed. Stopping a phrase does not erase its retained observed positions or every completed request. When the tracked row originated from an AI-search choice, stopping removes that list row; a phrase entered manually is instead paused so the company's own entry is retained. These outcomes both stop recurring checks but leave different list evidence.

Removing a phrase from one question's fan-out list does not necessarily remove it from every question on that website. If another question still lists it, the shared website-level choice can remain relevant. Previously purchased or completed first checks are retained rather than treated as unperformed. Deleting or editing a list choice is not a retrospective cancellation/refund of completed external work.

## Adding And Editing Through An Operator

Platform operators can manage the company's website searches and per-question fan-out choices. Manual keyword administration has add, active-state and remove operations under super-admin write permissions. Shared phrase validation, duplicate detection and per-website limits apply to the common add helper, including entries added by other approved workflows such as keyword research or Auto Setup.

The fan-out editor can add a company wording, edit it, remove it or restore it. A newly supplied company wording attempts recurring tracking if there is room; if not, it can remain as a one-check candidate. Editing can carry a previous tracking choice to the new wording when allowed. Removed AI wordings are remembered so regeneration does not simply reintroduce them as if the removal never happened. This is list management, not a content-publishing or ranking-fixing feature.

Generate asks the question's configured answer engines through the collection system and can reuse an answer already purchased for the same request identity. It refuses when company collection is switched off or no configured assistant can be asked. Its response reports requested/reused work and whether sending started; it does not prove a finished answer, a new Google result or a successful live integration. The current limits and provider allowances still apply.

## Result Pages, Features And Questions

Who is above you uses the latest retained full search page for the company's searches. When the site is present, it lists results ahead of it; when absent, it uses the first ten results as the comparison set. A known rival is marked using the company's website group. This is a saved search-page comparison, not an assertion that those businesses always outrank the site in every location.

The features view summarizes observed features such as AI Overviews, map packs, featured snippets and related question panels, including the website's appearance where a feature identifies domains. Questions and related searches are deduplicated from retained pages and show which tracked searches supplied them. Their presence does not automatically add them to tracking or promise a new content task.

Full saved search-page detail is retained for ninety days under the current policy. A detail view can later keep a position/date without the full result-page evidence and explicitly indicate the page was not kept. An empty above-you list can therefore reflect retention rather than a site with no competitors. Question aggregation is bounded, so even a long list is not an unlimited archive of all questions ever observed.

## Limits, Usage And Practical Guidance

Recurring tracking consumes future collection work and can contribute to recorded credits. Both the overall tracked-keyword limit and the separate AI/fan-out tracked limit matter. A manually entered phrase is not automatically counted against the same origin-specific limit as an AI-search choice. Limits can inherit from platform/company/site settings, so an error should be resolved with the responsible operator rather than repeatedly retried.

Keep a list focused on searches relevant to the business, inspect its first evidence, then choose which deserve recurring tracking. Check the saved date before describing a change and distinguish a first check from an active recurring choice. Pausing a list or stopping tracking does not erase history or stop every other independent workflow that could purchase similar shared facts.

This guide was checked against private-list helpers, Google report queries, fan-out customer controls, admin handlers, filing and retention policy. No search was added, removed, generated or checked; no paid provider request or browser was run. A local implementation and source test are not deployed integration acceptance. For exact ownership, limits and side effects, see the [developer tracking guide](../developer/google-search-tracking.md).
