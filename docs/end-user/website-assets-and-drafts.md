---
product: Hakken
documentation_type: End-user guide
feature_area: website asset summaries and off-site drafts
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/website-assets-and-drafts.md
last_reviewed: '2026-10-26T11:55:32+00:00'
reviewed_against: current implementation
status: Current
---
# Website Assets And Suggested Drafts

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** website asset summaries and off-site drafts
> **Reviewed:** 26 October 2026, 11:55:32 GMT (Europe/London)
> **Source path:** `docs/end-user/website-assets-and-drafts.md` · **Status:** Current

Your assets brings several saved visibility signals into one list of places where people may encounter a business: its website, selected pages, Google profiles, review pages, AI observations, directories and web mentions. Suggested drafts provide words a person can consider using for specific off-site improvements. These are implemented reporting and drafting foundations, not a complete asset census or automatic publishing service.

Open an owned website in Visibility and choose Your assets at `/app/sites/[siteId]/assets`. Draft links open a particular saved suggestion at `/app/sites/[siteId]/drafts/[draftId]`. Draft lists appear in the relevant Local, Reviews or Links context. The active company must hold the relevant website before its data or draft can be read.

## Check The Summary's Age

The asset table reads a saved summary. It is calculated from the evidence other reports already retain, rather than contacting every service when you open the page. A collection can book recalculation fifteen minutes later so related filing and judgments have time to arrive. That delay is scheduling behavior, not proof every source has finished by then.

The stored summary timestamp changes when its calculated rows change. If a rebuild produces identical rows, the writer leaves the record alone. Its age is therefore not necessarily the last time any background code checked the underlying evidence. Equally, opening the screen does not guarantee a rebuild or a new observation.

Different rows can depend on different sources and days. Check the underlying report before treating the summary as a synchronized measurement of all customer touchpoints. A missing row can mean its supporting evidence is not present, while an existing row can reflect a bounded saved sample.

## Read The Stages As Triage

The four stages are Not there, Not seen enough, Seen not chosen and Working. They are rules over stored figures, not a complete customer funnel measured from impressions through sales. A Working label does not prove a page converts, a listing generated a lead or an AI recommendation made money.

The website rule uses saved page-one keyword bands and estimated visits. Under ten page-one searches is Not seen enough. With at least that coverage, estimated visits below the page-one count produces Seen not chosen; otherwise the rule can say Working. Missing traffic does not create a complete conversion measurement, and these thresholds are guidance rather than commercial acceptance criteria.

A Google office uses its selected Maps checks. No checks, or appearances in the first three on fewer than half its checks, gives Not seen enough. Its chosen field explicitly says the corresponding direct outcome was not read. The suggested first fix can instead emphasize unanswered reviews when retained answered share is below eighty percent.

A linked own Trustpilot or Tripadvisor page uses its stored review count, with twenty as the threshold for Working. That is a simple review-volume heuristic. It is not a claim that an AI platform requires exactly twenty reviews or that a larger count guarantees visibility, trust or sales.

## AI, Pages And External Places

The ChatGPT asset uses one latest available app-style answer per relevant question. It considers whether saved app evidence read own pages and whether business cards match the website or configured brand names. Reading pages without showing the business can lead to Seen not chosen. That co-observation does not prove why the answer made its choice.

Google AI Overviews use the active tracked-search evidence. The row can be Seen not chosen when fewer than half of the saved overview-present checks cite the website. This denominator is selected readable checks, not every Google search in the company's market. Missing overview evidence can mean the row is absent rather than a universal zero.

Selected own pages come from Brand Radar citations, limited to the three most quoted retained URLs. Directories and review-site opportunities are limited to six leading quoted hosts. A host quoted beside rivals but not your site can become Not there. These rows are a shortlist, not every public profile, every website page or every possible placement.

Press and the web uses the stored shown mentions. No held mention pages produces Not there; fewer than twelve produces Not seen enough; at least twelve with fewer than half marked linked produces Seen not chosen. The link marker is host-level retained backlink evidence, and mention thinning is filing-triggered, so the summary inherits those limits.

## Browse And Export The Asset List

The table provides asset name, kind, seen and chosen evidence, stage and a suggested first fix where available. Kind and stage filters and text search narrow the visible candidates. Heading sorting and the shared Sites pager arrange the supplied summary without buying more evidence.

Headline counts summarize all saved asset rows, so they need not shrink with a table filter. Missing-placement navigation leads into the cited-source opportunity report. Opening a row takes you to its supporting workflow; it does not edit the external profile or apply the suggested fix.

The local download uses the sorted filtered asset rows supplied to that control, with human-readable evidence and stage columns. It is a snapshot of this summary, not a raw provider export or a universal registry of the company's digital assets. Keep the source report and observation context with any action list you share.

## What A Suggested Draft Contains

Off-site drafts can propose a profile category, name or description, a Google post, a review request, replies grouped into a review-response draft, or an outreach email. They include a target, reason, title, body and optional tagged website link. Different draft kinds belong to Local, Reviews or Links.

Draft generation uses retained company pages, limited profile evidence, selected unanswered review excerpts and suitable backlink gaps. It does not read every page of the live website. The model is instructed to avoid invented claims and leave explicit bracketed gaps where business input is needed. Those generated gaps require human attention; they are not verified facts.

Normal parsing limits body text to three thousand characters, title to one hundred sixty, target to one hundred twenty and reason to three hundred before saving. A tagged link can be appended afterward. The prompt's tighter writing requests for posts, descriptions and emails are model instructions, not all enforced as separate hard limits by the draft parser.

The generator accepts up to four Local, two Reviews and eight Links drafts per parsed/saved batch. Those are bounded work sizes rather than a durable guarantee of that exact number every week. Existing recent targets and available evidence can reduce the number produced.

## Approve, Copy, Dismiss And Undo

Open a saved draft to read its reason, target and full words. Approve attempts to copy its body and records the draft as Approved. It does not send the email, post to Google, alter a listing, create a public review or publish content on your website. You still need to use the relevant external service through your normal authorized process.

Clipboard availability can vary. The page suppresses clipboard failure and can still save Approved, so verify that the expected text is actually on the clipboard before leaving the page or pasting. Approved means a saved local decision, not proof of successful copy, delivery, publication or public acceptance.

Dismiss marks a proposed draft Dismissed. Undo returns an approved or dismissed draft to Drafted and clears the saved decision details. It does not revoke a message you already sent or roll back a public change you made elsewhere. Copy again is available for an approved draft; it remains the same saved content rather than generating a fresh version.

The current decision handler checks authenticated company website access and does not add a separate oversight-role refusal like Your listings does. Do not assume those two workflows have identical write permissions. Any decision to tighten that policy requires a separate application change; this documentation pass has not changed it.

## Tagged Links And Outcome Claims

When a valid selected website page is included, Hakken adds source, medium and campaign tags. Campaign names begin with hakken and include the kind and week. They support later analysis when the link is actually used and compatible analytics evidence is collected.

A tagged link does not by itself create visits, enquiries or attribution. Approving a draft also does not prove the business used that link in the external service. Compare actual saved campaign evidence separately before saying a draft improved outcomes.

The origin is derived from a suitable saved Search Console URL property when present, otherwise the website host. Inspect the resulting link before using it, especially where a business has several properties or domains. The generator is restricted to supplied page paths but does not certify that every destination remains correct and reachable today.

## Repetition, Retention And Follow-Up

Saved drafts of the same kind and target normally suppress another suggestion for sixty days unless the latest earlier draft was dismissed. Dismissal can therefore permit a later replacement; it is not a promise to suppress that topic forever. The recent-area list itself shows up to sixty drafts created within the last sixty days, so an old waiting draft can leave the list without having been acted on.

A directly opened older draft can remain available while retained. Draft cleanup removes a bounded group older than two years when saving new drafts. This is not immediate timed deletion at the two-year anniversary. Asset summaries and draft records have separate lifecycles.

Use the asset table to identify an evidence-backed investigation, then review any suggested words for factual accuracy, sensitive information and suitability before taking an external action. See [Local Business Profiles And Listings](./local-business-profiles.md), [Review Intelligence](./review-intelligence.md), [Web Mention Monitoring](./web-mention-monitoring.md) and the [developer guide](../developer/website-assets-and-drafts.md). No label here establishes live deployment acceptance or completion of the planned Hakken product surface.
