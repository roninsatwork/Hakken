---
product: Hakken
documentation_type: End-user guide
feature_area: technical site audit
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/technical-site-audit.md
last_reviewed: '2026-10-26T11:27:06+00:00'
reviewed_against: current implementation
status: Current
---
# Technical Site Audit

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** technical site audit
> **Reviewed:** 26 October 2026, 11:27:06 GMT (Europe/London)
> **Source path:** `docs/end-user/technical-site-audit.md` · **Status:** Current

The technical site audit helps a website team understand the crawl evidence Hakken has saved about its site. It brings together a crawl summary, recognized technical problems and examples of affected pages or broken links. Use it to decide what to investigate and repair in the website you operate. Viewing an audit does not change that website, repair its pages or prove that a later deployment solved a problem.

Open an owned website in Visibility, then open its Audit area at `/app/sites/[siteId]/audit`. The active company must hold the website. The normal audit screen does not offer collection for tracked competitors; it displays the competitor-not-collected explanation instead. This customer interface boundary should not be read as a claim that every shared historical crawl record is separately restricted to owned sites by the backend.

## Start With The Evidence Date

The current audit reads the newest saved crawl summary. Its date describes that saved observation, not the time you opened the screen. A history chart can show earlier stored observations while the issue table describes the newest crawl. Before comparing two figures, establish whether they concern the same day and collection.

The report can contain a score, the number of pages crawled, an available maximum-page allowance, pages found and internal or external link figures. The saved response can also supply server or content-management information. Missing values remain missing; they are not silently converted into measured zero or a guarantee that a technology is absent.

Pages found can include pages still queued as well as pages reached. It is therefore different from the number actually crawled. A crawl stopped by its configured limit can leave a large site only partly inspected. A high score over a small sample is not a whole-site certificate, and an empty problem table cannot establish that all pages are healthy.

The operation definition has a default maximum of one thousand pages and a thirty-day refresh interval, with JavaScript enabled. These are implementation defaults for collection planning, not a promise that your particular saved crawl used that maximum, ran on schedule or reached every page. Check the observation and any displayed limits rather than inferring freshness from the configured interval.

## When The Crawler Could Not Get In

Hakken gives particular attention to a crawl that reached three pages or fewer. In that situation it checks saved evidence for robots restrictions, an unreachable site, an error page, no-index instructions or excessive redirects. If none of those named explanations matches, it can show a general blocked result. This is a diagnostic heuristic based on a very small crawl, not proof of a particular access-control setting.

A genuinely tiny website can also have very few pages. Read the explanation alongside the actual URLs and the site's intended size. Conversely, a crawl reaching more than three pages does not receive this particular turned-away classification, even though other parts of the site may still be inaccessible. The absence of the warning cannot prove unlimited access.

If the explanation names robots, redirects or an error page, inspect those settings in your normal website maintenance process. A no-index instruction may be deliberate for a private or staging page. Do not remove a restriction solely to improve the report. Decide whether the page should be publicly discoverable, and preserve intentional privacy and security controls.

No browser test or new supplier crawl is triggered just by reading this guide or opening the report. A later collection is separate work with its own scope and cost controls. The currently displayed observation remains historical evidence until new results are successfully stored.

## Reading The Issue Table

The issue table uses the checks recognized by Hakken's crawl parser. It groups them into error, warning and notice levels and shows the saved counts. This is a selected dictionary of known checks; it does not assert that every possible supplier diagnostic or every technical website concern appears here.

Use the available filtering and heading sorting to narrow the issue list before deciding where to begin. A problem count describes the crawl's summary for that check. It does not necessarily equal the number of page examples you can open, because the summary and detailed examples have different collection and reading limits.

Download from this audit view exports the issue rows currently selected by its local filtering. It is useful for sharing the observed issue list with the person maintaining the website. It is not a complete export of page HTML, every broken link, server logs or every problem the supplier may have reported outside Hakken's recognized dictionary.

Treat severity as triage support. An error on a key customer journey can deserve attention before a large number of low-impact notices, but the report does not know your commercial priorities merely from those counts. Combine the affected URL, intended page purpose and other saved evidence before allocating work.

## Opening A Problem

Open an issue to reach `/app/sites/[siteId]/audit/problem` with its selected check. The problem screen reads affected page examples from the latest saved crawl. For broken-link issues it also associates saved broken destinations with the source pages where those links were found. The page URL, status and diagnostic fields help you find the corresponding problem in your website's own tools.

A URL listed here is an observed address, not permission to edit that page through Hakken. A broken destination can belong to your website or an external website. The report does not automatically rewrite a link, create a redirect, contact another site or submit a repair request. Those actions require your normal website workflow.

The stored detail contains addresses, failed checks and numerical observations such as loading measures, page size, word count, link counts or depth when provided. It does not store the page's full words or body in these crawl-detail records. A word-count field is a number about the observation, not a saved article that you can recover from this screen.

An empty detail view can mean no matching page was found in the retained readable sample, missing detail, or a newer summary whose detail has not finished filing. It does not reverse a positive summary count. Start by comparing dates, checking the collection state and reading any cut indication before concluding that the issue was invented or fixed.

## Coverage Limits And Delayed Detail

Detailed collection can request up to ten batches of one thousand pages and separately up to ten batches of one thousand broken links. Reaching that collection ceiling marks the detail as cut. The problem reader then has its own smaller bound: it reads at most one thousand page rows before applying the selected problem filter, plus at most one thousand broken-link rows for the broken-link check.

This ordering matters. A problem affecting pages beyond the reader's retained candidates can have fewer visible examples than the headline count, even if collection fetched more than one thousand pages. The cut flag warns about bounds; paging the displayed list is not an unlimited route around the server's evidence limit.

Summary and detail arrive through separate steps. The system fetches both detailed lists before starting to replace stored detail, so a supplier refusal at that fetch stage preserves the older detail. Later writes occur in chunks, and the whole sequence is not one atomic replacement. A read during filing can therefore differ from a later read without a new crawl having taken place.

The detail job retries a failed fetch with a fifteen-minute delay, for up to three attempts in total, then records a parsing failure. This is background recovery, not a reason to repeatedly press buttons or launch extra paid collections. A persistent failure should be investigated by an operator from the recorded job and error information.

## Retention, Permissions And Practical Follow-Up

The retention declaration keeps crawl summaries as historical observations and designates page and broken-link detail as latest-only evidence. Older detail is not promised as a complete archive for each historical chart point. A historic summary can remain useful after its page examples have been replaced.

Company holding checks apply to the audit queries. A site identifier copied from another company is not sufficient access. Opening a report is a read operation; it does not change plan settings, ownership, tracking choices or the website. If access fails, verify the active company and its holding before requesting operational intervention.

For a practical repair handoff, record the saved day, the selected issue, important affected URLs and any incomplete-coverage warning. Have the website maintainer verify the cause and make the appropriate change in that website. Confirm the result with a later authorized observation; an old Hakken row cannot prove what happened after the change.

Use [Organic Keywords And Pages](./organic-keywords-and-pages.md) for saved search-performance context and [Backlink Reports](./backlink-reports.md) for incoming-link evidence. These reports describe different sources and time windows. None alone proves a repair increased leads or sales. Implementation details and local test evidence are in the [developer guide](../developer/technical-site-audit.md); external integration cutover and deployed acceptance remain separate concerns.
