---
product: Hakken
documentation_type: End-user guide
feature_area: Insights Track record
audience: end-user
source_repository: roninsatwork/Hakken
source_path: docs/end-user/insights-track-record.md
last_reviewed: '2026-10-26T14:10:32+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Track Record

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Insights Track record
> **Reviewed:** 26 October 2026, 14:10:32 GMT (Europe/London)
> **Source path:** `docs/end-user/insights-track-record.md` · **Status:** Current

Track record brings together findings, the changes Hakken observed, and what the saved figures showed afterwards. Open `/app/insights/track-record` inside the company workspace. Use it when you need to review earlier advice, see whether someone marked a finding as acted on, or compare a recorded change with later enquiries. It is a record assembled from held data. It does not establish that every recommended action was published or that a change caused a sale.

This guide describes implementation present in this repository. Local code and test fixtures do not prove that the corresponding deployment, provider connections, or external integration cutovers are accepted in production. Product intent and the accepted integration rename issues remain in [PRODUCT.md](../../PRODUCT.md). The broader [Insights findings guide](./insights-findings.md) explains finding detail and task handoff; [Website assets and drafts](./website-assets-and-drafts.md) explains the approval work that contributes campaign entries here.

## Choose the scope before interpreting a figure

The company context controls which owned websites can contribute findings and changes. Select one website when investigating a particular business asset. Leaving the website selection open reads the company's available owned websites. This is not a way to inspect another company's findings. The query resolves accessible company holdings before projecting their data.

The summary figures count findings written, findings marked acted on, and right or wrong results. The selected website changes how checked totals are obtained. With one website chosen, the checked totals are calculated from the finding rows returned for that website. Across the company, those totals come from stored specialist tallies. Those two sources have different bounds and lifetimes, so the company tally need not equal a manual addition of currently visible website rows.

The backend reads at most 500 finding records per website before filtering to published findings. A large unpublished history can therefore reduce the published records available to this screen. The visible written and acted figures describe those returned records, not an unlimited historical count. Changing the website selection can also change the explanatory box and suggested next finding. Record the scope when sharing a result with colleagues.

## Read the findings list

Each finding shows its headline, whether it was marked acted on, its scheduled checking day, and its result. An outcome note, when saved, explains the comparison used. Open a row to return to its finding detail. Search matches the headline; the result selector narrows to due, right, wrong, or too early to tell. These controls operate on the returned list, with the regular Sites pagination controls used to browse that list.

Acted on is a saved acknowledgement associated with the finding. It is useful for tracking follow-through, but it is not independent evidence that a website, listing, or external campaign changed. Review the linked task and actual publishing record where that distinction matters. A finding can have an acknowledgement while its measured result remains unresolved.

An open finding whose checking date has passed can appear as too early before an outcome is persisted. The screen derives this display state from today's date. It is therefore important to distinguish a temporary display label from a saved outcome and explanatory note. Filtering by too early can include these overdue open records alongside records that were actually closed with an unclear result.

## Understand checking dates and resets

For figures held over a time window, the checking logic uses 30 or 90 days and allows three days after the span for figures to arrive. A shorter initial check can extend from 30 to 90 days if the first comparison remains unclear and the longer figures are available. The underlying comparison prefers the same days a year earlier, falling back to the preceding period when the yearly comparison is unavailable.

A detected change to the relevant page can restart the clock from that change day. The purpose is to avoid judging a new page change using a window that mainly predates it. The figure so far, comparison value, unit, and last recorded day can be shown while the finding remains open. That progress is saved during checking work; opening this screen does not itself fetch a fresh measurement from Google.

Some watched figures have no rolling span. They are compared with the value saved when the finding was written. Missing measurements can keep a result unresolved. For a clocked finding whose current figure disappears altogether, the implementation can close it as too early after a further 28 days beyond its checking date. Other incomplete combinations do not share a universal expiry rule. A date passing is not a guarantee that a conclusive result will exist that day.

## Read changes by their evidence source

The change list combines detected changes with approved draft entries. A detected page or profile change includes when it was seen, its source, the before and after figures, and a result. Page checks can identify changed opening wording, visible price, proof, forms, call-to-action placement, and structured information. These are observations from bounded checks, not a complete edit history from your content management system.

Some changes are inferred from Analytics page histories, including pages that appear removed, replaced, or merged. Replacement inference uses page activity and path similarity. It is not verification of a redirect, editorial intention, or a deployment. If Hakken later finds activity that contradicts a removal, the stored log can be corrected. Investigate the page itself before treating an inferred removal as a confirmed destructive action.

Page and profile changes are generally compared using enquiries in the 30 days before and 30 days after the recorded day, excluding the change day. For profile edits, the comparison uses website-wide enquiries. It cannot isolate enquiries caused specifically by changed profile hours or a new category. A comparison that lacks enough held history can remain too early or be absent. The implementation checks history boundaries, but does not prove that every intervening daily row exists.

## Interpret results without overstating them

For change comparisons, grew and held use relative thresholds in the saved counting rule. Growth starts at 120% of the before figure; held starts at 80%; lower values are lost. This is distinct from the right or wrong judgement applied to a finding's predicted direction. Neither label removes uncertainty about attribution, seasonality, tracking changes, or missing data.

There is an edge case in the current growth rule: zero before and zero after satisfies the growth threshold. A grew label beside zeros must not be presented as evidence of improvement. Keep the actual values with the label when reporting results. This limitation requires a separate implementation decision; documentation maintenance does not change the counting rule.

The latest 200 company change records are read before the selected website is applied. A busy company's other websites can therefore occupy the available window and leave few changes visible for one selected website. An empty filtered list does not prove that the website has never changed. Stored change cleanup is also bounded and happens during later saving work rather than guaranteeing removal at the precise two-year anniversary.

## Approved fixes and tagged campaign traffic

Approved local, reviews, and links drafts created within the last year can join the change list. Their displayed day is the decision day, falling back to creation time. Approval is not proof that someone copied, sent, or published the draft. Check the draft workflow before telling a client that an approved fix is live.

The figures use the saved 365-day Analytics campaign slot, matching campaign name and, when available, the tagged link's source. Enquiries follow the Analytics connection's configured counted events. They are not necessarily sales, unique customers, or paid revenue. Missing connections or campaign rows can produce zeros, so first establish whether measurement is connected and populated.

Several approved drafts can share campaign and source tags. The same campaign traffic may then appear against multiple drafts. Do not sum these entries into a unique total of visits or enquiries generated by all fixes. The screen labels an approved entry grew when it has enquiries, held when it has visits alone, and waiting otherwise. Those labels use a different rule from detected-change growth thresholds.

## Learnings, exports, and practical review

The learning note groups changes by kind. Your own totals come from the retained change rows used by this query. An across-Hakken aggregate is shown only after at least five companies have contributed to that kind. The response exposes aggregate company and outcome counts, not the other companies' names or page histories. Despite language about companies like yours, this is not a matched industry, size, or market cohort.

Across-company counts are accumulated separately from your visible history and can outlast individual change rows. Later corrections to a definite result do not necessarily reverse the original aggregate contribution. Use these totals as context for asking better questions, not as a controlled estimate of expected return.

Download controls export the filtered returned lists rather than just the visible page. The findings and changes downloads have different columns. Neither is a complete historical archive beyond the backend limits. Keep the selected scope, download date, and relevant source figures with any exported analysis. For a suspicious result, check the finding's note, the website's measurement connection, the original change or draft, and the underlying [measurement and enquiries](./insights-measurement-and-enquiries.md) guide before deciding what to do next.
