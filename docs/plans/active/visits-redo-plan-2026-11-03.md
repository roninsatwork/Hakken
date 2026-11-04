# Plan: Visitors becomes Visits, and the eye reads it

**Written 2026-11-03 at Anthony's request ("then we need to make this a plan and also fix what hakken sees on the page
too"). Approved to build on 2026-11-03: "ok bjuidl it", after asking how many days it would take.**

**How the open questions were settled.** Anthony didn't answer them one by one, so the build takes my recommendations
below, each marked as mine. Any of them can be changed:
1. Board 2 is built as drawn. It's saved as `docs/plans/assets/visits-redo/Visits.dc.html`.
2. The address becomes `/visits`, and `/visitors` forwards to it.
3. "Fewer than September" is said on this page only. Other screens wait for Anthony's word, because the change would
   reach nine screens he hasn't looked at.
4. One line under the treemap names the page groups too small to label.
5. No dots on the daily line, as drawn.
6. One choice: the bars' By and the table's switch are the same setting.
7. The table's words stay as they are, as on board 2. They wait for Anthony.
8. The Visitor behaviour specialist writes the eye's words.

The drawings are on the canvas "Hakken — Visitors, redo" (https://claude.ai/artifact/5ESv8nEpmPxrHkGzTrw4FW):

- **Board 1** is Google Analytics → Visitors as it is today, on More Handles for October, with notes on what reads wrong.
- **Board 2** is the redo, drawn from the app's own parts and More Handles' real figures. Press Play to switch the bars.

When Anthony approves board 2, it is saved under `docs/plans/assets/visits-redo/` and becomes the look to build to.

## What Anthony asked for

- Replace the squares with the "Who looks at…" bars, the chart he approved on a page's own screen (3 November).
- "Lets stick with visits and change the page to visits." The whole page counts visits, not people.
- Add the treemap "to see what they visit": the pages people looked at, by kind, not where their visits started.
- "Call it Visits."
- No "visitors" left on the page ("why still visitors").
- Every word in our style, a reading age of 14.
- Fix what Hakken sees on the page.

## How long

**About 7 days for a developer.** As agent work, about 2 to 3 days.

| Step | What | Days |
|---|---|---|
| 1 | The page as drawn | 3½ |
| 2 | What Hakken sees on the page | 1½ |
| 3 | Ask Hakken knows the new page | 1 |
| 4 | Checking it all | 1 |
| | **Total** | **7** |

The table's words (open question 7) would add half a day.

## Step 1. The page as drawn

**The name.** The page is called **Visits**, in its title, the side menu and the phone menu, in English and Italian. Its
web address becomes `/visits`. The old `/visitors` address forwards to it, because Ask Hakken's answers, task emails and
the Insights report already link there. Hakken's own names inside the code stay as they are (`googleAnalytics.visitors`).

**Under the title:** "Your visits, new and returning. Who came, what they used and the pages they looked at."

**Four boxes, all in visits, each compared with September by name**

| Box | October on More Handles | Line under it |
|---|---|---|
| Visits | 35,739 | 4.7% fewer than September |
| New visits | 24,289 | 0.9% fewer than September |
| Returning visits | 9,510 | 7.5% fewer than September |
| Visits a person | 1.4 | The same as September |

New and returning visits don't overlap, so they never add up to more than everyone. Today's boxes count people, and
93.6% new plus 20.9% returning makes 114.5%.

**New and returning visits by day** (Anthony's comment, 3 November: "by day"). It counts visits, not people. Hakken already keeps both for every day.
- It becomes the chart with menus (the kit's `ChartExplorer`, as lines), with one menu, **Compare with: September or
  Nothing** (Anthony's comment, 3 November: "i think we need a compare option on this chart").
- With September chosen, September's new and returning visits sit under October's as dashed grey lines, by date
  (1 September under 1 October), the way the Conversions page's chart shows the span before. The weekends don't line up.
- The chart with menus doesn't draw the dots, so they go (open question 5).

**The order under the boxes** (Anthony's comment, 3 November: the treemap "under new and returning visits a day"):
the daily line, then What people looked at, then Who visits your website, then the table.

**Who visits your website, by …** The approved chart with menus, as bars, in place of the squares.
- **By:** New or returning (it opens here), Age, Gender, Browser, Operating system, Interest.
- **Compare with:** September (the grey bars) or Nothing.
- Each bar is visits, with its number on it.
- Age, Gender and Interest leave out the visits Google can't place. The line under the title says how many it knows:
  "Google only knows the age for about 1 in 4 visits."
- Interest shows the 8 biggest of the website's interests, with short names ("Travel Buffs", not
  "Travel/Travel Buffs").
- The six lists are already kept for this month and the month before. Nothing new is asked of Google.

**What people looked at, by kind of page.** The treemap from the kit (`SiteTreemap`, as on Sites → structure).
- Each box is one of the website's page groups, sized by views. On More Handles that's 152,926 views of 9,538 pages in
  October. Cupboard Handles has 21% of views.
- It counts views, not visits, because one visit can see many pages of the same kind. Adding up visits would count that
  visit again for each page.
- Pages in no group are one box, "Not sorted yet". On More Handles that's nearly 1 in 3 views, from 3,198 pages.
- **New stored figure.** The page list is already collected with every page's views. When it's collected, Hakken adds
  the views up by page group and keeps that small list beside it, the way landing pages by kind are kept today. This needs
  no Google asks. A new part of the data is a change Anthony approves with this plan.
- If pages are sorted again, the treemap catches up at the next collection.

**Gone:** the squares ("Where each kind of visitor lands"). Their read stays, because the table's "Lands most on" column
and Ask Hakken still use it.

**The table** stays as it is today (open question 7).

**Limits to say on the page**
- Google's counts differ a little. The boxes say 35,739 visits, but new, returning and not known add up to 35,923.
- Google only knows age and gender for about 1 in 4 visits.

## Step 2. What Hakken sees on the page

**Today, on More Handles for October** (found without pressing the eye, so no credits were used):

- **The figures at the top are empty.** Code finds nothing to say from the page's figures.
- **The only words are the old rule's:** "25,573 people made the 35,739 visits; 93.6% were new to the website." and
  "Google held back some small groups to protect people's privacy." They count people, use a semicolon, and say nothing
  a reader can act on.
- **No "Do first" steps.**
- **The screen list gets the page wrong.** It says the page is about "their ages, interests, devices and places".
  The page shows no devices and no places. It names no parts and nothing the writer must never talk about, so a press
  could talk about money.
- **The daily figures have no dates.** The eye gets day 0, day 1 and so on, so it can never say which day something
  happened.
- **One rule counts every conversion as if it were a visit.** "People who came back converted at …" would divide
  conversions by visits. On More Handles that's 11,809 conversions from 9,510 returning visits, or 124%.
- Nobody has pressed the eye on this page for More Handles yet.

**The fix**
- **The screen list:** what the page is ("Visits: how many visits the website had, new and returning, who made them
  where Google can tell, what they used and the kinds of page they looked at"), its parts top to bottom, and what it
  never talks about. That's money, where visits came from (Channels has that), and conversion rates from this page's
  counts.
- **Who writes:** the Visitor behaviour specialist (open question 8).
- **The page hands the eye its figures, in visits:** the four boxes with September, each day by its date, the bars' list
  for the By chosen with September, and the treemap's views by page group.
- **Code finds what they show:** the biggest rise and fall between September and October in each list. A group holding
  most of the visits. A page group far bigger in views than the rest, or a big "Not sorted yet". Each figure's name goes
  in the measures list, in English and Italian, so it can speak.
- **The rule's words are rewritten in visits**, for a reading age of 14. The conversion rule is taken out until Hakken
  keeps visits that converted for new and returning visitors. Its step goes with it.
- **The panel matches Conversions':** the figures first, then what it means with up to three "Do first" steps, then the
  chat. That's Anthony's format for every eye.

## Step 3. Ask Hakken knows the new page

- Its read of the page matches the screen: visits first, September beside October, the six lists in visits, and views
  by page group. No people-first figures.
- It can draw the website's visits by new or returning, age, gender, browser, operating system or interest, against
  September. Today it draws age and gender for one page only, and refuses them for the website. It can also draw views by
  page group.
- Its links go to `/visits`.

## Step 4. Checking it all

- Tests for the new read, the stored page-group views, the bars and the treemap, and a look test for the approved board.
- Press the eye on More Handles and one more website, about ten presses in all at 8 credits each. That's about 80p.
  Anthony approves the spend first.
- `npm run check`, then GitHub's own steps: coverage, the smoke tests and the build.
- Compare the screen with what Anthony asked, not with this plan.

## Open questions for Anthony

1. **Board 2.** Approve it as drawn?
2. **The web address.** Change it to `/visits`, with `/visitors` forwarding? Recommended, so the address matches the
   name.
3. **"Fewer than September".** The line under a box says "on the month before" on nine Google Analytics screens. Change
   it everywhere, or only here? Recommended everywhere, so every screen says the month by name.
4. **The smallest page groups.** Blog, Electrical and Lighting are too small to name in the treemap, so you only see
   them on hover. Add one line under it naming them, for example "Also: Blog 2,746 · Electrical 2,610 · Lighting 748"?
   Recommended.
5. **The dots on the line.** More Handles has a conversion every day, so every day has a dot and they all look the same.
   The chart with menus doesn't draw them, so board 2 has none since the compare menu went in. Leave them off?
   Recommended. Keeping them would mean teaching the chart with menus to draw dots.
6. **One choice for the chart and the table.** Should picking Age in the chart switch the table to Age too? Recommended,
   so the two never show different things.
7. **The table's words.** They aren't in our style yet: "Engaged", "conversion rates from under 100 visits are greyed",
   "124.2% of visits". Rewrite them in this build? Recommended. "124.2% of visits" would go, because it divides every
   conversion by visits.
8. **Who writes the eye's words.** The Visitor behaviour specialist (Clarity's), because the page is about who visits
   and what they look at? Or the Conversion specialist, who writes for the rest of Google Analytics today?

## For the builder: where things live

- The screen: `src/app/(dashboard)/app/analytics/[siteId]/visitors/page.tsx` (moves to `visits/`), the side menu
  and its words in `messages/en.json` and `messages/it.json` (`googleAnalytics.visitors`).
- Boxes and line: `convex/googleAnalyticsVisitorReads.ts`. The day points sum `people` today; sum `visits` instead.
- The bars: copy the shape of `WhoLooksCard` in `src/app/(dashboard)/app/analytics/_components/PageStory.tsx` (the kit's
  `ChartExplorer` as bars). Each list's rows already carry `visits` and `change`. September's visits are
  `visits / (1 + change)`, or read the list's `BEFORE` slot.
- The treemap: `src/app/(dashboard)/app/sites/_components/SiteTreemap.tsx`. Fold the page list's views by
  `pageKindsFrom` (`convex/utils/pageKinds.ts`) at collection, as `foldByKind` does for landing pages
  (`convex/googleAnalyticsLandingKinds.ts`). The page list keys pages by number (`~7h1`); `holdPageAddresses` turns
  them back into addresses.
- The eye: `convex/utils/sees/screens.ts` (`googleAnalytics.visitors`), `convex/utils/sees/analyticsVisitors.ts` (the
  rule), `convex/utils/sees/measures.ts`, and `useSeesPart` for the bars and the treemap. Read
  `docs/developer/what-hakken-sees-guide.md` first.
- Ask Hakken: `convex/assistantAnalyticsReads.ts` (`case "visitors"`) and `convex/assistantGroupChartReads.ts`.
- How board 2's figures were read: October and September from the stored lists and days, through
  `npx convex run --inline-query` and the app's own `unpackPart`, read-only.

## Progress

- 2026-11-03: drawn on the canvas (boards 1 and 2), changed at Anthony's comments, and planned.
- 2026-11-03, built on dev at "ok bjuidl it" (not committed):
  - **The name.** Visits, at `/visits`; `/visitors` forwards there (`visitors/page.tsx`, as `landing-pages` forwards to
    Funnel). Back links from a page's own screen come back to either address.
  - **The boxes and the line** in visits (`analyticsVisitors`, `analyticsVisitorDays`). The days are their own read:
    together the read came within a quarter of a second of Convex's limit. "Fewer than September" on this page only,
    through a `named` word on the shared change line.
  - **The bars** (`analyticsVisitorBars`, `WhoVisitsCard` in `_components/VisitsCharts.tsx`): By is the table's own
    choice, so picking Age in either changes both.
  - **The treemap** (`analyticsPageKindViews`). Changed from the plan: the views are added up by page group as the
    page reads them, not kept at collection. Nothing new is kept, it shows at once rather than after the next run, and
    it never goes stale when pages are sorted again. Measured on More Handles: 0.41–0.44s.
  - **The eye.** The screen list now says what the page is, its parts and what it never talks about, written by the
    Visitor behaviour specialist. The rule speaks in visits and lost its conversion rule (124% on returning visits).
    It doesn't say where returning visits land when that's Not sorted. Changed from the plan: the page now hands the
    eye every list it can show but interests (`analyticsVisitorGroups`), because the one list on screen moved too
    little for any finding. With them, code finds on More Handles for October: "Chrome: visits fell to 14473 from
    15875, the biggest fall on the list" and "Chrome holds 40.9% of the list's visits". Before, it found nothing.
    Interests are left out because one person sits in many ("Soccer Fans" fell, on a door handle shop).
  - **Ask Hakken** reads the page as the screen shows it: visits with September, who visits, what people looked at.
    It now draws the whole website's visits by age or gender. Not done: by new or returning, operating system or
    interest, which would need new chart groups added to Ask Hakken's chart tool.
  - **Checked** in Anthony's Chrome on More Handles: the figures match board 2, the old address forwards, Age switches
    the chart and the table together. The sentences list (`seenWords.json`) was regenerated after the rule's words
    changed.
  - **Checked:** `npm run check` (8,323 tests, lint, types, guards), `test:coverage` and `coverage:check`, the smoke
    tests (19 of 19) and the build (in a copy, so the app on port 3000 kept running), `git diff --check`. The check
    caught three things on the way, each fixed: a cached value the React compiler couldn't keep, the load test still
    reading days from the boxes' read, and two English names written into the page instead of the word lists.
  - **Not done yet:** pressing the eye (about 80p for ten presses, waiting on Anthony's OK). Not committed.
- 2026-11-03, later: Anthony pressed the eye on Visits. Its figures said only "Chrome: down to 14,473 visits" and
  "Chrome: 40.6% of all the visits", and it gave no "Do first" steps. He asked "is chrome stats the best you can come up
  with", then: "yes and products please every page we touch needs its own finding i have asked this more than once
  across all pages". Built the same day:
  - **A page's own findings** (`convex/utils/sees/pageOwnFindings.ts`), called first by the general rules
    (`pageFindings.ts`). Two new kinds of finding, moved up and moved down, with another group's change beside them where
    it matters; one group's figure set against another's ("Returning … For New …"). Words in English and Italian.
  - **Visits says only its own**, never the general rules'. On More Handles for October: returning visits down 7.5%
    while new fell 0.9%; returning visits leave at once more often (37.9% against 31.9%); visits from 18 to 24 year olds
    down 20.6%; Edge and the over-65s leave at once less than the website; 31.4% of views on pages not sorted yet.
    Browsers' moves aren't findings (they're the market's). The writer is told never to ask the reader to sort pages.
  - **Products keeps the general rules' product movers and adds its own**: the step that loses most visits before the
    sale, against the month before (24.2% of visits with Added to basket went on to Purchase, 24.4% in September);
    the products added but never bought (37.6%); and a product left in baskets far more than the others listed (a
    Eurospec hinge, 94.1% of the items added, against 66.7%).
  - **Links for "Do first" steps** on both pages: Channels, Funnel, All pages and Conversions.
  - Every page touched from now on gets its own findings: noted for every future plan.
  Overall: about 95%. Building and checking: done. Left: the eye presses, then a commit when Anthony asks.
