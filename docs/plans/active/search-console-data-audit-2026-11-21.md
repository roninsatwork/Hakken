# Search Console: the data audit (21 November 2026)

Anthony, 21 November 2026: "I am happy with the UX and UI. What I am less confident about is the data displayed against
the various drop downs and what Hakken sees being correct. Are you able to audit this", then "Yes, Search Console".

This is what was checked, how, what is right and what is wrong. Nothing was changed. Every fix below waits for Anthony's
word.

## How it was checked

- **Against Google itself.** A temporary probe on the dev deployment asked Google's Search Console the same question
  each screen answers: the same dates, the same country (the United Kingdom, More Handles' home country), the same kind
  of result. About 120 small asks, spread over the morning, far inside Google's limits. The probe was removed straight
  after.
- **The screens' own reads**, called as Anthony on More Handles (the company he was viewing as), for all seven periods
  in the date menu: This week, Last week, This month, Last month, Last 3 months, Last 6 months and Last 12 months.
- **The dates written again from the agreed rules** (calendar-periods-plan.md), not from the app's code. On Saturday 21
  November, with Google's newest day Thursday 19 November, This week is 16 to 19 November against 9 to 12 November, and
  Last 3 months is 20 August to 19 November against 20 May to 19 August.
- **The eye's saved words** on 15 Search Console screens, written 18 to 20 November, with their numbers checked against
  Google.
- **A second website**: ronins.co.uk's October, saved against Google.
- Nothing was pressed and no screen was opened, so no eye was charged and no rebuild was started.

## What's right

These match Google exactly, to the click and the impression.

1. **Performance**, the boxes and the chart, on all seven periods, and the period each is compared with. The one gap is
   Thursday 19 November, Google's newest day: 186 clicks saved, 189 now. Google is still settling that day, and Hakken
   fetches the last four days again every night.
2. **Pages**, every period, over the days its table covers: 6,439 pages and 1,946 clicks in October, as Google has them.
3. **Demand by Classification**: its pages, clicks and times shown add up to Google's, every period.
4. **Countries, Devices and Rich results**: every row, every period checked.
5. **A page's own screen** and **a keyword's own screen**: both ask Google, and both match.
6. **Google updates**: the 14 days before and after each update, three updates checked.
7. **New and lost**: since the rebuild on 19 November, the new keywords sampled were first shown by Google on the day
   the screen says.
8. **The eye on Pages**: 1,946 clicks against 2,082 in September, the tubular latch guide's 87 against 101, and 430 of
   6,439 pages clicked, all as Google has them. Volatility's "shown 228,614 times, up 18.3%" is right too.
9. **Ronins**: October saved as 341 clicks and 279,239 times shown, the same as Google.
10. **Every read loads on every period.** 106 reads across the seven periods, none failed, none slow.

## What's wrong

### 1. A keyword's figures are added up from each page Google showed for it

This is the big one, and most of the others come from it.

Hakken keeps each keyword with each page it brought people to, and adds a keyword's figures up from those. When Google
shows several of the website's pages for one search, that one search is counted once for every page. Google's own
keyword figures count it once.

"more handles", October:

|            | Clicks | Shown | Position | Click rate |
|------------|--------|-------|----------|------------|
| Hakken     | 98     | 8,426 | 1.8      | 1.2%       |
| Google     | 96     | 1,109 | 1.16     | 8.7%       |

Google showed 52 of More Handles' pages for that search, so it counted 8,426 times. Across October's top 100 keywords,
Hakken says 17% more times shown than Google. Seven of them are at least twice Google's figure, 41 have a position a
place or more out, and 14 sit in a different band (top 3, 4 to 10, 11 to 20, 21+). Ronins has the same: "ronins" shows
960 times shown where Google says 273. Clicks come out nearly right.

You can see it in the app. The Keywords table says "more handles" was shown 8,426 times. Click it, and the keyword's own
screen asks Google and says 1,109.

The screens it reaches, each checked against Google:

- **Keywords** and **Tracked keywords**: times shown, click rate and position, as above.
- **Position bands**: every week of October counts about 8% fewer keywords in Google's top 3 than Google does, and more
  in 21st place and below. The week of 5 October: 1,312 in the top 3 against Google's 1,442.
- **Click rate by position**: at position 1 it says 2.45%. Google's own figure is 6.36%. The eye says "Position one won
  68 clicks from 2,777 impressions". Google has 261 clicks from 4,104.
- **Brand and non-brand**: the eye says brand searches get 21 clicks for every 1,000 times shown. Google's figure is 137.
- **Volatility**: on 18 November it says 20 keywords climbed five places or more and 4 fell, and the eye says "Positive
  gains dominate". Google's keyword positions say 3 climbed and 8 fell. When Google shows different pages from one day
  to the next, the averaged position jumps about, so the score moves more than the rankings did.
- **Shown but not clicked**: see 3 below.
- **Performance**: its top keywords and its bands card.
- **The eye** on every one of these, since it reads the same figures.

The plan chose this on purpose ("a search's own totals are added up from these, never kept apart") to keep storage
down. The fix is to keep each ready-made period's keyword list as Google gives it, by keyword, beside the pairs. That's
what Pages already does, and why Pages is exact. Pages competing and a page's keywords would still read the pairs,
which is right for them. That means one more ask of Google per period and kind of result, and one more stored list.
**Anthony's call.**

### 2. The tables run a day behind the boxes until someone opens the page

The boxes read Google's newest day, 19 November. The Keywords and Pages tables were last added up on 20 November at
16:12, so they end on 18 November. On This week the boxes count four days and the tables three.

This was agreed on 5 October: Search Console is fetched every night but its lists are added up weekly, after the
company's own collection, and when someone opens a page that's behind. The screen is meant to say so and start the
rebuild when opened. I couldn't check that in Anthony's Chrome, which wasn't connected.

### 3. Shown but not clicked compares pages with the keyword figures

Each page is set against "the click rate you usually get at its position", and that usual rate comes from the keyword
figures in 1. At position 1 the usual rate is 2.45%. Pages' own click rate at position 1 in October was 1.71%, and
Google's keyword rate was 6.36%. Which pages are listed, and by how much each is "short", depends on that number. The
page list itself is exact. **Anthony's call**: set pages against pages, or against Google's keyword rate once 1 is
fixed.

### 4. Pages competing leaves the home page out without saying

The rule leaves searches for the brand and the home page out. The shares on screen are shares of what's left. "handles"
in October shows 44% on the cupboard handles page and 27% on door handles. Google's own figures give the home page 88%
of its 3,355 times shown. The eye says "handles had 3,355 impressions split across its competing pages". (`/home` is
left out with the home page, as it should be: `isHome` in `cannibalisationRule.ts`. An earlier draft of this record
said otherwise.)

### 5. The Indexing chart's rise is the checks catching up

Pages not in Google went from 4 on 18 November to 17, then 195. Pages in Google went from 352 to 718, then 2,082, over
the same days. That's because so far only 2,277 of the 14,563 pages known have been checked. Google didn't drop anything.
The checks also stopped early on 19 and 20 November with a sign-in problem (`stopped: SIGN_IN` on the day's row).

### 6. Last 12 months is seven months on More Handles

Google holds no days for morehandles.co.uk from 11 August 2025 to 22 April 2026 (found on 21 October). Last 12 months
counts 211 days: 52,904 clicks. The question from that audit, whether the screen should say the year is part-held, is
still open.

### Smaller

- **Keywords lists the top 25,000** (31,538 keywords in October). The screen says "The table lists your top 25,000."
  That's right.
- **Video results** hold nothing past about three months. Google has 4 impressions in the last year.
- **Discover, Google News, News and Video** hold almost nothing for More Handles, so they were checked only for loading.
  They match where there's anything to compare.

## What needs Anthony's word

1. Keep keyword lists by keyword, as Google gives them (fixes 1 and most of what follows from it).
2. What Shown but not clicked sets each page against.
3. Pages competing: say the home page is left out, or show shares of everything.
4. Indexing: say how many pages are checked so far beside the chart, and look into the sign-in stop.
5. Last 12 months on a website Google holds part of the year for: say so on the screen.
