# Search Console — Keyword cannibalisation, Way 3 (20 November 2026)

Anthony looked at Pages competing "in this way" and said "its called pages competing but leads with keywords". Then "this
page is about keyword cannibalisation and i dont see that here in the data". Then "i want it to be called keyword
cannibalisation", "i want the data to reflect this page intent too" and "draw it again if you have to". On the canvas
https://claude.ai/artifact/AVvbDU4BVXyKqXVuWrRaoB he asked of Way 3's keyword menu "is this scalable for a hundred pages",
then said "make the table do the selection and the dropdown in the graphs [show] the pages it competed against", and
finally "lets build it as i dont understand and need to see it working before we amend further". The boards are saved in
`docs/plans/assets/search-console-keyword-cannibalisation-way-3/` (`Today.dc.html`, `Way3.dc.html`, and the board's code
as `board.tsx.txt` with `prep.py.txt`, drawn from the app's own parts on More Handles' real figures).

## What was wrong with the page

It listed every keyword Google showed two of the website's pages for, even once: 8,717 for More Handles in October in the
United Kingdom, more than 9 in 10 with no click. It judged by clicks, counted the home page and searches for the website's
own name, and so never showed which pages compete. Insights' Keyword cannibalisation already had the right rule.

## The rule, now one for both (`convex/utils/cannibalisationRule.ts`)

- The home page is left out (`isHome`), and searches for the website's own name (the list's brand words).
- A keyword counts when two or more of its pages each took at least 1 in 10 of its impressions (`SPLIT_SHARE`,
  `splitsKeyword`, `splitPagesOf`).
- Insights' `competingGroups` uses the same `splitsKeyword`, and re-exports `SPLIT_SHARE`, `isHome` and `pathOfPage` from
  the new file, so the two never drift apart.

On dev for More Handles in October: 6,662 keywords two pages share, 3,120 pages competing out of 6,439 Google showed.

## What the screen shows, top to bottom

1. **Title and line.** "Keyword cannibalisation". "Keywords that Google shows two or more of your pages for. One strong
   page usually does better than two." The menu says the same, in English and Italian ("Cannibalizzazione delle parole
   chiave"). The address stays `/pages-competing`.
2. **Four boxes**: Keywords two pages share, Pages competing (out of every page Google showed), Times Google showed them,
   Clicks they got. "Your home page and searches for your name are left out" under the third.
3. **Which page Google showed for {keyword} each day** (the shared `DaysChart`). Its lines are the ticked keyword's pages,
   asked of Google when it is ticked (`searchConsoleKeywordPagesByDay`, one ask, the country and dates chosen, the home
   page left out, a page and its section links one). Menus: **Pages** (every page Google showed for it, opening on those
   that count by the rule) and **Show** (Impressions or Position). The hint says how many days Google swapped pages.
4. **The table**, lean: a tick, Keyword, Pages, Swaps, Shown, Clicks, Position, the most shown first. One keyword is
   ticked at a time and kept in the address (`?keyword=`); the table's first is drawn until another is ticked. A row opens
   the keyword's own screen.

The canvas's second box, "Neither page in Google's top 10", isn't built: the list keeps no position for each page
(keep-less-history 5.2), so it would need the pages' positions kept again. The box is Pages competing instead.

## Swaps

Each keyword's Swaps are the days Google showed a different page most than on the last day it showed the keyword (then
the most clicked, then A to Z; the home page never counts). They're counted in the nightly build as the kept days are read
(`PairStream.swapSpans`, `swapsOf`, `convex/searchConsoleKeptSums.ts`) and kept beside each of the keyword's pairs in the
competing list (`counts`). Only for a period every day of which is kept day by day: this week, last week, this month and
last month. The 3, 6 and 12 months, whose early days are kept by the week, show a dash, never a part-count. The table sorts
by Swaps on both read paths (`swaps` in `SORT_KEYS` and the column table). The chart's own count, in its hint, comes from
Google's answer for the dates, so it is there for every period.

## The eye (What Hakken sees) — wired on "Yes, wire them"

Its own rules (`convex/utils/sees/own/searchConsoleCannibalisation.ts`, `general: false`), over the list's own figures
(`Summary.cannibalisation`, `cannibalisationOf` in `convex/utils/searchConsoleViews.ts`, on both read paths, its keywords
named):

- the keywords two pages share, of every keyword Google showed (the headline);
- the pages competing, of every page Google showed;
- the busiest keyword's top page's share of its impressions, against its next page's;
- among the 20 most shown, the closest split, and the keyword most pages compete for (`CLOSEST_AMONG`);
- for a month or less, among the 50 most shown, the keyword Google swapped pages for most, against the average
  (`SWAPPED_AMONG`), and how many keywords it swapped at all.

New measures: `cannibalisedKeywords`, `keywordsShown`, `impressionSharePercent`, `swaps`. The page hands the eye slim
figures (`cannibalisationSeesData`), its words, and the named keywords' own screens as links. The screen entry has the
boxes, the chart and the table as parts, and never-says: which page should own a keyword (Insights' to say), the home page
and brand searches, Swaps past a month, the words showings and place. The fixed lines say impressions ("Google shares the
impressions between them"). Held on every period this week to the last 12 months on
`src/test/fixtures/moreHandlesSearchConsoleCannibalisation.json` (read on dev, no asks of Google): four to six findings
each, the headline first, the swaps only where counted.

## Ask Hakken

`screen: "competing"` (`SEARCH_CONSOLE_SCREENS`, `assistantSearchConsoleReads`, the tool's description): the keywords
shared of every keyword shown, the pages competing, the busiest, the closest split, the one with most pages, the most
swapped and how many were swapped, and the rows with each one's pages and Swaps, with the rule said as the screen says it.
On dev for October: 6,662 of 31,538, 3,120 of 6,439 pages, the most swapped "heritage brass handles" (18).

## Built — 20 November 2026, on "lets build it"

On dev, not committed. Rebuilt More Handles' short periods on dev once by hand (`refreshSitePeriods`, the nightly job) so
Swaps show; October's most swapped is "product" (23), then "heritage brass door handles" (22). Checked in Anthony's Chrome:
the boxes, the chart for "handles" (Pages: 3 of 15), ticking "tubular latch" redraws it and puts it in the address, and the
Swaps column.

Tests: the rule on the views and the column paths (`searchConsoleViews.test.ts`, `searchConsoleReads.test.ts`), the swap
count (`searchConsoleKeptSums.test.ts`), the day ask (`searchConsoleCannibalisation.test.ts`), the screen
(`searchConsoleCannibalisation.test.tsx`), and the approved look moved here (`look/Competing.txt`). Guards, lint, types and
every drift test pass.

**The real press, on Anthony's "Yes, press it"** (Last month, the United Kingdom): two model calls, 34 seconds, $0.072.
The first draft went back once (two sentences over 20 words). Four sentences and four steps, every figure right: 21.1% of
the keywords Google showed; 3,120 pages competing, 48.5% of those it showed; "handle" tied at 16.7% and 16.7%; "handles"
3,355 impressions. The checker left off a sentence on "heritage brass handles" (18 swaps against 3), which typed the 3
rather than naming it. Two faults, fixed after without pressing again:
- "handles had 3,355 impressions split across its competing pages", when that is every impression Google counted for the
  keyword, the home page's too. The screen entry now says so.
- The steps for the keywords it named linked to a keyword's own screen, which shows no swaps. They now open this page with
  the keyword ticked (`?keyword=`), its pages drawn day by day.
Because the screen entry changed, the next open of the panel writes again (about 6p).

**Not done:** the "Neither page in Google's top 10" box; the full gate; nothing committed.

## Change log

- **2026-11-20** — Renamed Keyword cannibalisation; redrawn keyword first on Insights' rule; Way 3 with the table doing the
  picking and a Pages menu in the chart; built on dev (above).
- **2026-11-20** — Pressed once ($0.072, every figure right), two faults fixed after (above).
- **2026-11-20** — The eye and Ask Hakken wired, on "Yes, wire them" (above). Four tests that used this page as the eye's
  general-rules example now use Real against estimated, which still has none of its own.
