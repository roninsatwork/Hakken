---
product: Hakken
documentation_type: End-user guide
feature_area: Brand Radar and AI Overview gaps
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/brand-radar.md
last_reviewed: '2026-10-26T11:49:06+00:00'
reviewed_against: current implementation
status: Current
---
# Brand Radar

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Brand Radar and AI Overview gaps
> **Reviewed:** 26 October 2026, 11:49:06 GMT (Europe/London)
> **Source path:** `docs/end-user/brand-radar.md` · **Status:** Current

Brand Radar helps a company inspect the questions, business mentions and cited sources retained from a supplier's AI-answer dataset. It compares the owned website with a limited group of watched competitor websites in the configured country. It also includes a separate gap report built from the company's tracked Google search checks. These are complementary observations, not a single live census of everything Google or ChatGPT says.

Open a website in Visibility and choose Brand Radar at `/app/sites/[siteId]/radar`. The report family includes AI Overview gaps, Websites AI cites, a question detail and a cited-website detail. The active company must hold the website. Report navigation uses the owned website and its watched group rather than exposing another company's private question list.

## Establish Which Evidence You Are Reading

The main Brand Radar reading targets Google's AI answers in the website's country and English. The configured request defaults to two hundred questions, with the actual resolved question limit governing planned requests. The supplier's total can be much larger than the retained question examples. Do not assume the question table exhausts the headline mentions.

Radar collection must be enabled through the company's Brand Radar part. It uses thirty-day planning/reuse periods for the owned website and bounded watched rivals. An enabled switch or visible old result does not prove a new collection completed this month. Each website can have a different latest saved observation.

The repository also implements a separate ChatGPT aggregate collection path, gated to a United States home country and its own ChatGPT mentions switch. That restriction is in the current implementation; it is not a promise about the provider's entire current commercial coverage. The Brand Radar question/source screens described here read the Google records, not full ChatGPT transcripts from that aggregate path.

Private tracked AI questions are another workflow. They request and retain evidence for your selected prompts and engines. A Radar question can be useful without already being in that private list, and a private prompt can be absent from the supplier's Radar sample. Use [AI Questions And Answers](./ai-questions-and-answers.md) for that distinction.

## Read The Overview

The overview compares observed mention totals, an asks measure, unique own pages cited and monthly series for the group. Mentions uses the supplier total returned for a website's reading. Asks sums volume values for the question examples retained from that response. Those measures have different coverage and should not be divided into a universal market exposure rate.

A page-citation count concerns distinct retained URLs belonging to the relevant website. It is not the number of conversions from those pages, all AI citations ever made or a guarantee that the public page remains unchanged. Monthly observations describe the supplier dataset and Hakken's stored reading, rather than a continuous count of every real person's conversation.

The chart exposes up to the latest twelve months present across the group. A missing month for one business stays unknown. Each business's headline can refer to its own latest month, while the group has a later month supplied by another business. Read the available dates before treating all businesses as a synchronized comparison.

The notice can show the recorded cost of the owned site's stored Radar pull. It is not a guaranteed fixed price for the next check, a cost for every rival combined or actual customer advertising spend. Supplier pricing and configuration are separate operational concerns.

## Inspect Questions And Mention Order

The question table merges matching question text across the held group. It shows available volume, whether your website was named, rivals named in the retained answer evidence, a cited own page when present and whether the question already appears in the private tracked list.

The displayed place is the order of first detected business mentions among the watched group. It comes from character positions in separately stored answer observations. It is not an organic Google position, a universal AI recommendation ranking or proof of which business a user chose. Businesses outside the watched group are not assigned places in that comparison.

Detection uses configured brand names, with a host-derived fallback when names are unavailable. An ambiguous or missing brand name can affect whether the parser recognizes the business. A null place means no matched mention in the retained evidence for that entry, not proof the answer never refers to it in another spelling or an unseen source.

Open a question at `/radar/question` to see the retained named businesses and cited pages together. If no current reading holds that question, the page reports it not found. Older monthly totals do not preserve every earlier question detail, so a previously opened detail can cease to exist in the current sample without an automatic product deprecation.

## Track A Question Deliberately

A super-admin can use Track from supported Radar question views when the question is found and is not already marked tracked. It invokes the existing private-question creation workflow, including its validation, duplicate checks, limits and default engine selection. It does not turn every Radar question into a customer-editable campaign or automatically track the whole table.

The tracked marker checks list membership; it does not prove recurring collection is enabled, the prompt is active or an engine answer is fresh. Paused questions can still be members. Review tracking configuration in the dedicated AI-question workflow before expecting recurring evidence from a newly selected prompt.

Customer viewers can inspect the report without being allowed that super-admin action. A missing Track control can therefore be the expected permission boundary. Hakken does not grant platform administration merely because someone can read a website's Radar evidence.

## Websites AI Cites

Websites AI cites groups retained source URLs by their normalized host. It shows how often those pages occur beside the owned site's and rivals' readings and how many watched rivals contribute. Host types distinguish your website, rivals and broad categories such as directory, reviews, forum, news, video, reference and other websites.

Counts describe source-page occurrences across retained questions and business readings. Two URLs from one host in one question can contribute two occurrences. The same question represented in more than one business's reading can contribute again. They are not counts of unique human searches, unique publishers or unique conversations across the whole AI platform.

The page also highlights a limited top-page sample. The backend returns five leading source pages, not an unlimited list of every page in every response. Kind, presence and text filters narrow the available report. A host missing from the table can reflect sample coverage or classification rather than a proven absence from all AI answers.

Open a cited website at `/radar/sources/website` to inspect its retained pages and questions, how often it appears beside each watched business, any known rival-link gap and pages found naming your business. The detail's citation grouping uses the exact normalized host, so a mobile subdomain can be separate from the main host.

Already mentioned, linked and quoted are different forms of evidence. The detail can show unknown where no relevant source is held. A suggestion to obtain a listing, make a video or answer a question is guidance from those observations; the report does not perform that external action or contact anyone.

## AI Overview Gaps Uses Tracked Google Searches

AI Overview gaps at `/radar/gaps` reads the company's active tracked Google searches and stored search-result overview records at the website's configured place. It does not buy another Radar response. It asks whether a saved Google check contained an AI Overview and whether the stored cited-domain set includes the website.

The visible table selects checks with an overview. Its gap emphasis includes searches where the website has a positive-style stored organic position within the screen's top-rank threshold but is not cited in the overview. This is an investigation opportunity, not a promise that rewriting the ranking page will cause a citation or increase sales.

The row shows at most three cited domains, with the website first when present. That short display is not the whole source list. Its page and rank come from stored keyword evidence, while the overview comes from a search check; these can have different observation dates.

The earlier comparison reads an available check at or before thirty days ago for each current tracked search. Missing earlier checks remain an incomplete baseline. A change in quoted count is therefore not necessarily an equal-sample controlled measurement, especially if the private tracking list changed.

## Retention, Exports And Practical Use

Current Radar question/source detail is replaced as a latest-reading record. Monthly writers keep a rolling thirty-six observations even though the broad retention declaration describes these series as retained history. The UI shows at most twelve. Treat thirty-six months as the writer's implemented bound rather than promising an unlimited archive from the retention label alone.

The writer does not have a separate newer-month refusal for current question detail. Operationally reparsing an older result can replace that current sample; this documentation pass did not run such a repair. If dates unexpectedly move backward, ask an operator to inspect the stored pull and filing history before purchasing more evidence.

Local list and chart downloads represent the supplied or displayed retained rows and series for the relevant view. They do not contain the supplier's complete AI-answer database or full original answer text. Preserve country, month, source and sample labels when sharing an export.

For a useful review, confirm the owned site, rival group and country; inspect a small set of commercially relevant question gaps; verify the cited public pages; and decide any content or external placement work through its separate workflow. See [Web Mention Monitoring](./web-mention-monitoring.md), [AI Visibility Reports](./ai-visibility-reports.md) and the [developer guide](../developer/brand-radar.md). These implementation reports do not establish deployed integration acceptance or that any planned product outcome has been delivered.
