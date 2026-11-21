# Search Console and Analytics: the data plan (21 November 2026)

Anthony, 21 November 2026: "we audit first across both, make the plan, discuss it and then build it", then "make one
large plan for search console and analytics".

One plan for everything the two audits found: `search-console-data-audit-2026-11-21.md` and
`google-analytics-data-audit-2026-11-21.md`. Nothing here is built. It's for discussion, then Anthony's go.

## At a glance

| # | Fix | Section | Developer days | Needs Anthony's word |
|---|---|---|---|---|
| 1 | Keyword figures as Google gives them | Search Console, and three readers outside it | 5 to 6 | Build it |
| 2 | What a page's click rate is set against | Both | with 1 | Which way |
| 3 | Ask a finished period again a week on | Analytics | 1 | Build it |
| 4 | The eye checked in code, not only told | Both | 1 | Build it |
| 5 | Say what each screen leaves out | Search Console | 1 to 1.5 | Build it |
| 6 | Two small Analytics tidies | Analytics | half a day | The channel name |
| 7 | What counts on More Handles, and a check for it | Analytics, a client's setting | half a day | Yes or no |
| 8 | Super admins no longer sent to Admin when the app opens | Sign-in | under an hour | Build it |

About 10 developer days in all. For me, roughly three to four days, plus fix 1's refill running for a few hours.

---

## 1. Keyword figures as Google gives them

### What's wrong

Hakken works out a keyword's figures by adding up its rows for each page. When Google shows several of the website's
pages for one search, that search is counted once for every page. Google's own keyword figures count it once. Clicks
come out nearly right. Times shown, click rate and position don't, and everything built on them inherits that.

### What changes on screen

Every keyword figure matches Google's own, for every period in the date menu. That's how Pages already works, and why
Pages was exact in the audit.

| Screen | Now (October, More Handles) | After |
|---|---|---|
| Keywords, "more handles" | 8,426 shown, position 1.8, 1.2% | 1,109 shown, position 1.16, 8.7% |
| Keywords row against its own screen | 8,426 against 1,109 | Both 1,109 |
| Click rate by position, position 1 | 2.45% | 6.36% |
| Brand and non-brand, brand searches | 21 clicks per 1,000 shown | 137 per 1,000 |
| Position bands, week of 5 October, top 3 | 1,312 keywords | 1,442 |
| Volatility, 18 November | 20 up, 4 down | 3 up, 8 down |

These change too, and so does the eye on each of them:

- **Tracked keywords**, and Performance's top keywords and bands card.
- **The mobile and desktop click rate curves**, which add up the same way.
- **New and lost**: the position and band beside each keyword. The counts don't change.
- **Volatility's history**: every day's score for the 60 days kept, and "your usual".
- **Position bands' and Brand and non-brand's charts**, back to the chart's reach.
- **Outside Search Console**:
  - Analytics' landing page stages take Search Console's click rate at each position (see fix 2).
  - Fan-out takes each keyword's position.
  - Insights takes the near-miss searches it suggests.

Nothing changes on Performance's boxes and chart, Pages, a page's or a keyword's own screen, Countries, Devices, Rich
results, Demand by Classification, Google updates, Indexing, New and lost's counts or Pages competing. Pages competing,
a keyword's pages and a page's keywords stay on the keyword-by-page rows, which is right for them.

### How

Keep a second daily list beside the keyword-by-page rows: Google's keyword list, one row per keyword, as Google gives it.
That's the same thing Hakken already does for pages.

Measured on More Handles before planning:

- **Adding up the days gives Google's period exactly.** October's 31 daily keyword lists, added up, gave all 31,538
  keywords in Google's October list, with every click, impression and position the same.
- **Adding up weeks is exact too, and finds more.** Thirteen weeks from 17 August, asked a week at a time, matched all
  50,000 keywords Google gave for the whole span. They also found 981 more, which one ask leaves out because Google stops
  at 50,000 rows.

**1a. Collect it.**

- A new kind of kept list, `query`, for the kinds of result with searches: web, video and news.
- The nightly run asks for it with the keyword-by-page rows, for the same days: the newest and the last four again.
- A first collection's 90 days, and the 16-month fill, ask for it too.
- It's kept 60 days and cleared with the others. Its keywords are places in the month's keyword book the pairs already
  use, so there's no new book.

**1b. Build every keyword figure from it** (`searchConsolePeriods.ts`, `searchConsoleKeptSums.ts`).

- **Each period's keyword rows** take clicks, times shown and position from the keyword list. How many pages each keyword
  brought people to, and its top page, still come from the pairs.
- **Last 3, 6 and 12 months** (`searchConsoleLongLists.ts`) ask each weekly piece's keyword list too, and add them up.
- **The charts' days and weeks, the volatility day and Fan-out's 14 and 28 days** are added up from the keyword list.

**1c. Asks made while you wait.**

- **Custom dates, and a country not kept ready** (`searchConsoleLists.searchConsoleLiveList`) ask Google by keyword.
- **The mobile and desktop curves** (`searchConsoleBreakdowns.ts`) ask by keyword.

**1d. Fill in what's already held**, a website at a time, spread over a few hours:

1. Each website's 60 kept days of keyword lists: 60 small asks per kind of result with searches, per country kept.
2. The charts' weeks and months back to their reach: one ask each, in weekly pieces where Google cuts one off.
3. Each website's lists and charts added up again.

Until a website's turn comes, its screens show what's held and say they're being added up, as they do today.

### Cost

- **Storage.** A day's keyword list for More Handles is about 7,600 rows and 70 KB, against 138 KB for its pairs. Sixty
  days add about 4 MB, about 2% of the website's data. Other websites hold 45% to 90% as many keyword rows as pairs.
- **The nightly rebuild** reads that 4 MB as well.
- **Asks to Google.** Five more a night per kind of result with searches, one more per weekly piece in the long lists,
  and a one-off refill of 60 to 120 asks per website. Search Console allows 1,200 asks a minute per website.

## 2. What a page's click rate is set against

Shown but not clicked sets each page against "the click rate you usually get at its position". Analytics' landing page
stages (`googleAnalyticsHeroes.ts`) use the same rate. Today it comes from the keyword figures. Once fix 1 is in, it
reads 6.36% at position 1, and almost every page at the top of Google would look short of clicks.

That's because a page and a keyword aren't counted alike. When Google shows three of the website's pages for one search,
the keyword is shown once, but each page is shown once too.

- **Recommended**: set pages against pages. Work the usual rate out from the page list itself (1.71% at position 1 in
  October), so like is set against like.
- **The other way**: keep the keyword rate.

Built with fix 1.

## 3. Ask a finished period again a week on (Analytics)

### What's wrong

A finished period is asked of Google two days after it ends (`SETTLE_DAYS`, `googleAnalyticsJobs.ts`), then never again.
Google goes on revising for some days, mostly how it sorts adverts' visits into channels. October was saved on 3
November, and today:

- Channels on Last month are up to 1% out. Organic Search shows 13,169 visits, and Google now says 13,211.
- The eye says "Cross-network lost 1,917 visits". Google now says 1,792.
- Last 12 months shows 395,867 visits against Google's 395,438.

### What changes

A finished week, month or rolling period is asked once at two days, as now, and once more at seven days. Then it's left.
The figures above come within a few visits of Google, as Last week's already are.

### Cost

One more set of asks per finished period. That's a few hundred tokens a week, against an allowance of 14,000 an hour.

## 4. The eye checked in code, not only told (both sections)

Answers written on 1 to 3 November guessed ("likely from a trade order", "likely hesitate over delivery costs"), talked
as Hakken ("our fastest-growing age group"), and wrote 29.8 as 29. Since 4 November the eye's instructions forbid
guessing, but nothing in the code checks.

**Do**, in the shared checker (`seesFrom`, `convex/utils/seesAsk.ts`), for every page:

- Send back a sentence that guesses a cause ("likely", "probably", "may be because", "suggests").
- Send back one that talks as Hakken ("our", "we").
- Send back a number that isn't its keyed figure rounded the usual way.

Test it with the three sentences above.

## 5. Say what each screen leaves out (Search Console)

- **Pages competing.** Its shares leave the home page out, and the screen doesn't say so. "handles" shows 44% on one
  page, while the home page took 88% of that search. Say the home page is left out, beside the shares and in the eye's
  words.
- **Indexing.** Pages not in Google went from 4 to 17 to 195 over 18 to 20 November, because more pages were being
  checked (2,277 of 14,563 so far). Show how many have been checked beside the chart. Also find out why the checks
  stopped with a sign-in problem on 19 and 20 November.
- **A period Google holds only part of.** Google has no days for More Handles from 11 August 2025 to 22 April 2026, so
  Last 12 months is seven months. When a period starts before the first day Google holds, say so on the screen, with the
  day.

## 6. Two small Analytics tidies

- **A channel's people.** They're added up across sources, so they're only roughly right (under 1%), and by design no
  screen shows them. Take them off the folded row, so Ask Hakken and the eye can't use them either.
- **The assistants' channel name.** Google now has its own "AI Assistant" channel. Hakken's "AI assistants" gives the
  same visits (876 against Google's 871 in October) under a different name. The rule is to use Google's own names.
  **Anthony's call**: Google's name, or keep "AI assistants".

## 7. What counts on More Handles, and a check for it

"What counts" for More Handles lists 12 events. In October they made 27,254 conversions from 35,739 visits, against
1,207 sales:

- **Each sale counts twice**, as purchase (1,205) and checkout_complete (1,218).
- **The basket counts**: add to basket 17,469 and begin checkout 5,885.
- **Six of the events never happen.**

Last week the home page showed a 100% conversion rate. Every conversion figure, rate and eye on Analytics reads this.

Changing it changes a client's account, so it isn't part of the build without Anthony's own yes. What I'd suggest:

- **Count**: purchase, contact_us_submit and newsletter_sign_ups.
- **Steps, not conversions**: add to basket and begin checkout. The shop screens already show those as steps.
- **A new tracking health check** (`googleAnalyticsHealth.ts`) for every website: two counted events that fire together
  for nearly every sale, or a basket step counted as a conversion.

## 8. Super admins no longer sent to Admin when the app opens

Anthony, 21 November 2026: "remove the auto redirect of super admins to the admin section on first load".

### What happens now

Sign-in lands everyone on the app's front page, `/app` (`DEFAULT_AUTH_REDIRECT`, `src/lib/authRedirect.ts`). The first
time a super admin opens that page in a browser tab, it sends them straight on to `/admin`, and notes in the tab that it
has (`admin_redirected` in the tab's session storage). After that, the front page stays put until the tab is closed.
It's one block in `src/app/(dashboard)/app/page.tsx` (lines 286 to 294). Nothing else sends super admins to Admin.

### What changes

A super admin lands on `/app` like everyone else, and goes to Admin from the menu when they want it. A link that names a
page (`redirectTo`, an emailed link) still opens that page, as now. Company admins and everyone else see no change.

### How

- Take the block out of the front page.
- Keep `router`, which the page's assistant buttons use. Keep the read of who's signed in only if something else on the
  page needs it.
- The note in the tab's storage is never written again. One left in an open tab does nothing.

### Tests

- A test that a super admin opening `/app` stays on `/app`, beside the existing sign-in redirect tests.
- Check in Chrome: sign in as Anthony, open `http://hakken.localhost:3000/app` in a new tab, and it stays on the app.

---

## Order

1. Fix 1 with fix 2: the biggest, and fix 2 depends on it.
2. Fix 3.
3. Fix 4.
4. Fix 5.
5. Fix 6.
6. Fix 7, only on Anthony's yes.

Fix 8 stands apart from the rest and touches none of their files, so it can go first, in under an hour.

Each fix is finished, tested and checked before the next starts. Nothing is committed until Anthony asks.

## Tests

- **Fix 1**:
  - A search shown for two pages counts its times shown once.
  - A keyword's position is Google's, not the average over its pages.
  - A period added up from days, and one from weekly pieces, each equal Google's whole answer.
- **Fix 3**: a finished period is asked at two days and at seven, never after.
- **Fix 4**: the checker sends back a guess, a self-reference and a wrong rounding.
- **Fix 5**: each screen's new line shows when it should, and not otherwise.
- **Every test that reads keyword figures** is updated.
- **More Handles' saved figures under `src/test/fixtures/`** are taken again from dev after fix 1's refill, so the
  eye's tests on every period run on the new figures. That covers Keywords, Tracked, Position bands, Click rate by
  position, Volatility, New and lost, Shown but not clicked and the keyword screen.

## Checks before handing back

- **Run both audits again**, on More Handles and Ronins, for all seven periods.
  - Search Console: the Keywords table's top 100, each week's bands, the click rate at each position, the brand split
    and the volatility day.
  - Analytics: Channels on Last month.
  - Every one should match Google. The scripts are kept from the audit.
- **Read every changed screen in Chrome**, at 3,200 wide and a laptop's.
- **Press the eye once on each changed screen** and read its words. That's about 10 presses at around $0.04 each, and
  I'll say the cost first.
- **Run the full checks**, GitHub's included (coverage and the smoke tests), before asking to commit.

## Before building

Another session is changing this folder now, including `convex/searchConsoleSync.ts`, which fix 1 changes too. I'd wait
for it to commit, or build in a separate copy.

## Built (21 November 2026)

On Anthony's "i want everything built", the same day. Uncommitted.

- **Fix 1**: built as planned. Google's keyword list is kept beside the pairs (`query`), every keyword figure is built
  from it once a website holds it for every day its pairs cover, and the 3, 6 and 12 months ask it in the same weekly
  pieces. Custom dates, other countries, and the mobile and desktop curves ask by keyword. The refill
  (`searchConsolePageRefetch.refetchSearches`) was started on dev the same morning, and each website's older chart weeks
  and months are worked out again from Google's keywords before its rebuild (`searchConsoleChartRefill.ts`). Found on the
  way: the 16-month fill counted a search past the top 20 only when clicked, a rule left from the keep rule that went on
  18 November. It now counts every search, as the nightly build does.
  Found on dev: More Handles' first rebuild stage took 440 seconds of the 420 a stage may take, as it worked every
  keyword out twice, from the pairs and from Google's list. A build now asks first whether Google's list covers every day
  the pairs do (`searchLinesCover`); where it does, the pairs give only the periods' pairs and swaps. Its months-and-
  quarters stage then ran 7 minutes 10 seconds of its 7, so the 12 months were never reached: the long periods' searches
  are now asked a week at a time, each week once for every period it falls in (`searchesInPieces`), before the pairs, and
  a long span before asks no pairs at all, as nothing reads its pages. The stages then took 5 minutes 11 seconds and
  3 minutes 23 seconds, and every list was rebuilt.
- **Checked against Google on More Handles after the refill**: Keywords' top 100 exact on Last month and Last week
  ("more handles" 96 clicks, 1,109 times shown, position 1.16), all 31,538 keywords; Click rate by position 6.36%,
  2.10% and 1.42% at places 1 to 3, as Google; each October week's Position bands exact (1,442 in the top 3 the week of
  5 October); Volatility's 19 November exact (166 keywords, 5 up, 19 down); Last 3 months' "more handles" 276 clicks,
  3,104 times shown, position 1.24, as Google. The eye on Click rate by position, pressed again: "Position 1 won 6.4
  clicks for every 100 impressions… grew from 4.5% in September, winning 261 clicks", 261 being Google's own.
- **Fix 2**: built. Shown but not clicked and Analytics' landing page stages set pages against pages.
- **Fix 3**: built. A finished period is asked at two days and once more at seven.
- **Fix 4**: smaller than planned. The checker already turned "our" into "your", and the rounding was right (the "29"
  was written from 3 November's figures). A sentence that guesses at a cause now goes back in code.
- **Fix 5**: built. Pages competing says the home page and searches for the website's own name are left out, on screen
  and in the eye's measure. Indexing's chart says its line rises as more pages are checked. Every screen says when the
  dates begin well before the first day Google holds. The checks' sign-in stop was a fault in the code: when the hour's
  token ran out mid-round, only the first page was asked again and the rest stopped the day. Each now waits for the one
  renewal.
- **Fix 6**: left as it is, both parts. A channel's people are under 1% out and shown on no screen, and the eye's Direct
  check reads the share of them who are new, which the overcount doesn't move: taking them off would lose that and fix
  nothing. Renaming "AI assistants" touches 24 files, Insights' words and saved figures among them, so it waits for
  Anthony's word.
- **Fix 7**: the health check is built: check 14 now also catches two events that nearly match every day (purchase and
  checkout_complete), and a new check 15 names a shop's steps counted as conversions. Changing More Handles' What counts
  itself was refused by Claude Code's safety check as a change to a client's account: Anthony makes it on the Connection
  page.

## What needs Anthony's word

1. Build fixes 1 to 5, in this order, and fix 8.
2. Fix 2: pages against pages (recommended), or the keyword rate.
3. Fix 6: Google's "AI Assistant", or keep "AI assistants".
4. Fix 7: change what More Handles counts, and add the health check.
