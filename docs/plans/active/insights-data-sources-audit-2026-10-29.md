# Insights data sources: the vision and an audit — 29 October 2026

**A dated record. Read-only audit; nothing was changed in code. Any fix needs Anthony's go.**

## The vision (Anthony, 29 October 2026)

> Insights is supposed to use all the data we've already downloaded. And if anything is missing from the data, they go back
> into the relevant section.

Insights draws on five sections, and only on what they have already downloaded:

1. **Visibility**
2. **Search Console**
3. **Bing Webmaster**
4. **Google Analytics**
5. **Microsoft Clarity**

Insights never fetches anything itself. When something it needs is missing, the relevant section's collector gets it,
on that section's own schedule and limits. The same rule is in `AGENTS.md`, under Product Context.

## How this audit was done

Every Insights code path was traced: `convex/insight*.ts`, `convex/insights*.ts`, `convex/utils/insight*.ts`, everything
they call, the schedule that starts the run, and the screens under `src/app/(dashboard)/app/insights/`. The main findings
were checked by hand in the code. More Handles' run of the same morning (`kn71zxjxg1zz9xrsasa9v40vqx8h6xfq`) was stopped
at 11:04 at Anthony's request, before it finished, because it was asking for new data.

## What already matches

- **The screens never fetch.** They only read, apart from three plain saves: starting an experiment, marking a finding
  acted on, and marking a report read.
- **Visibility is read widely:** rankings, traffic, strength, backlinks, AI answers, link and content gaps, search
  volumes, and the site audit.
- **Search Console's and Analytics' stored lists are read** for most facts (`searchConsoleDays`, `searchConsolePeriods`,
  `googleAnalyticsPeriods`, `googleAnalyticsDays`).

## Where Insights departs from the vision

### 1. Insights fetches data itself

| # | What Insights fetches | Where in the code | When | The section that should own it |
| --- | --- | --- | --- | --- |
| 1 | Search Console history: pages by month (16 months), searches with their pages (90 days), day totals | `insightHistoryWork.ts:74, 88, 101` | Every run (66 asks on 29 October, 141 on the first run) | Search Console |
| 2 | Analytics history: landing pages and sources by month, events, sources, people a month, the journey to a conversion | `insightHistoryWork.ts:119–262` | Every run; events, sources, people a month and the journey are asked again in full each time | Google Analytics |
| 3 | Analytics people a month, asked live again | `insightsRun.ts:468–485` | Every run | Google Analytics |
| 4 | Analytics funnel: people who clicked out, then converted, over 365 days | `insightsRun.ts:513–532` | Every run | Google Analytics |
| 5 | Analytics pages and where their visitors came from, 90 days | `insightsRunAfter.ts:177–197` | Every run (page reviews) | Google Analytics |
| 6 | Weekly money-page checks: Google's URL inspection, PageSpeed, a read of each page, Firecrawl for pages drawn by scripts | `insightsRun.ts:183` → `moneyPageChecks.ts:111, 128, 136, 172` | Once a week, up to 12 pages | URL inspection: Search Console. PageSpeed and page reads: no section owns them yet |
| 7 | Each open finding's page, read again live | `insightFindingChecks.ts:65` | Every run | No section owns it yet |
| 8 | Every money page pinged to see whether it is down | `insightsRun.ts:90` → `insightsQuick.ts:64` | Daily, for every website, due or not | No section owns it yet |
| 9 | Search volumes and keyword difficulty bought for competing searches not held | `insightCompeting.ts:401–405` → `searchVolumes.ts:71–96, 268–293` | Every run with competing pages | Visibility: it goes through Visibility's queue, but Insights triggers it and sends it at once |
| 10 | Buyer-panel questions added to Visibility's AI-answer list, which Visibility then buys answers for | `insightsRunAfter.ts:162` → `insightsPanel.ts:88–115` | When the buyer panel is switched on | Visibility |

Items 1 to 5 are kept, or used, as Insights' own copies of figures:

- **Search Console day totals:** a full duplicate of `searchConsoleDays`, which already holds 16 months.
- **Analytics day totals, sources and events:** duplicates of `googleAnalyticsDays` and `googleAnalyticsHistory` (two
  years).
- **Analytics landing pages:** mostly duplicates `googleAnalyticsPageSeries` (two years). Splitting them by source is finer
  than that series keeps.
- **Analytics page referrers:** Analytics already keeps a `pageReferrer` list.
- **Search Console pages by month:** a partial duplicate. Search Console keeps page lists only from when it began
  collecting, and does not fill pages back.
- **Analytics people a month, the journey to a conversion and the 365-day funnel:** no equivalent in the Analytics section
  today.

The reliability work of 26–29 October (`insights-big-site-reliability-plan-2026-10-26.md`) made fetches 1 and 2 reliable
rather than moving them. That plan stays as a record. Its remaining steps wait until this is settled.

### 2. Sections Insights does not use

- **Bing Webmaster: not read at all.** No Insights file reads a Bing table, and Bing is missing from the Insights Sources
  screen.
- **Microsoft Clarity: barely used.** Only its daily figures are read: once to compare Clarity's visits with Analytics'
  in "Why they moved", and once in the Conversion specialist's page reviews. Clarity is not among the facts the
  specialists are given (`insightsReading.ts:680–698`).

### 3. Data from outside the five sections

- **The money-page checks** (item 6): PageSpeed, URL inspection, page reads and Firecrawl.
- **Live page reads** (items 7 and 8).
- **Business Profiles** (local listings) are read for facts and drafts (`insightsReading.ts:412–419, 966–975`,
  `insightsDrafts.ts:70–135`). They count as one of the five only if Business Profiles belong under Visibility.

Configuration that Insights reads is fine: page classifications, the shop flag, counted conversions, the website's own
settings, and the team's schedule and instructions.

### 4. When data is missing, Insights does not go back to the section

- **It skips quietly:** a source that isn't connected, or a period that isn't wholly held, gives no facts. Refused
  Analytics asks return nothing. Clarity's comparison waits for 7 shared days.
- **It fetches the gap itself:** items 1 to 8.
- **It asks a section to collect only for Visibility:** items 9 and 10.
- **It never asks Search Console, Analytics, Clarity or Bing to collect.**
- **The screens:** only Sources links to the section to fix. Every other Insights screen shows a plain empty state, with
  at most a sentence naming the source and no link.

## Decisions for Anthony before a plan

The plan that answers this audit, recorded but not approved to build, is
[insights-sections-only-plan-2026-10-29.md](insights-sections-only-plan-2026-10-29.md).

1. **PageSpeed, page reads and "is the page down" have no owning section.** Do they belong to Visibility's site audit,
   or to another section?
2. **Google's URL inspection** uses the Search Console sign-in. Should it be collected by the Search Console section?
3. **People a month, the journey to a conversion and the 365-day funnel** exist only as Insights' own fetches. Should the
   Analytics section start collecting them?
4. **Business Profiles:** do they count under Visibility?
5. **Bing and Clarity:** what should Insights draw from each?
