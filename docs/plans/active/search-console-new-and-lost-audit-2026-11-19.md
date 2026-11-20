# Search Console — New and lost: audit and plan (19 November 2026)

Anthony, on New and lost: "ok this is our next screen, im happy with the design and layouts etc. We need to ensure the
component is built as a shared component, the page is optimised for speed and what Hakken sees is working correctly",
then "we need to audit the data too, are the numbers we show correct". This is what was checked, what was found, and the
work proposed. Anthony said "Yes, build it" the same day, with lost rows showing what they had before they went;
what was built is under **Built** at the end. The design stays as it is.

## How it was checked

More Handles, the United Kingdom, web results, read on dev on 19 November 2026. The page's read (`searchConsoleNewLost`)
was timed on every period the date menu offers through a short-lived internal read, removed straight after. The stored
register (`searchConsoleSeen`, each keyword's and page's first and last day shown) and its day counts
(`searchConsoleSeenDays`) were read directly. Nineteen samples were set against Google itself: for each, the days Google
showed it in the United Kingdom since 1 July (19 small asks, far inside Google's limits).

## What's right

- **Lost keywords.** All six sampled keywords stored as last shown on 20 October were last shown by Google on 20 October,
  in the United Kingdom.
- **The boxes, the chart and the counts agree.** They come from the same day counts.
- **The eye's figures** match what the page shows, and its brief is well inside its size (2,000 to 2,500 characters of 3,500).

## What's wrong

1. **New keywords are counted too high.** Six of nine sampled "new" keywords had been shown by Google in the United
   Kingdom weeks or months before the day they were stored as new. "fire strips" was shown on 79 days from 14 July, and is
   stored as new on 19 September. "handles at heart" was shown on 115 days from 1 July, and is stored as new on 25 August.
   The register missed them on the days they were shown, then counted them new on a day it caught them. New keywords a
   week rise from about 1,600 to about 2,500 in the weeks of 14 and 21 September, when this week's refill of the last 60
   days began.
2. **New and lost pages count pages from other countries.** Since 17 November a page's figures are every country's, and
   the refill wrote them into the United Kingdom's register from 19 September. Two of four sampled "new pages" were never
   shown in the United Kingdom at all. New pages a week jump from about 480 to about 3,200 in the weeks of 14 and 21
   September, and lost pages on Last month read 6,149 against 535 in September. A keyword may be touched too: "cheap
   brass door knobs" is stored as last shown on 11 November, and Google shows none in the United Kingdom after 9 October.
3. **The table stops at 10,000 and doesn't say so.** It lists at most 5,000 new and 5,000 lost keywords. On Last month the
   boxes say 8,478 new and 9,877 lost, and the table says "10,000 keywords".
4. **A lost keyword's row says 0 clicks and 0 shown, beside a position.** "#10 screw head diameter: Lost, 0, 0, 37.5".
5. **Last 6 months and Last 12 months give the same counts.** The register starts on 8 July, and a keyword can count as
   new from 22 July. The page says so in a line, but only when the dates reach back past it.
6. **The eye compares things that aren't alike.** On Last month it says "Pages: 6,064 new and 6,149 lost, against 8,472 new
   and 535 lost the span before", which is fault 2 seen through September. On Last 3, 6 and 12 months it says searches lost
   a day doubled, 425 against 220, partly the same.

## Speed

One read draws the whole page. On the server it takes about half a second to a second and a half, on every period (the
command line's own start takes 1.4 seconds of each timing). Its answer is 5 to 9 KB. The most it does is look up up to
10,000 keywords' figures in the 3 months' list, for a table that shows 25 at a time.

## The chart, as a shared part

The chart itself, `SiteGainLossChart`, is already shared: Visibility's New and lost draws it too. What each page writes for
itself is the card around it: the title, the Gained and Lost tick boxes, the waiting and empty states, the download and
the caption.

## Proposed work (approved 19 November 2026)

1. **A shared card**, `GainLossCard` in `src/ui/components/screens/`, as `DaysChart` and `BarsCard` are: plain steps in,
   tick boxes, waiting and empty words, download, caption, `SiteGainLossChart` inside. New and lost draws it unchanged to
   the eye; Visibility's New and lost moves onto it where it looks the same. Its test, the drawing kit and screen-kit.md.
2. **The register rebuilt from Google**, for each home country, day by day, from the first day Google holds (for More
   Handles, 8 July): one ask a day for keywords and one for pages, each with the country's own filter, spread over about
   an hour within Google's limits and handing itself on. Then the day counts are counted again. From then on the register
   is only ever written from the country's own lists, never every country's.
3. **The table says its limit**, as Keywords does: "18,355 keywords. The table lists the newest 10,000."
4. **A lost keyword's row** shows what it had before it went (its clicks, times shown and position over the 3 months it's
   read from), so the row says what was lost. Your call: or "–" for clicks and shown.
5. **The eye**: no comparison with dates the register doesn't hold whole; checked on every period on a fixture of the
   rebuilt figures, each finding the headline and at least four things; one real press on your OK (about 5p).
6. **Speed**: look up only what the page and its eye need (today every one of up to 10,000 keywords is looked up in the 3
   months' list), aiming for under half a second on the server on every period, timed before and after.

About 3 developer days. For me, a few hours, with the rebuild running by itself for about an hour.

## Built (19 November 2026, on dev, not committed)

1. **The shared card.** `GainLossCard` (`src/ui/components/screens/GainLossCard.tsx`, its test, the drawing kit and
   screen-kit.md): `SiteGainLossChart` in the kit's `ChartCard`, with the download's caption, tick boxes (`ticks`), a
   waiting shape (`loading`), words in place of the chart (`empty`) and the kit's "fills in" note (`filling`). Search
   Console's New and lost and Visibility's New and lost both draw it, and both look as they did. Its test found a fault
   before it shipped: a `waiting` of `undefined` meant "on its way", but a default of `null` turned it into "draw".
2. **The register, country by country.** From now on the register is written only from the country's own
   search-and-page lines, in the nightly collection and the refill (`searchConsoleSync.ts`, `searchConsolePageRefetch.ts`),
   never from the pages asked of every country. A country's own page list holds the same pages: on 10 November Google's
   United Kingdom page list for More Handles named 2,035 pages, exactly the pages its search-and-page lines name, as
   Google leaves the searches it hides out of a country's page figures too. So no ask is added.
   `searchConsoleRegisterRebuild.ts` rebuilds each connected website's register from Google: it clears the country's web
   register and day counts, asks a week of days a step (one ask a day, two at a time, a minute between steps, the
   country's filter on each), notes every search and page, then counts the days again. Websites not connected are left
   alone. The first run, at 11:51, rebuilt Ronins and stopped clearing More Handles: a call read up to 8,000 rows where
   Convex allows 4,096. The clear is all or nothing, so nothing was lost; a call now reads 3,000 at most (`CLEAR_READS`,
   with a test), and the run went on from More Handles at 12:21. If a website's Google sign-in fails part way, its
   register is left half rebuilt and the rebuild is run again for it.
3. **The table says its limit.** Past 5,000 new or 5,000 lost, the bar counts every keyword, as the boxes do, and says
   "The table lists the newest 10,000." (or "The search looks in the newest 10,000." while searching or picking a place).
4. **Lost rows show what they had.** A lost keyword's clicks, impressions and place are its last 12 months, all of which
   came before it went, with a line saying so: "Lost keywords show the clicks and impressions they had in the last 12
   months." A new keyword's are still its figures in the dates.
5. **Speed.** Newest first, with no search and no place picked (how the page opens), the read takes only the page's rows
   and the newest 500 new and 500 lost keywords for the eye, and its total from the register's day counts. Ordered by a
   heading, searched or cut to a place, it reads every keyword as before. Timed on dev on More Handles' register before its
   rebuild, inside Convex, the first run of each (not from Convex's cache):

   | Period | Before | After |
   |---|---|---|
   | This week | 791 ms | 353 ms |
   | Last week | 1,138 ms | 317 ms |
   | This month | 1,530 ms | 290 ms |
   | Last month | 1,132 ms | 329 ms |
   | Last 3 months | 1,237 ms | 350 ms |
   | Last 6 months | 1,336 ms | 385 ms |
   | Last 12 months | 1,307 ms | 326 ms |

   Ordered by clicks it takes 0.4 to 1.2 seconds. **A limit, said plainly:** the eye's "first page" share is of the newest
   500 new and the newest 500 lost keywords (it was of the newest 5,000). With 1,000 the read took 0.41 to 0.53 seconds.
6. **Words.** Every line on the page and the eye's fixed lines rewritten in the redone screens' way, each measured: 5.6 to
   9.8 (the limit is 14). "A keyword counts as new from 22 July: by then the website had been watched 14 days" is now "Your
   figures start on 8 July, so a keyword counts as new from 22 July", and is off the frozen colon list.
7. **Checked after More Handles' rebuild** (finished 13:05). Against what Google showed in the United Kingdom: "fire
   strips" is now first shown on 14 July (it was 19 September); "cheap brass door knobs" last shown on 9 October (it was
   11 November); "handles at heart" from 8 July, the first day held. New keywords a week, 24 August to 5 October: 1,340
   to 1,870, with no rise in September (it read about 2,500). New pages a week: 375 to 620 (it read about 3,200). On Last
   month the page says 6,002 new and 9,928 lost keywords, 1,950 new and 2,158 lost pages; the eye says the same, against
   6,973, 9,457, 2,236 and 1,496 in September. The read on the rebuilt register: 291 to 416 ms on every period.
8. **The eye, on every period.** A new fixture of the rebuilt figures for all seven periods, This week included
   (`src/test/fixtures/moreHandlesSearchConsoleNewLost.json`); each finds the headline and at least four things
   (`convex/utils/sees/searchConsolePeriods.test.ts`; before, This month needed two and Last week three). Last 6 months
   and Last 12 months still read the same, as the register starts on 8 July, and the page says so.
9. **The real press, on Anthony's "yes do it"** (More Handles, Last month, the United Kingdom): two model calls, 41
   seconds, $0.043. The first draft went back once (three figures in one sentence, one past 20 words, two findings left
   out). Five sentences and three linked steps (Pages, Wins and losses, Google updates), every figure checked against the
   saved days: 9,928 lost against September's 9,457; 6,002 new against 6,973; 387 lost a day in the last 7 days against
   301 before; 149 of the newest 500 lost were on Google's first page, and 247 of the newest 500 new. One fault, fixed
   the same hour: the panel's own line said "29.8% of all the searches lost", when it is of the newest 500. The two
   shares now have measures of their own, `newestLost` and `newestGained` ("newest 500 searches lost", "gained"), and
   `convex/utils/sees/measuresWords.test.ts` holds their words to `NEW_LOST_EYE_NEWEST`. Left as it is: "The bright spot
   is 247 of the newest searches went straight onto page one" reads awkwardly, the writer's own grammar; and step 3
   asks whether a late-October Google update caused the rise, a question rather than a claim. The fix hasn't been seen
   in the panel yet: opening it again may write again (about 3p to 5p), so it waits on Anthony's OK.

The rebuild goes on by itself through the other connected websites (Conterra Ops, Korda, the National Extension College).
Hurtwood House's Google sign-in needs reconnecting, so its register is left as it was; once reconnected, the rebuild is run
for it alone.
