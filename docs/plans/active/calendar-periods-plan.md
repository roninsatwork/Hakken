# Calendar periods in every date menu

Agreed with Anthony on 2026-10-20, point by point in conversation. Built on `dev`, not pushed: the rules (phase 1),
Sites (2), Clarity (3), Search Console (4), Bing (5), Google Analytics (6) and the Settings overview and Governance
(7), with rule 6's This-month fallback. Search Console's "no days yet" line
and Volatility's dated labels were found unbuilt after its first commit and finished in a second; its charts' 52 weeks
moved to the start-up fill (8), because raising the setting is what starts their download. Still to run: the start-up fill (8), the full
check (9) and the audit (10). Until the start-up fill runs,
a Search Console list for a period not yet built says it is being added up.

He asked: "i want to change the options in the data picker across the entire user frontend — This week, Last Week,
This Month, Last Month, This Quarter, Last Quarter, This Year, Custom Date Range." Custom was then removed ("Ok remove
it"), because every custom pick would be a fresh Google Analytics download that can't be planned for.

## What it is

Every date menu in the user frontend offers the same seven choices, in this order:

**This Week · Last Week · This Month · Last Month · This Quarter · Last Quarter · This Year**

There is no custom range anywhere, including Sites, which has one today ("yes agree"), so every menu matches.

Today there are six different menus:

| Section | Today | Where |
|---|---|---|
| Google Analytics | 7 / 30 / 90 days / 12 months, `?period=` | `analytics/_components/AnalyticsFilters.tsx`, `useAnalytics.ts:53` |
| Sites and Search Console (one shared menu) | 7 / 30 / 90 days / last year / last 2 years / custom, `?from&to&step&range` | `sites/_components/SiteDateRange.tsx`, `siteRange.ts:10` |
| Bing Webmaster | last week / 30 / 90 days / 6 months / last year, `?period=` | `bing-webmaster/[siteId]/layout.tsx:91`, `useBing.ts:42` |
| Clarity | 7 / 30 / 90 days, `?days=` | `clarity/[siteId]/layout.tsx:61`, `useClarity.ts:24` |
| Settings overview | Today … 365 days + custom, React state | `app/settings/page.tsx:137` (`TimeframeDropdown`) |
| Governance | evidence pack 7/30/90/365; activity 7/30/90 | `ui/components/governance/EvidencePackPanel.tsx`, `GovernanceActivity.tsx` |

They become one: the kit `Select` (no new part), one list of periods, one URL key `period`
(`this-week`, `last-week`, `this-month`, `last-month`, `this-quarter`, `last-quarter`, `this-year`), carried between
sections as the shared keys are now (`useSiteParam.ts:29`). The words are in `messages/en.json` and `it.json`.

## The rules (agreed 1–10, "1-10 i a gree")

1. **Weeks run Monday to Sunday, in UK time.** Months and quarters are calendar ones. Google Analytics keeps each
   website's own time zone for its days, as now.
2. **A "This" period runs from its first day to the source's newest day**: yesterday for Google Analytics, Google's
   newest day for Search Console (about three days back), Bing's newest day (totals) or newest week (keywords and
   pages), Clarity's newest day, and today for Sites.
3. **A "Last" period is the whole period before.** Until the source has sent its last days (Search Console's
   last week, say, on a Tuesday) it says so: "Last Week, to Saturday 17 October: Google's newest day".
4. **What a period is compared with.** A finished period is compared with the whole period before (Last Month against
   the month before). A running one is compared with the same days of the period before: This Month on 20 October
   (1–19 October) against 1–19 September, never against all of September. The same dates in the period before, cut off
   at its end (This Month on 31 October against 1–30 September); a week, the same weekdays.
5. **The same period a year before** only on the quarters and This Year, as only 90 days and 12 months have it today.
   For This Year it is the period before itself (the same days last year).
6. **Screens open on Last Month**: whole, final, comparable, and Insights' choice too. A website holding nothing for last
   month yet — one added, or a Clarity connected, this month — opens on This Month instead, so its screens never open
   empty; from the 1st it opens on Last Month like every other (Anthony, 2026-10-20: "Ok agree").
7. **The section front pages** (the Google Analytics, Search Console, Bing and Clarity lists, today fixed at 30 or 90
   days) show the opening period, Last Month, so their numbers match the screens behind them.
8. **The step (Daily / Weekly / Monthly) follows the period**: days for weeks and months, weeks for quarters, months
   for the year. It can still be changed.
9. **A running period with no days yet** (This Week on a Monday for Search Console, Bing or Clarity; This Month on the
   1st for Google Analytics) shows one plain line instead of an empty chart: "Google hasn't sent any of this week's
   days yet; its newest is Saturday 17 October."
10. **Things that need a whole year** keep a fixed "last 12 months", added up from the weeks and months already held,
    with no download: a channel's worth (Channels), "What people did before converting" (Conversions), the two tracking
    checks "an enquiry not counted" and "a conversion that never happens", and Insights' yearly figures. The
    before-converting steps are still fetched weekly, as now, because people moving through steps can't be added up.
11. **The tracking health checks keep watching the latest days**, added up from the days already held, with no
    download, so a break on 5 November shows within the week, not on 1 December.

## Fixed windows that aren't menus (item 11, agreed one by one)

- **Sites shows the menu only where it does something** ("ok i agree i get it now"). Of its 72 screens:
  - the 18 that use dates today keep following it;
  - **6 more follow it**: Reviews, Reviews against rivals, Mentions, Mentions against rivals, Local activity, and a
    rival's own screen (each today has its own 30 days or 12 months: `siteReviews.ts:48,104`,
    `siteWebMentions.ts:118-136`, `siteLocalMarket.ts:132`, `competitors/rival/page.tsx:95`);
  - **about 46 show the latest check only** (backlink lists, anchors, competitors' lists and map, Google's results,
    questions and features, keyword structure and pages, paid keywords, audit problems, local listings, maps, market
    and offices, Your pages, the AI lists, assets): the menu is hidden; the header's "Last checked …" already dates
    them;
  - **Brand radar and AI demand** come only in months: the menu is hidden and they say "Monthly figures, the last 12
    months".
  The menu is drawn once in `sites/[siteId]/layout.tsx:103`; it shows only on the screens above.
- **The "Years" tab** on a website's overview becomes this year against last year, January to December, months still to
  come left blank, whatever the menu says ("yes"). `sites/[siteId]/page.tsx:189-218`. Most websites were added in
  September or October 2026, so last year's line stays empty until history builds; buying DataForSEO's past history
  would fill it, at a cost, and is not in this plan.
- **Rivals' moves** (Competitors) follow the menu ("Agree"). Rivals are checked once a month, so a week between two
  checks shows one line: "Rivals are checked once a month; their newest check was 2 October." Visits: the rival's
  estimate at the end of the period against the end of the period before. `convex/siteRivalMoves.ts`.
- **Volatility** (Search Console): the top figures and the table keep the newest days, labelled with their dates
  ("Last 7 days, to Saturday 17 October"); its chart follows the menu ("i agree to all of these").
- **Google updates** keep their own windows: each update's days before it began against the same after it finished.
  The menu chooses which updates are listed, as now.
- **Clarity recordings** always list everything Clarity still holds — Microsoft keeps a recording 30 days — with the
  menu hidden on that screen.
- **Search Console's charts reach 52 weeks** for every website, not 16 (`consoleChartWeeks`, `fanOutLimits.ts:151`),
  so This Year is drawn whole. The older weeks are fetched once, in the start-up fill. The year-before line shows only
  where Google still holds the weeks (16 months).

Left as they are: Insights' own menu (whole months, quarters, last 12 months), Usage's month menu, sign-in diagnostics
(a log for troubleshooting, where "the last 24 hours" matters), every admin screen, Keyword research's 28 days, and the
"Clarity keeps a recording 30 days" kind of sentence that describes a fixed fact.

## What each section needs

### Sites (DataForSEO)

Front end only: the backend already takes `from`/`to`/`step` (`siteFigures.ts:192`) and nothing is prepared per
period. `siteRange.ts` turns the period into dates; the preset-detection (`siteRange.ts:83-86`) and Custom go. What
Hakken buys from DataForSEO is unchanged. On weekly collection Last Week has one point and This Week none or one —
true, so shown as it is.

### Search Console

- **Totals and charts** read `searchConsoleDays` (16 months) and `searchConsoleWeeks`: any calendar period works.
- **Lists** today are prepared only for 7 / 30 / 90 / 365 days ending on Google's newest day
  (`searchConsolePeriods`, `SEARCH_CONSOLE_PERIODS` in `searchConsoleSchema.ts:125`, `periodOf` in
  `searchConsoleLists.ts:215`); any other dates ask Google live. They are prepared for the seven periods instead:
  - This Week, Last Week, This Month and This Quarter (to day 60) are added up from the 60 days of daily lines held
    (`DAYS_KEPT`, `utils/searchConsolePacks.ts:358`), as 7 and 30 days are now — no download;
  - Last Month's month before, Last Quarter, the quarter before, This Quarter past day 60, This Year and the year-before
    spans are asked of Google in 7-day pieces, as 90 days and a year are now (`searchConsoleLongLists.ts`);
  - a finished period is fetched once it ends, again when its last three days settle, then kept;
  - This Quarter and This Year are rebuilt weekly, the others nightly.
- **What reads the old periods moves**: Demand by service (`searchConsoleDemand.ts:39`), the keep rule (judged on the
  two newest quarters together rather than 90 days, so a keyword with a click in either is kept,
  `searchConsoleKeep.ts`), New and lost's figures (follow the menu), Your pages and `holdPages.ts` (shown in this quarter
  or last), Bing's Google column (the same calendar period as Bing's), Insights' reads (Last Quarter), the assistant
  (`assistantReads.ts:206`), `fanOutPositions.ts` (keeps its own 14 / 28 days), the catch-up and settling checks.

### Google Analytics — the largest part

Every list on a Google Analytics screen is Google's own answer for a period, asked each night or week and stored
(`googleAnalyticsPeriods`, keyed `list|period|which|device|country`; `periodRange` in `googleAnalyticsJobs.ts:48`).
People can't be added up across days, so a calendar period needs its own answer. The screens send only the period
(`analyticsPeriodValidator`, `googleAnalyticsSchema.ts:227`, in about 20 queries) and read the stored dates.

- **Collected instead of 7 / 30 / 90 / 365:**

  | Period | With | Fetched |
  |---|---|---|
  | This Week, This Month | the same days before | nightly |
  | This Quarter | the same days before, and a year before | weekly |
  | This Year | the same days last year | weekly |
  | Last Week, Last Month | the period before | once it ends, again two days later as Google's figures settle, then kept |
  | Last Quarter | the quarter before, and a year before | the same |

  About the same downloads as today (today: 7 and 30 nightly, 90 and 365 weekly). Each website has its own Google
  allowance (14,000 tokens an hour for Hakken, 40,000 an hour in all, 200,000 a day), so websites don't compete.
- **Screens**: every read keyed by the period; the Conversions grey "before" line and the page's explorer shift by the
  period's own days, not `Number(period)` (`googleAnalyticsChartReads.ts:86-140`, `ConversionParts.tsx:280`,
  `explorerRule.ts:19-29`, `ChannelParts.tsx:157`, `googleAnalyticsPageConversions.ts:29`,
  `googleAnalyticsPageChannels.ts`); "a year before" on the quarters and This Year (today only 12 months).
- **Off the old answers**: the front page (`analyticsSites`, Last Month), the health checks (rule 11:
  `googleAnalyticsHealth.ts:302-358` from the days and pages held — `googleAnalyticsDays`,
  `googleAnalyticsPageSeries`, which keeps every page by day for 90 days), a channel's worth and before-converting
  (rule 10, `googleAnalyticsChannelReads.ts:730`, `googleAnalyticsConversionReads.ts:277`,
  `googleAnalyticsActionFunnels.ts`), Insights' reads (`insightsReading.ts:149`: 30 → Last Month, 90 → Last Quarter,
  365 → the last 12 months added up), Ask Hakken (`assistantAnalyticsReads.ts:180`, `toolConnectorDefinitions.ts:603`:
  the period names).
- The 90-day and 12-month lists today run up to six days behind the 30-day one (weekly). That goes.

### Google Analytics, as built (phase 6, 2026-10-21)

Where the build had to choose, and why:

- **Periods still going are asked every run, not weekly.** Every run has asked every list nightly since Anthony's
  14 October instruction ("I want everything once a day"), so This Quarter and This Year stay nightly. Finished periods
  (Last Week, Month, Quarter) are asked once they end, again two days later once Google's figures settle, then kept —
  recorded per home country on the connection (`periodsFetched`). Fewer asks than before.
- **Tracking health**: channels, events and totals over the latest 30, 90 and 365 days are added up from the days,
  weeks and months held (rule 11). Landing pages and pages are not held a day for every page at once (one record a
  page), so those two checks read Google's newest answer: This Month once it holds a week, else Last Month (the
  quarters for the pages check).
- **Whole-year figures** (rule 10) — a channel's worth, its "growing but falling now" year, the actions before
  converting — are added up from the months held. Ranking those actions adds each day's people: a busyness, not a
  count of people.
- **Insights' 12 months come from This Year, not 12 months added up** — a departure from this plan's wording, for
  Anthony's word. Insights' facts carry people, which can't be added up across days, so they read Google's own answer
  for the year so far, set against the same days last year. Its 30 and 90 days are Last Month and Last Quarter. Each
  fact keeps its real dates.
- **92 days kept**: a website already holding 90 counts as collected; the two more fill in over the next two nights,
  rather than every website fetching its days again.
- **A shop** is noted from this quarter's or last quarter's events; it stops being one only when a whole quarter ended
  without any of the four steps.

### Bing Webmaster

Bing's API takes no dates (`bingWebmasterApi.ts`). Site totals and crawling are daily (`bingDays`): any period. Keywords
and pages come a Bing week at a time (`bingWeeks`, 13 months): a month or quarter is made from the Bing weeks that end
inside it, and the screen says so. The prepared periods (`bingPeriods`, `bingPeriodValidator`,
`bingWebmasterSchema.ts:51`) become the seven; downloads don't change. Bing gives about six months at connection.

### Clarity

Clarity hands over its last three days each morning; history starts at connection (mid-October for most). The three
prepared periods (`PERIODS`, `clarity.ts:63`; `claritySpanValidator`) become the seven, built each morning from the days
held (180 days) and the months (13); downloads don't change. Insights' reads of 30 and 90 days
(`insightsConversion.ts:76`, `insightsPeriod.ts:275`) move to Last Month and Last Quarter. Last Quarter and This Year
are mostly empty until the days build up; the screen says from when it holds days.

### Smaller screens

- **Settings overview** (Hakken's own AI usage): the seven periods, read from `analyticsDailySnapshots` by day. Its
  `TimeframeDropdown` stays for the two admin screens that also use it.
- **Governance**: the evidence pack and the activity chart take the seven (`evidencePack.produce` already takes
  `from`/`to`; `getGovernanceActivity` gains `from`/`to` in place of its 90-day clamp). Shared with Admin → Governance,
  which changes too.

### Insights

Only how it reads the periods changes ("Ok im happy with that"); Insights is otherwise paused while the core data is
fixed. Its own menu stays. A sentence that names the window it reads ("the last 90 days") changes to match.

## Fitting the chart explorer work (another agent, 2026-10-20)

Checked on Anthony's ask ("the other agenet is buidlign new components and your plan will affect them, can you doubel
check"). Another session is building the configurable chart, locked in as a kit style the same day: `ChartExplorer`,
`ChartReadoutTable`, `TickSelect`, the rule `chartExplorerRule.ts` (screen-kit.md, "Configurable Charts"), the
"…, by channel" explorer (page-conversion-explorer-plan.md), and now "Visitors to this page"
(page-visitors-explorer-plan.md). Where this plan meets it:

1. **The kit's step rule names the old periods.** `stepFor` (`chartExplorerRule.ts`) gives months for "365", weeks for
   "90", days otherwise; `yearComparable` only "365". Both become the seven, by the same rule as every other chart
   (days for weeks and months, weeks for quarters, months for the year), and screen-kit.md's "Configurable Charts"
   changes with them. The idea — the step follows the dates — is the same.
2. **A year before can't be drawn week by week.** Google Analytics keeps weeks only a year back, then months, so a
   quarter a year ago has no weeks — the very reason the explorer allows a year before only for 12 months (its audit).
   So rule 5's "same period last year" for the quarters applies to figures and tables, which Google answers for any
   dates; on charts, a year before is drawn only for This Year, month by month.
3. **Last Month's month before needs 92 days, not 90.** On the last day of a month the month before last starts up to
   92 days back, past the 90 days Google Analytics keeps by day, so its first day would be read from a week. The days
   kept go from 90 to 92 (`ANALYTICS_DAYS_KEPT`, `utils/analyticsHistory.ts:15`) — the page records the explorer reads
   keep the same tiers, so they move too: about 2% more day rows.
4. **The "before" line's 7 and 30 days** (`DRAWN_BEFORE`, `ConversionParts.tsx:281`; `PERIODS_DRAWN_BEFORE`,
   `googleAnalyticsPageConversions.ts:30`) become "the periods whose span before is held at the chart's step", and the
   explorer's spans (`googleAnalyticsPageChannels.ts`: `span(days)`, `span(364)`) the period's own span before.
5. **"Visitors to this page" reads a page's own lists** (sources, first visit or back again, the page before and
   after), which are Google's ready-made answers per period (`pageListJobs`, `googleAnalyticsPageLists.ts:77`). They
   are collected for the seven like every other list, so the card needs no change of its own.
6. **The explorer has no step of its own; the page has a step menu.** The explorer follows the period, the page's
   other charts the step menu. With the step now following the period by default the two agree; when someone changes
   the step menu, the explorer follows it too, so one page draws one step.
7. **Files both touch.** The menu needs no change to `Select` (the explorer's `changed` chip stays as it is) and the
   Sites phase leaves `SiteCharts.tsx` alone (bars are gaining a readout there now). The explorer's words read
   `googleAnalytics.filters.periods.<period>`: the new periods keep that path, so its hint words follow on their own.
   All of 1–6 is in Phase 6, which starts only once the explorer work is committed.

Points 2, 3 and 6 agreed by Anthony on 2026-10-20 ("i agree with you"). No note is sent to the other session: "they
are almost finished".

## Filled at the start, so nothing opens empty

("We need to pul lthi sdone at teh start though so the charts dont look empty".)

- **On switch-over day, for every connected website**, every period and its comparisons are fetched at once —
  including the finished ones — not left for the next nightly or weekly run.
- **On each new connection**, the first collection fetches the seven periods, not 90 days.
- Spread over a few hours within each website's own allowance, a fifth kept in hand, the opening period first. Each
  section gets the new menu only once its data is in. Until then its screens show the "Collecting now" note.
- What a fill can't reach: Clarity's past (three days at a time), Bing beyond six months, Sites before a website was
  added, Search Console beyond 16 months.

## The old answers

The old 7 / 30 / 90 / 365-day answers stop being collected. The ones already saved stay until Anthony has looked at
the new screens, then go on his word. So the validators are widened first (old and new values together) and narrowed
only when the old rows are gone — Convex refuses a schema that existing rows break.

## Phases

| # | Phase | Days |
|---|---|---|
| 0 | Measure: read each website's saved Google allowance (`quotaSeen`; no asks); read each item marked "moves" above | ½ |
| 1 | One period list and its rules (rules 1–9), the kit `Select` menu, the `period` key, English and Italian; a drift test that every user-frontend date menu uses the one list | 2 |
| 2 | Sites: the 18 screens, the 6 that join, the menu hidden elsewhere, Years tab, rivals' moves | 3½–4 |
| 3 | Clarity | 1–1½ |
| 4 | Search Console: lists for the seven, what reads the old ones, charts to 52 weeks, Volatility's labels, the "no days yet" line | 5–6 |
| 5 | Bing (after Search Console, whose periods its Google column reads) | 1½–2 |
| 6 | Google Analytics: collection, comparisons, screens, front page, health checks, whole-year figures, Insights' reads, Ask Hakken | 6–8 |
| 7 | Settings overview, Governance | 1 |
| 8 | Switch-over: the start-up fill for every connected website, run on Anthony's go and watched; Search Console's charts raised to 52 weeks in the same go (`consoleChartWeeks`), since that fetches their older weeks | 1 |
| 9 | The full check and GitHub's own steps, fixes | 1½ |
| 10 | The audit Anthony asked for ("When your done with the plan can you perform a full audit and double check the data", 2026-10-20): every screen with a date menu, in every section, on every period, its figures and its comparison checked against the stored days and Google's own answers; Insights, Ask Hakken, the weekly report and the front pages read the same; faults fixed, and a written record of what was checked and found | 1½–2 |

**About 25–29 working days.** Up 2–3 if Phase 0 shows a large website's night won't fit its allowance.

### Phase 0, measured — 2026-10-20

What Google said was left of each website's allowance at the end of the night's run, which on 20 October also asked
the weekly 90-day and 12-month lists (`quotaSeen`, read from the dev database; nothing asked of Google):

| Website | Used of 200,000 a day | Used of Hakken's 14,000 that hour |
|---|---|---|
| More Handles (about 10,000 pages) | about 24,700 (12%) | about 7,200 (51%) |
| Kordatackle | about 11,900 (6%) | about 1,500 |
| NEC | about 9,100 (5%) | about 3,300 |
| Hurtwood House | about 6,300 (3%) | about 100 |
| ronins.co.uk | about 4,900 (2%) | about 2,200 |

The new collection asks about what a night asks now (This Week and This Month nightly, as 7 and 30 days; This Quarter
and This Year weekly, as 90 days and 12 months; the finished periods once). The start-up fill asks every period at
once — about 1.6 times a weekly night: about 40,000 tokens for More Handles, a fifth of its day, spread over three or
four hours by the hourly limit. Every website fits; no extra days are needed.

## Run without Anthony (overnight)

Agreed 2026-10-20 ("i agree to all of these"), for when he says go:

- **In this order**: Phase 0, 1, then Sites, Clarity, Bing, Search Console, Google Analytics, smaller screens. Google
  Analytics, the largest and riskiest, comes last.
- **No section is half-switched.** A section keeps its old menu until its new data is in; for a while the app has both.
- **Each finished section is committed to `dev`; nothing is pushed** until he says ("we commit and dont push").
- **An update after every phase** ("i want regular updates by phase too"): what the phase built, what it found,
  % complete overall and for the phase, days left, and whether he needs to do anything.
- **Google**: measuring reads saved figures only; the start-up fill asks Google within each website's own allowance,
  a fifth kept in hand, spread over hours; a website running short is stopped and named in the morning note.
- **Tests**: the ones a change touches as it goes; the full check and GitHub's steps once at the end, in a copy so his
  dev server on :3000 keeps running.
- **Only this build's own work is committed** ("as part of teh plan yu coomit your work but dotn push"). The "…, by
  channel" explorer and Visits per conversion chart belong to another agent and stay uncommitted by this build. Where
  a file holds both (`messages/en.json`, `it.json`, `Select.tsx`, `SiteCharts.tsx`), only this build's lines are
  staged, and each commit's diff is read before it is made. Edits are made in place, never by rewriting a whole file.
- **Google Analytics waits for the other agent.** Its chart files (`AnalyticsChart.tsx`, `ConversionParts.tsx`,
  `googleAnalyticsChartReads.ts`, `googleAnalyticsPageConversions.ts`, `explorerRule.ts` …) are being worked on by
  another agent, and two writers in one file overwrite each other. Phase 6 starts only once that work is committed;
  if it isn't, the build stops before Phase 6 and says so.
- **The morning note**: what's built, what's only planned, % complete, days left, anything that needs his eye.

## Tests that pin today's periods

`convex/clarity.test.ts` (periods), `search-console-history-drift.test.ts`, the Sites tests that build
`from=/to=/step=` addresses (`siteAuditFixes.test.tsx`, `siteRecordLinks.test.tsx`), the Google Analytics look tests
(`googleAnalyticsLook.test.tsx`, `googleAnalyticsSecondRoundLook.test.tsx`), `settings/page.test.tsx`,
`TimeframeDropdown.test.tsx`. Each changes with its section.
