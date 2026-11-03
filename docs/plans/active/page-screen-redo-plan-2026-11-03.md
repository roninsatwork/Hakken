# Plan: a page's own screen, redone, and the eye and Ask Hakken reading it

**Written 2026-11-03 at Anthony's request. Approved and built on dev the same day ("ok build this to completion please").**

The drawings are on the canvas "Hakken — A page's own screen, redo" (https://claude.ai/artifact/KhsdHUZF4F4SYVLTLvH2S5):

- **Board 1** is the page as it is today.
- **Board 2** is a product page, the Waltz Round Knob.
- **Board 3** is any other page, shown on the Cupboard Door Knobs page.

Anthony approved the "Who looks at this page" chart on 3 November. When he approves the rest, boards 2 and 3 are saved
under `docs/plans/assets/page-screen-redo/` and become the look to build to.

## What Anthony asked for

- Redo the page using the standard parts, with at most four boxes.
- Every word written for a reading age of 14.
- Bring the new page into Ask Hakken.
- Every eye panel to look like the Conversions page's: the figures at the top, then what it means with up to three
  "Do first" steps, then the chat. Fix the Products page's panel too, and every other page where the figures are missing.
- Make the eye cheaper to run, but keep the quality.
- Charge for Ask Hakken and the eye with a usual software margin.

## How long

**About 11½ days for a developer.** As agent work, about 3 to 4 days.

| Step | What | Days |
|---|---|---|
| 0 | Find every eye page whose figures are missing | ½ |
| 1 | The page as drawn, both kinds | 3 |
| 2 | The eye on this page | 1½ |
| 3 | The eye on the Products page | ½ |
| 4 | The eye on every other page that's missing its figures | 1½ |
| 5 | Ask Hakken knows the new page | 1½ |
| 6 | The eye costs less, with the same quality | 1 |
| 7 | Credit prices with a margin | ½ |
| 8 | Two broken things found while drawing | 1 |
| 9 | Checking it all | 1 |
| | **Total** | **11½** |

## Step 0. Find every eye page whose figures are missing

The eye is on 154 pages. On some, like Products and this page, code finds no figures, so the top of the panel is empty.

- Run the code that finds the figures over every page's saved figures. This costs nothing and presses no eyes.
- List each page that comes up empty, and why.
- Steps 2 to 4 fix every page on that list.

## Step 1. The page as drawn

**The top**
- The page's web address as the title, at a smaller size. The header has no smaller title today, so this adds one
  size option to the standard page header. It is not a new part.
- "Open the page" on its own line under the title.
- No grey line under the title.

**Four boxes on a product page**

| Box | Example | Line under it |
|---|---|---|
| Views | 2,107 | 3.4% fewer than September |
| Added to basket | 3,957 | 1 in 4 were bought. All 23 sizes and finishes |
| **Bought**, the main box | 1,034 | About 1 in 7 of everything you sold |
| Started on this page | 919 | 2.6% of all your visits. 1.7% more than September |

**Four boxes on any other page**

| Box | Example | Line under it |
|---|---|---|
| Views | 2,366 | 2.2% more than September |
| Started on this page | 74 | 0.2% of all your visits. 4.2% more than September |
| **Visitors who bought**, the main box | 1 | 1.4% of them. Whole website: 3.4% |
| Scrolled to the bottom | 29.0% | Of people who saw it. Similar pages: 15.7% |

**Under the boxes**
- **Views each day**, as today, with plainer words.
- **Visitors each day**, the standard chart with menus. It opens on Visits, with one line for each place they came from.
- **Websites that sent visitors**, the bars. They open on Source, and Channel comes out of their menu.
- **Who looks at this page**, one chart in place of four: device, country, age and gender, against the whole website.
  It's the standard chart with menus. Approved.
- **Busiest days of the week.**
- **Where visitors came from**, the table. Anthony is still deciding whether to keep it.
- On any other page only: **Links people clicked.**

**Gone:** People, Time, Different pages a visit, Read to the end on product pages, all money, the conversions
squares, the page-before table, and on product pages the links-clicked table.

**Plain names for where visits come from**, everywhere on this page:

| Google's name | Plain name |
|---|---|
| Cross-network | Ads across Google |
| Paid Shopping | Shopping ads |
| Paid Search | Search ads |
| Organic Search | Search (free) |
| Direct | Typed in |
| Paid Social | Social media ads |
| Organic Social | Social media (free) |
| Referral | Links on other sites |
| Organic Shopping | Shopping (free) |

**Where the product figures come from.** Products already knows how many of each product were added and bought. A
page is matched to its products the same way Products opens a product's page today, just the other way round. Every
size and finish on the page is added together. A page with no product match shows the "any other page" boxes.

**Counted as visits, not clicks.** "Visitors who bought" counts visits that started here and went on to buy. It is never
more than 100%. Today's boxes count every click, which is how the page came to show 1,459 conversions from 919 visits.

**Limits to say on the page**
- Country has no grey "whole website" bars yet. Hakken doesn't keep the whole website's countries for this chart.
- Google only knows age and gender for some people, for example 198 of 958. The chart says so.

## Step 2. The eye on this page

Today the panel opens with no figures. My helper found why:

- **The screen list says almost nothing about this page.** It names no parts and no "never", so the writer can still
  talk about money.
- **The charts don't hand their figures to the eye.** Products and Conversions do this. This page doesn't.
- **Some figures can never be found.** Countries and weekdays have no names on their rows. Pages are named by codes
  like "~1". Sources are judged by conversions, which are mostly nought.
- **A bug: every page's own screen shares one saved answer.** Pressing the eye on page B throws away page A's words.
  Page A then gets written again and paid for twice, and page A's words can show on page B.
- **The rule words still talk about the parts we're removing**, like the page before and pages a visit.

The fix:
- Give the screen list this page's parts, top to bottom, and "never" for money and the removed parts.
- Have every chart hand its figures to the eye.
- Give countries and weekdays names, name pages by title, and judge sources by visits.
- Save each page's answer under its own page.
- Rewrite the rule words in plain English for the new page.
- Check the panel matches the Conversions panel: figures, then what it means, then the chat.

## Step 3. The eye on the Products page

On 3 November its last press found no figures, and the writer was turned down twice. Find why code finds nothing on
Products, fix it, and check the panel has all three parts.

## Step 4. The eye on every other page that's missing its figures

Fix every page from step 0's list the same way. Then press a few at random, not all of them, as Anthony asked on
31 October.

## Step 5. Ask Hakken knows the new page

- **The chat is told which page it's on.** Today it gets the screen's address without the page, so it doesn't know
  which page you mean.
- **The boxes' figures go first.** Today they're squeezed out by the daily figures.
- **Ask Hakken's page read matches the new page.** No money, people or page-before. It adds who looks, the busiest
  days, visitors by place each day, and the product figures.
- **Ask Hakken can draw charts for one page.** By source, device, country, age, gender and day of the week. Today it
  can only draw charts for the whole website.

## Step 6. The eye costs less, with the same quality

**What a press costs today.** About 7 cents in October and 15 cents so far in November, with some presses up to
50 cents. Most of the cost is the writer. A press on Products on 3 November cost 11 cents and wrote nothing, because
the writer typed numbers itself and was turned down twice.

**The aim is about 5 cents a press.**
- **A short brief.** The writer gets code's figures and a few key numbers, not the whole page.
- **Fewer second tries.** The writer is shown how to use the figures it's given, so it stops typing numbers.
- **No paying twice,** through the saved-answer fix in step 2.
- **Record how much text each call uses,** not just its cost, so we can see where the money goes.

**Quality stays the same.** The Conversions page's panel must still score 2 of 2 on its test page. This page and
Products each get a test page of their own once Anthony has pressed them and said what good looks like.

## Step 7. Credit prices with a margin

- **Add a margin to Admin → Credit prices, set to 80%.** That's a usual software margin. Each suggested price is what
  the work costs us, worked out so we keep 80p of every £1.
- **Ask Hakken: 2 credits a question.** It costs about 1.4 cents, so that's about 7 cents.
- **The eye: priced after step 6 is measured.** At 5 cents a press it would be 5 credits.
- Nobody is charged yet. This only changes what is recorded.

## Step 8. Two broken things found while drawing

- **The tubular latch guide.** Its screen says no visits started on it, but All pages shows 491 visits for it. So an
  article's boxes would be blank. Find out why and fix it.
- **Conversions counted as clicks.** Fixed for this page in step 1. Check the "Where visitors came from" table, if kept,
  doesn't show more than 100%.

## Step 9. Checking it all

- Update the tests this changes (listed below), and add a look test for the new page.
- Press the eye on this page, a product page, an article and Products on MoreHandles.
- Run the full check before asking to commit.

## Open questions for Anthony

1. Are boards 2 and 3 approved, so they're saved as the look to build to?
2. "Where visitors came from": keep it or remove it?
3. Board 3's "Links people clicked": keep it?
4. Is 80% the margin you want?

## For the builder: where things live

- Page: `src/app/(dashboard)/app/analytics/[siteId]/all-pages/page/page.tsx`. Parts in
  `src/app/(dashboard)/app/analytics/_components/`: `PageStory.tsx`, `ConversionExplorer.tsx`, `PageVisitors.tsx`,
  `ConversionParts.tsx`.
- Reads: `convex/googleAnalyticsPageReads.ts` (`analyticsPage`), `convex/googleAnalyticsPageStory.ts`. Product
  figures: `convex/googleAnalyticsProductReads.ts` (`productsOf`, `bestPageFor` at about line 358, to be reversed).
- Eye: `convex/utils/sees/screens.ts:80` (`googleAnalytics.page`, to get parts and never, like Products at :83),
  `pageData.ts`, `pageFindings.ts` (rows without a name field are skipped at :42), `measures.ts` (count order at :20),
  `analytics.ts` (`pageSees`, about :477), `src/ui/components/screens/hakkenSeesStore.ts` (`useSeesPart`).
- Saved-answer bug: `convex/utils/seesAsk.ts:85` (`seesKey` has no page), `HakkenSeesEye.tsx:75` (path without
  `?key=`), `convex/seesAsk.ts:81`.
- Ask Hakken: `convex/assistantAnalyticsReads.ts` (`page` case, about :323), `toolConnectorDefinitions.ts` (:603),
  `convex/utils/startedOn.ts`, group charts in `convex/assistantGroupChartReads.ts` and
  `convex/utils/assistantGroupCharts.ts`, and `chartFromToolCalls` in `convex/utils/assistantCharts.ts`. Products'
  wiring (commit da212148) is the pattern to follow.
- Credits: `convex/creditKinds.ts`, `convex/creditPricesAdmin.ts`.
- Tests to update: `googleAnalyticsSecondRoundLook.test.tsx` (case 21 and its outline
  `docs/plans/assets/analytics-page-screen/look/Page.txt`), `src/analytics-sees-drift.test.ts`,
  `convex/utils/sees/analytics.test.ts`, `pageFindings.test.ts`, `pageData.test.ts`, `measuresWords.test.ts`,
  `src/seen-words-drift.test.ts` (run `node scripts/seen-words.mjs`), `convex/googleAnalyticsReads.test.ts`,
  `googleAnalyticsPageChannels.test.ts`, `googleAnalyticsPageConversions.test.ts`,
  `src/translation-parity-drift.test.ts`. Check the database for eval pages of `googleAnalytics.page` before grading.

## Progress

- 2026-11-03: drawn on the canvas and planned.
- 2026-11-03, Anthony's answers: boards 2 and 3 approved; "Where visitors came from" kept; "Links people clicked" removed from
  both; an 80% margin; Google's own channel names kept ("the words the supplier uses"); about ten eye presses to test;
  Google may be asked for the article fix if needed (it wasn't); commit to dev, don't push.
- 2026-11-03, built on dev:
  - Step 1: the page as drawn. New read `convex/googleAnalyticsPageBoxes.ts` (a product's items, matched to its page by
    `soldOnPage`, the reverse of Products' `bestPageFor`; visitors who bought). Boxes in `PageBoxes.tsx`; one switchable
    "Who looks at this page" chart in `PageStory.tsx`; the line chart opens on Visits; the bars on Source; the squares,
    page-before table, links clicked, privacy notice and money gone. The page header gained `size="small"` and `link`.
    Every word at a reading age of 14, the kit's up-or-down table included ("Up or down", "Than the day before").
  - Step 8: the article's missing visits. Analytics names a landing page without its trailing slash, which had become a
    second page number (`landingKeyOf`, `convex/googleAnalyticsPageNumbers.ts`); the story, the grid, the line chart and the
    boxes read both. The tubular latch guide now shows 440 visits that started on it. Nothing was asked of Google.
  - Step 5: Ask Hakken's page read matches the screen (no money, people, time or page before), and it can draw one page's
    chart by channel, source, device, country, age, gender or day of the week.
  - Step 6, in part: a number glued to a name ("32mm") no longer counts as a typed figure (`insightEditor.ts`), which sent
    the Products press back twice; each model step now keeps its word counts.
  - Step 7: Admin → Credit prices has a margin (80%) and suggested prices; Ask Hakken costs 2 credits a question.
  - Steps 2–4: the eye's figures. Code now names rows by their names (never "~fu"), takes the first list with figures,
    compares a share with its own reference (the whole website, similar pages) rather than the list's average, keeps
    rates past 100% on Google Analytics screens, reads deeper, and counts new rows as movers. Pages with no figures fell
    from 10 to 5 of 22 checked; Products from 0 to 4; this page 4 to 6; Channels 0 to 2. Each record keeps its own saved
    answer (the page's `?key=` is in the key), and the period shown is in it. Products hands its movers and boxes. The
    page screen's rule words were rewritten for the new page. The finding sentences read at a reading age of 14
    ("United Kingdom: 97.3% of all the people"; "Mobile: 65% of the views. The whole website: 39.3%").
  - Step 6: with code's findings the writer gets a short brief (each list's first 8 rows) and reads no screens; the
    writer is told to write for a reading age of 14. Four presses on More Handles cost 2.3, 8.2, 9.5 and 11.1 cents,
    7.8 on average (15 earlier in November, some at 50). Conversions' panel is unchanged.
  - Step 7, the eye: 8 credits a press (7.8 cents at the 80% margin).
  - Left for later, then done the same day at Anthony's "why don't we do them now not later": the page's read took
    0.72–0.85s against Convex's 1s limit (0.86–0.90s before this work), so the first load after new code went live
    could time out. It is now two reads the screen runs side by side: its own figures (`analyticsPage`, 0.25–0.27s on
    More Handles' knob) and its story with What Hakken sees (`analyticsPageStory`, 0.48–0.50s); the boxes stay their own
    read (0.29s). Ask Hakken reads a page in three: its views, then its boxes and its story side by side
    (`analyticsPartsOf`), 0.42s, 0.44s and 0.53s, each by the page the first found; it finds the page from the list its
    screen reads (`findPage`), never All pages' search, which alone took 0.53s. Ask Hakken's chart of one page went from
    0.92–0.95s to 0.67s the same way, with the same bars. Measured with `npx convex run` five times each, user time.
  - Left for Channels' own redo: its conversion rates count Google's times, not visits (Paid Search 134.8% on More
    Handles over 12 months), as every other screen but this one does. Anthony, 2026-11-03: "i don't care we are going
    to redo this page anyway". For that redo: the exact "visits that made any conversion" is kept only for landing pages
    by channel; More Handles counts 13 things, "5 minutes on site" among them, so which visits count is his call.
