---
product: Hakken
documentation_type: Operator runbook
feature_area: Reading room readership analytics
audience: operator
source_repository: roninsatwork/Hakken
source_path: docs/operator/reading-room-readership-analytics.md
last_reviewed: '2026-10-26T14:12:50+00:00'
reviewed_against: current implementation
status: Current
---
# Reading Room Readership Analytics

> **Product:** Hakken · **Document type:** Operator runbook · **Feature area:** Reading room readership analytics
> **Reviewed:** 26 October 2026, 14:12:50 GMT (Europe/London)
> **Source path:** `docs/operator/reading-room-readership-analytics.md` · **Status:** Current

Use Admin → Content → Analytics (`/admin/content/analytics`) to review how clients engage with reading-room content. This is a super-admin operator surface. Company administrators do not receive cross-company readership access. The technical counting contract is in [the developer guide](../developer/reading-room-readership-analytics.md); the customer workflow is in [Reading room](../end-user/reading-room.md).

## Review a period

Choose 7, 30, 90, or 365 days. The window includes today and uses UTC days. The comparison period is the same number of days immediately before it. Overview shows activity figures and top articles, followed people, companies, and readers. The top article list prioritizes reads, whereas the article table initially sorts by views; a difference in ordering is expected.

Views count opens, reads count the client's 30-second/end-of-article signal, and clicks count opening originals or a person's channel. In answers means Ask Hakken drew on an article; it does not mean someone read it. Super-admin activity is intentionally excluded, so testing the reading room as a super-admin should not increase client readership.

Use Articles to narrow by source, placement in Knowledge or News, and topic. Sorting happens across the returned filtered population. Open an article for its period figures and company readership. A Download CSV action exports the constructed filtered list, which can be larger than the visible page but remains subject to backend population limits. Keep filters and period dates alongside any exported report.

Use People for followed publishers and their engagement. The collected-article count is accumulated on the follow record; it is not the count collected during the selected date range. Use Companies for client engagement, then open a company to see readers and their most-read topics. These screens can identify individual readers, including a name or email fallback; keep exports within the access intended for platform operations.

## Interpret limits before drawing conclusions

Active lists are bounded at 900 entries per population. The followed-person catalog and company detail user reads have 500-row bounds. A total in a list is the total of the constructed list, not a guarantee that all platform activity fits inside the cap. Overall counters can consequently exceed the counts reconstructed from visible companies or articles.

An unfiltered article chart uses overall daily totals. Narrowed charts sum item histories with a 6,000-day-row budget, prioritizing the most viewed items. If the chart reports truncation, treat it as partial. Do not reconcile it to an uncapped historical total. Daily reader counts also cannot be added to produce period-unique readers: a returning reader appears on several days.

Keeping a news story as a knowledge article redirects future reading signals to the retained article. Earlier story counters are not automatically merged. Titles and placement can reflect the latest interaction metadata. Missing or renamed content is therefore a reason to inspect the underlying record, not to delete analytics rows manually.

## Investigate an unexpected result

First compare identical UTC periods and filters. Check whether the subject was a company reader or an excluded super-admin. Distinguish a human open/read/click from an answer-use event. Confirm whether the content changed identity when retained from News. Check population limits and any chart truncation message before suspecting lost events.

Repeated accepted recording calls can add repeated events; the backend does not accept a deduplication token. Do not replay historical interactions as a troubleshooting shortcut. These screens are observational and do not trigger provider collection, a raw-event rebuild, or historical backfill. A separate approved implementation investigation is needed if counting or repair behavior must change.

Raw events have a 90-day cleanup policy, while daily totals are retained permanently and activity rows have their own record lifetime. The analytics history is therefore not wholly erased when old raw events expire. Use the platform's [retention guide](../developer/data-retention-and-purges.md) when investigating deletion requests. This runbook records local implementation; it does not certify live deployment, external cutover, or completeness of historical production signals.
