---
product: Hakken
documentation_type: End-user guide
feature_area: AI-search growth and buyer-question panels
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/ai-search-growth-and-buyer-questions.md
last_reviewed: '2026-10-26T12:25:52+00:00'
reviewed_against: current implementation
status: Current
---
# AI Search Growth And Buyer Questions

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** AI-search growth and buyer-question panels
> **Reviewed:** 26 October 2026, 12:25:52 GMT (Europe/London)
> **Source path:** `docs/end-user/ai-search-growth-and-buyer-questions.md` · **Status:** Current

Insights AI search brings together several kinds of saved AI-related evidence: visitors attributed to assistants, configured enquiries, answers to private questions, cited pages, optional supplier mention series and search-demand estimates. Buyer questions is a related generated panel that can maintain selected prompts in the company's private AI question list. These datasets answer different questions and should not be treated as one complete count of AI influence or sales.

Open Insights and choose AI search at `/app/insights/ai-search`. The buyer-question panel appears in the owned website's Visibility Full answers page at `/app/sites/[siteId]/ai/answers`. Select the intended owned website and verify the active company before comparing data.

## Start With The Website And Window

AI-search growth uses the selected owned website or the company's first eligible owned holding. It reads retained history and shared evidence in that company context. It does not aggregate every owned website automatically or use another company's private prompts to fill gaps.

The general Insights period selector is not an input to this view. Its visitor comparisons use the newest three held whole months, with previous-three and year-earlier baselines only when those month records exist. The current helper takes the last three held months; gaps in the retained history are not an independent guarantee that those three are consecutive calendar months.

Monthly visitor history can extend across the retained whole-month set. Answer evidence uses a different recent history bound, and optional Radar series follow their own storage. Read the panel labels before presenting every line as the same selected quarter.

A missing comparison is not zero growth. If fewer than three suitable whole months exist, a headline window can be unavailable even while some historic monthly rows are visible. The report cannot infer missing traffic merely because a chart would be easier to read with a full baseline.

## Visits And Enquiries From Assistants

Assistant visits come from retained Analytics source/channel evidence recognized as AI-related. The report groups source names into assistant rows and shows the enquiries represented by the company's configured conversion mapping. Those enquiries are not automatically won customers, signed contracts or revenue.

Source identification depends on what Analytics received and how saved channel/source names map to known assistants. A person can discover a business through AI and later visit directly without that journey being fully attributable here. Likewise an AI-referred visit does not prove the assistant caused a later purchase.

The monthly chart and assistant table use those retained source observations. Their page-kind breakdown uses current company classifications for pages reached by the recognized sources. Reclassification can change grouped labels over existing history without changing the original visitor events.

Compare assistant performance within compatible periods and source readiness. Do not substitute supplier mention counts for measured visits or compute a precise AI conversion rate from an unrelated answer sample. The [Insights Measurement And Enquiries](./insights-measurement-and-enquiries.md) guide explains the wider attribution limits.

## Answers To Your Private Questions

The answer panels compare how often retained private-question checks asked, named or recommended each website, with monthly rows by engine. They include the owned website and up to five applicable watched rivals. A group change can alter comparisons without every business changing its public behavior.

These figures come from maintained daily list evidence and current private prompt/engine/place membership. They are not a record of every question the public ever asked an assistant. Naming, recommending and citing are separate measurements; a name mention is not silently counted as a recommendation.

The report reads at most four hundred daily answer lines per website within its history window. Its since date is the earliest day encountered in that bounded read, not a universal promise that the company's evidence began on that exact date or that earlier data never existed.

Changing the private prompt list can affect the context through which citation evidence is accepted. A current report is not a permanent archive of every historical private-list configuration. Preserve observation scope when comparing a changed list with an older period.

## Pages Cited

Cited pages are derived from retained source citations that match the company's asked prompt, selected engine and location context. The query initially reads up to nine hundred recent shared citation rows for each website before applying that membership test. Some matching evidence can therefore be outside the candidate window.

The own-page table keeps fifty leading normalized page paths with citation counts and engine labels. This is a bounded projection, not every exact source URL an assistant ever used. Normalization can group addresses under a page identity, while repeated citation events can increase its count.

The cut warning is conservative and can appear when the initial citation read reaches its bound, even if fewer matching private-question rows remain afterward. A short table with a warning is therefore possible. Paging the supplied table does not recover rows beyond the backend read cap.

A cited page need not be a recommended business, and a read page need not be cited. Use [AI Visibility Reports](./ai-visibility-reports.md) and [AI Questions And Answers](./ai-questions-and-answers.md) to inspect those different forms of evidence before claiming that an assistant chose the business.

## Optional Supplier Mentions And Demand

When the relevant collection part is enabled, AI search can show retained Brand Radar Google mention series and a separate ChatGPT aggregate series. Enabled controls affect which optional blocks are returned; opening a block does not purchase another response.

The separate ChatGPT collection planner is limited to the United States home-country guard in the current implementation. The report read itself checks the module switch and can display retained series; it does not independently prove the current site country is eligible for a new purchase. Old data and buying eligibility are separate facts.

Google Radar storage is country keyed, while this AI-search projection uses the site's configured place directly in its lookup. A city-level place can therefore lack the optional series that the dedicated country-normalized Radar report shows. That implementation discrepancy is documented for separate source review, not a reason to invent zero mentions.

AI demand lists up to fifteen retained high-volume search estimates when enabled. It is not measured visits to the business or a guarantee of current provider pricing/coverage. The backend leaves the adjoining Google comparison field unavailable in this projection; do not manufacture a ratio from a missing value.

## How Buyer Questions Are Built

The buyer panel proposes up to forty questions from retained service pages, selected ranking searches and guide subjects. It can phrase questions with or without the business name. The normal input reads bounded page/rank sets, selects up to twenty services and five guide titles and avoids filling every slot from one service page.

The panel becomes due after ninety days or when none is saved. Actual rebuilding happens in an Insights after-week step when suitable search inputs exist; it is not a guaranteed event at the exact ninety-day anniversary. Generating the panel can use the configured specialist model and incur recorded AI usage separately from asking its questions through the collection system.

The parser checks prompt length and duplicates but does not guarantee that every generated source phrase belongs to the supplied known-source map. An unknown source can have missing volume. Review the resulting questions for business relevance rather than assuming the panel is a verified market-research census.

## Synchronization, Limits And Pausing

The Buyer questions collection part governs synchronization into the private list. When off, matching panel prompts are made inactive. When on, matching prompts are activated and missing prompts are added through the existing private-question core, using its limits and default engine behavior.

This is ongoing panel maintenance, not just a one-time import. A manual pause on a prompt still included in the panel can be reversed by a later synchronization while the panel switch remains on. Turning off a separate recurring schedule is not the same as removing the prompt from panel control.

When a rebuilt panel omits an earlier panel prompt, the code pauses the matching private-list entry instead of deleting all shared answer evidence. A manual entry with the same prompt text can be affected because synchronization matches by prompt membership, rather than a wholly separate panel-owned record.

ASKING means the module is on and the matching private row is active. It does not prove a provider request completed. The displayed first-asked date is based on the list row's creation time, not an independently observed first successful answer. WAITING means the module is off; OVER_LIMIT can also reflect other add refusals or inactivity, not only a proven quota breach.

## Read And Export Responsibly

The growth page and buyer panel provide local charts, filters and downloads over their supplied retained rows. Downloads do not buy missing source data or expand the answer, citation, rival or demand bounds. Preserve source names, months and uncertainty labels when sharing them.

Buyer panels keep the latest saved set, while shared answer, citation, history and Radar tables follow their separate lifecycles. A panel change does not erase every older shared response, and a displayed growth line does not prove a live integration passed acceptance.

For a practical review, first verify assistant source attribution and the active private list, then compare naming, recommendation and citation evidence separately. Review generated panel questions and their synchronization controls before making tracking changes. See [Brand Radar](./brand-radar.md), [Google Analytics](./google-analytics.md) and the [developer guide](../developer/ai-search-growth-and-buyer-questions.md). These foundations do not establish a complete AI-to-sale journey or delivery of the full planned Hakken product surface.
