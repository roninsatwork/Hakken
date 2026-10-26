---
product: Hakken
documentation_type: End-user guide
feature_area: Insights leaderboards
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/insights-leaderboards.md
last_reviewed: '2026-10-26T12:22:39+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Leaderboards

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Insights leaderboards
> **Reviewed:** 26 October 2026, 12:22:39 GMT (Europe/London)
> **Source path:** `docs/end-user/insights-leaderboards.md` · **Status:** Current

Insights leaderboards compare a website and its watched group using retained search, AI, link and review evidence. They help a team see relative positions and gaps on specific measures. They are not a ranking of every Hakken customer, a complete market census or a financial performance league.

Open Insights and choose Leaderboards at `/app/insights/leaderboards`. A detailed league opens at `/app/insights/leaderboards/[league]`. Use the website selector to choose the intended company holding. Without a selection, the default is the company's first owned site; a permitted explicitly selected holding can have its own applicable group context.

## Start With The Group And Date

The query resolves the active company's holding and its applicable rivals, then derives leagues from saved market facts. It does not fetch every competing business in the country or use other companies' private tracking choices to enlarge the group. A change in your selected rival group can change places without a business changing its own performance.

Different leagues can include different rows because evidence is available for some websites and missing for others. A league needs at least two qualifying rows to appear. A missing league therefore does not establish a shared zero or that the underlying capability was removed.

The general as-of label is derived from available current SEO facts for the open host. It is not a guarantee every AI, review or rival value was observed on that same date. Some values are latest snapshots, others monthly totals or selected answer windows. Check the corresponding source report before comparing unlike periods.

The section's general month/quarter selector is not an input to the leaderboard query. These leagues use their implemented current and historic evidence windows. Selecting an interval elsewhere does not rewrite each league into a fresh ranking for that interval.

## The Main Four Leagues

Strength uses a retained supplier domain-strength score, expressed on the source's scale. It is an external search indicator rather than a Google certification, a site's value or a count of customers. A higher score does not prove the website converts effectively.

Organic traffic uses estimated monthly Google visitors from retained market evidence. It is not the rival's authenticated Analytics traffic or exact measured sales. Compare estimates with estimates, and use your own connected analytics separately when you need measured business activity.

AI mindshare uses stored Brand Radar mention totals for the website's country and group. The headline total and retained question examples have different sampling scopes. Its share is the website's portion of the values in the displayed league, not every AI answer on the internet.

Share of voice uses retained counts of searches where the website is in Google's top three. Its share is that count divided by the league's summed counts. It does not mean a share of actual revenue, all search impressions or unique people. The same search can contribute to several websites' counts if each occupies a top-three position.

## Links And AI Overview Citations

The links league uses retained referring-domain counts. One domain can link from many pages, and several domains can belong to one organization. Do not label the count as independent publishers or add it to backlink totals as if they were distinct quantities.

AI Overviews uses the source's stored count of searches where Google's overview cites the website. This is separate from the private tracked-search gap table and from the AI mindshare supplier total. Different source datasets can disagree in scale while each still reflects its own retained scope.

A missing row can reflect an absent relevant aggregate. It is not proof a business has no links or has never been cited. Open the appropriate underlying report before using an empty value to justify a major change.

## Recommended By AI And Pages Cited

Recommended by AI counts recommendation observations across the engines represented by the company's retained answer evidence. It does not substitute all name mentions when recommendations are unavailable. A website often named but rarely recommended can therefore place differently here than in a mention-focused league.

The recommendation evidence in this projection uses a recent thirty-day window with bounded daily reads. It is not a count of every model response ever generated for the business. Missing engines or unanswered private questions limit the evidence. The displayed number is not a probability a random future user will receive a recommendation.

Pages cited counts distinct retained source pages from the private-list summary. It is not every citation event and not the same as how often those pages were read or recommended. A business can have many repeated citations to one page but a small distinct-page count.

Available year-earlier citation context uses a bounded historic citation read and an evidence-presence condition. Do not infer unlimited historical completeness from a year comparison. The [AI Questions And Answers](./ai-questions-and-answers.md) and [AI Visibility Reports](./ai-visibility-reports.md) guides explain those underlying distinctions.

## Review Counts

The review league uses linked listing records and labels them by business/profile name, with own profiles marked as yours. Its values are stored public review counts, not average star ratings, new reviews in the selected period or the number of reviews Hakken has read in full.

The current fact-building loop does not separately restrict these linked records to Google, despite some surrounding wording referring to Business Profiles. Other linked review sources can consequently contribute. Check the underlying listing identity before presenting every row as a directly comparable Google-only count.

More than one own profile can appear, and the league's single headline own place uses the first own row found in ranked order. That is not an aggregate rank for every office combined. Similar profile names also deserve identity review before comparing or sharing a shortened label.

## Places, Ties And Gaps

Rows are ordered by descending current value. Equal values receive sequential places rather than a shared tied rank, with the own row favored in the current-value ordering. A place difference between equal values should therefore not be described as a meaningful performance gap.

Gap above is the difference in the underlying value between your row and the row immediately above. It is not a prediction of the time, money or exact work required to climb. If the values tie, the gap can be zero even when sequential places differ.

Your place can be missing when the league has qualifying competitors but no current figure for your site. A leading competitor figure does not automatically provide a measured zero for your missing evidence. Verify source readiness first.

A year-earlier place is only shown when every current row has a corresponding previous value. This avoids pretending a partial historic group had the same competitive ranking. Individual earlier values can exist without a complete place-change comparison.

## Explore One League

Open a card to inspect its detailed table, leading value, own value, place and gap. Text search matches the displayed row label; heading sorting can order place, name, value, move or gap across the supplied rows before paging. These controls do not mutate group membership or purchase more evidence.

The chart and headline retain their full league context while table search narrows the visible rows. A filtered table is therefore not a newly recomputed league with new positions. Keep original places and denominators when sharing the filtered examples.

The chart CSV contains the full supplied league's place, name and value. The table download follows its filtered/ordered rows and additional displayed fields. Those exports can legitimately contain different row sets. They are snapshots, not live source data or proof that every competitor source has accepted deployment.

## Interpret Changes Practically

Historical SEO comparisons seek a corresponding prior-year month for the latest source fact, within a bounded historical search window. Different websites' latest observations can be from different days or months. Lack of a usable baseline leaves the move unavailable rather than implying no movement.

Recommendation and review leagues do not supply the same year-movement fields as SEO leagues. A dash can reflect unsupported comparison rather than a perfectly stable business. Shares are rounded to one decimal and may not add to exactly one hundred percent after display rounding.

Use a league to choose a concrete investigation: verify the website group, establish the source and window, inspect a meaningful gap and follow the supporting report. Avoid describing a position gain as a proven improvement in leads or sales. See [Brand Radar](./brand-radar.md), [Backlink Reports](./backlink-reports.md), [Review Intelligence](./review-intelligence.md) and the [developer guide](../developer/insights-leaderboards.md). Product intent and live integration acceptance remain separate from these local comparisons.
