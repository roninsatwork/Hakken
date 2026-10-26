---
product: Hakken
documentation_type: User guide
feature_area: AI mentions, share, sources, app evidence and demand
audience: workspace users and customer support
source_repository: roninsatwork/Hakken
source_path: docs/end-user/ai-visibility-reports.md
last_reviewed: '2026-10-26T11:16:50+00:00'
reviewed_against: current implementation
status: Current
---
# AI Visibility Reports

> **Product:** Hakken · **Document type:** User guide · **Feature area:** AI mentions, share, sources, app evidence and demand
> **Reviewed:** 26 October 2026, 11:16:50 GMT (Europe/London)
> **Source path:** `docs/end-user/ai-visibility-reports.md` · **Status:** Current

AI visibility reports summarize saved external-answer evidence for a company's chosen questions. They show mentions and stance, the website's share of mentions within its tracked comparison group, cited pages, app-displayed businesses, read-versus-cited pages and measured AI demand. These are related views with different inputs and observation windows. They are not a single score of the whole internet, a complete record of every AI conversation, or proof of revenue attributable to an answer.

Start by opening the correct website in Visibility. Its AI pages include Mentions, Share of voice, Sources, Businesses recommended, Read but not cited and AI demand. Use [AI Questions And Saved Answers](./ai-questions-and-answers.md) when you need the wording behind a result or help with the selected questions and engines. These reports read stored data; opening a page does not ask an engine again.

## Questions, Website Groups And Permissions

The private question list belongs to the company's website holding. An owned website uses its own list; a tracked competitor is compared through the applicable paired list context. The comparison group contains websites the company actually holds and recognizes. Another company's question choices are not included just because it tracks the same hostname or bought reusable answer facts.

Before making a comparison, check the active company, site, collection location and engine. Some engines accept location and others use a common default location. App evidence and model evidence can differ under the same engine brand. A customer can inspect these tenant-scoped reports without gaining platform-admin access or permission to change every question and collection setting.

The reports use maintained list summaries so an ordinary screen does not repeatedly scan every answer. Those summaries can lag filing or a list edit while background work runs. A settings save or a newly returned answer is therefore not a guarantee that every summary changed in the same instant. Use the recorded dates and detailed evidence when diagnosing a difference.

## Mentions And Stance

Mentions lists the selected question/engine pairs, how many retained observations were counted, how often the site was named, recommended or warned against, the latest checked day and the latest stance. No answer yet is distinct from an answer that did not name the site. A blank stance is not a measured rejection, while Not named is not necessarily a negative recommendation.

The maintained mention window contains the newest two hundred answers per question and engine. It is not necessarily the date span currently shown by a nearby history chart. The table's query reads the latest list summaries; a chart can read a selected historical range. Do not expect changing chart dates to turn the latest stance table into a complete historical recount of that interval.

Recommendations, names and warnings are separate recorded categories. Do not add them together as if each were an independent customer or sale. Open a saved answer when a particular classification matters, and keep expired wording or incomplete extraction visible in the explanation. A retained summary can remain after the original wording is no longer kept.

## Share Of Voice

Share of voice compares the selected site with its tracked group, per engine and across engines. The percentage is the site's recorded mentions divided by all recorded mentions of websites in that group. It is not the percentage of all answers that named the site, the share of every business in a market, or the share of Google search traffic.

For example, if a group has ten recorded mentions and the site has three, its displayed group share is thirty percent. An answer can name more than one group member, so the denominator can exceed the number of answers asked. Adding or removing a tracked competitor changes the group being compared; compare percentages with the group definition as well as the observation date.

When the group has no counted mentions, the interface can display zero share. That does not establish that the engine was asked successfully on every question or that no business was named outside the tracked group. The latest checked day and asked counts provide context. The overall percentage pools mention counts, rather than taking a simple average of already rounded engine percentages.

## Sources And Cited Pages

Sources lists this website's pages cited in answers to the permitted question list. It can show engines, citation count and first/latest observed dates. These are citations in held evidence, not first-party visits, referring sessions or a guarantee that a person clicked the source. A cited URL and a commercial referral are different facts.

The source query reads a bounded set of questions and citation rows, reporting when its coverage was cut. A missing page may be outside that held scope rather than never cited by any AI system. The report also differs from the answer-detail source list: one groups a site's pages across questions, while the other explains a particular saved answer.

Use a source row to inspect its page context or supporting answer rather than assuming the quoted content is still current. A source address can survive longer than the full original answer wording. Removing a tracked question changes what the company measures, but does not rewrite every shared historical citation as if it never existed.

## Businesses Recommended And Local Context

Businesses recommended uses saved ChatGPT app extras for active questions that select that engine. It does not combine every model and app supported elsewhere. The implementation reads up to four newest retained app-answer candidates per question, using the newest and previous observations for some comparisons and the small sample for usual listed position.

A business can be matched to the selected site by host or known company brand name. This is evidence matching, not independent verification of legal business identity. App-displayed ratings and review counts are saved fields, not a new live review lookup. Missing app extras can leave the panel empty even when an ordinary model answer exists.

The panel can compare those businesses with stored map results from the first configured office. It does not summarize every office or every Google Maps search automatically. A business seen in a map box but absent from a latest app answer is a useful investigation clue, not proof that the app deliberately rejected it. Verify the relevant dates and office before describing a local visibility problem.

## Read But Not Cited

Read but not cited compares pages the saved ChatGPT app evidence says it read with the sources it actually cited. A page can be read several times and cited less often. The view distinguishes the site's pages, tracked rivals and other hosts, and can identify a frequently cited alternative in answers that read the site's own pages.

These counts come from retained app extras and sources, not a network audit of an engine's private browsing history. A missing read event may reflect unavailable extraction. Page detail can connect the retained observations with other cited pages and available Brand Radar questions. That helps a team investigate content, but does not prove a causal reason for a citation choice or automatically authorize a page rewrite.

## AI Demand

AI demand puts measured monthly AI-query volume beside available Google search volume for relevant phrases. Candidates come from active tracked Google searches, fan-out searches and a bounded selection of the website's largest organic keywords. It is not a volume count of the company's private question list or of this company's own requests to an engine.

Demand collection is a separately enabled capability. The current planner refreshes stale or missing shared phrase/location figures on a roughly thirty-day age rule and does not buy a separate competitor demand set through this path. A missing figure is not a measured zero. Monthly series can contain up to the saved twelve-month history, while a displayed month describes the newest available measurement rather than today's traffic.

Use demand to compare topics and identify what evidence is missing. It does not convert AI asks into people, impressions, clicks, leads or sales. Differences between Google and AI demand can reflect their different data sources and collection periods; avoid presenting their ratio as a verified customer-conversion rate.

## Practical Review And Limits

Choose the question set and tracked group deliberately, confirm dates and observation types, then move from a summary to the saved answer or page when a decision matters. Keep bounded reads, delayed summaries, expired wording and engine-specific app extras visible. Exported tables carry the scope of their source read rather than becoming complete independent archives.

This guide was checked against current list aggregation, mention/share queries, citation limits, app-extra projections, AI demand and their source tests. No engine, Google API, supplier, browser, collection or application test was run. The implemented reports are useful foundations; they do not establish completion of every planned Hakken product outcome or deployed rename/integration acceptance. The [developer guide](../developer/ai-visibility-reports.md) gives exact module and calculation boundaries.
