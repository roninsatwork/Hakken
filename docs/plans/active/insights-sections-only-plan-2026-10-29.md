# Insights from the sections only — plan, 29 October 2026

**Recorded, not approved to build.** Anthony, 29 October 2026: "we won't execute on the plan, this is something to
commit only." Nothing here is to be built until he says go, and the decisions in §3 are his.

The vision this plan serves, and the audit it answers, are in
[insights-data-sources-audit-2026-10-29.md](insights-data-sources-audit-2026-10-29.md). In short, Insights draws only on
what five sections have already downloaded: Visibility, Search Console, Bing Webmaster, Google Analytics and Microsoft
Clarity. When something is missing, it goes back to the section whose collector gets it. Insights never fetches.

## 1. The outcome

- **An Insights run asks nothing outside Hakken's database.** It makes no Google asks, no page reads, no PageSpeed asks and
  no purchases. AI model calls stay: they are the analysis, not data.
- **Every figure Insights uses is a section's stored figure.** Insights keeps no copies of its own: `insightHistory` and
  the fetching half of `moneyPageChecks` go.
- **All five sections feed it.** Bing and Clarity join the specialists' facts.
- **A gap goes back to its section.** Insights records what it is missing. That section's collector gets it on its own
  schedule, within its own limits and Google's quotas. The Insights screen says what is waiting and links to the section.
- **A guard holds the rule.** A drift test fails any Insights file that reaches a fetching function, so no later change
  brings a fetch back.

## 2. Where each fetch goes

The numbers are the audit's rows.

| # | Fetched by Insights today | Becomes |
| --- | --- | --- |
| 1 | Search Console history | Insights reads the Search Console section's data. Day totals are already held in `searchConsoleDays` for 16 months; searches with their pages are held in `searchConsolePeriods`. Pages by month for 16 months are held only from when collecting began, so the Search Console section fills its page lists back, paced like its first collection. |
| 2 | Analytics history | Insights reads `googleAnalyticsDays`, `googleAnalyticsHistory` and `googleAnalyticsPageSeries`. Where Insights needs a finer split than the section keeps (landing pages by source, not only by channel), the section adds that list, under `ga-stored-figures-plan.md`'s rules. |
| 3 | Analytics people a month | A list the Analytics section collects in its nightly run. |
| 4 | Analytics 365-day funnel | A list the Analytics section collects in its nightly run. |
| 5 | Analytics pages and where their visitors came from | Read from the Analytics section's `pageReferrer` list, which already exists. |
| 6 | Weekly money-page checks | Google's URL inspection moves to the Search Console section, like Bing's own weekly money-page checks (`bingPageChecks`). PageSpeed and page reads go to the section §3 decides. |
| 7 | Open findings' pages read again | Read from wherever §3 puts page reads, at that section's pace. |
| 8 | Daily "is the page down" pings | Done by the section §3 decides, or dropped. |
| 9 | Search volumes and difficulty bought at once | Insights adds them to Visibility's wanted list. Visibility's collector buys them on Visibility's own schedule, never sent the moment Insights asks. |
| 10 | Buyer-panel questions | Already go through Visibility's list. They stay, with Visibility's schedule and limits deciding when answers are bought. |

New for Bing and Clarity:

- **Bing Webmaster:** the specialists get Bing's search figures beside Google's, from `bingDays`, `bingPeriods` and
  `bingPageChecks`. Bing joins the Insights Sources screen.
- **Microsoft Clarity:** the specialists get each money page's behaviour from `clarityFigures` (frustration signals,
  scrolling, quick backs). Clarity stops being only a visits comparison.

## 3. Decisions for Anthony

Each has a recommendation; none is decided.

1. **Who owns PageSpeed, page reads and "is the page down".** Recommended: Visibility's Site audit, which already reads the
   website's pages (`siteCrawl.ts`).
2. **Google's URL inspection.** Recommended: the Search Console section, as Bing does its own.
3. **People a month, the journey to a conversion and the 365-day funnel.** Recommended: new stored lists in the Analytics
   section, collected overnight.
4. **Business Profiles** (local listings, read by Insights today). Recommended: count them under Visibility, where they
   are collected.
5. **What Insights draws from Bing and Clarity.** Recommended: as in §2 above.
6. **The empty screens.** Recommended: each empty Insights screen names the missing section and links to it, as the
   Sources screen already does. This is a screen change, so it is drawn first.

## 4. Phases

Each phase ends with a measured check. Screens keep showing the newest held results throughout.

1. **The sections collect what Insights needs.** This covers the Analytics lists (items 2 to 4), the Search Console page
   lists filled back (item 1), URL inspection (item 6), and page reads (items 6 to 8) in the section §3 picks. Before
   anything asks Google, each new list's cost is measured on one website, the allowance is read, and a fifth is kept in
   hand.
2. **Insights reads them.** Each fact moves from Insights' own copy to the section's stored data, compared side by side on
   More Handles: the same facts, or the difference explained.
3. **Gaps go back.** Missing data becomes a wanted note for its section, which its collector takes on its next run.
   Visibility's purchases wait for Visibility's schedule.
4. **Bing and Clarity join.** Their facts are added to the specialists' checklists and the Sources screen.
5. **Insights stops fetching.** This removes `insightHistoryWork.ts`'s Google asks, the live Analytics asks in
   `insightsRun.ts` and `insightsRunAfter.ts`, the page probes in `insightsQuick.ts` and `insightFindingChecks.ts`, and
   `moneyPageChecks`' fetching, along with the `insightHistory` table once nothing reads it. The drift test is added in
   the same change.
6. **Proof.** A whole run on More Handles and on a smaller client makes no outside asks. Google's request counts and the
   outbound page reads are counted during the run, and both must be zero. The section still refreshes completely.

## 5. What this changes in other plans

- **`insights-big-site-reliability-plan-2026-10-26.md`:**
  - Its Insights history step goes away in phase 5.
  - The cannibalisation fix of 29 October stays. It gives a group at the 200-search cap 4½ minutes, and asks no more than
    two such groups at once. That is analysis, not a fetch. It is deployed to the development backend but not committed
    or accepted.
  - The plan's live acceptance waits for this plan.
- **`ga-stored-figures-plan.md`:** its rules apply to every new Analytics list here. Screens never ask Google; shared
  lists are kept per device and country.
- **`search-console-plan.md`:** gains the page-list fill-back and URL inspection.
