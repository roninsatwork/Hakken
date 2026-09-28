# Sites — fixing what the screen audit found

**Started 2026-09-26. Status: agreed 2026-09-26, F1–F4 as recommended; built and checked in Chrome 2026-09-26, not yet committed (§9).** Change a
decision here, with a date, before building anything that disagrees with it.
Follow `AGENTS.md`: no code until Anthony agrees.

Anthony asked for the Sites screens to be audited again "before we proceed",
and on reading what was found: "Yes please sounds like we need to fix a lot".
On the plan and its four recommendations: "ok go ahead with teh build".

Progress: **all four phases built, tested, and checked in Chrome on Korda and
Ronins (§9)**; the commit is what remains, and one new question (G1). Estimated
at about eight working days in four phases (§7).

## 1. How the audit was done

- Every one of the 36 Sites screens, the Sites list and the record screens
  behind them, opened in Chrome on dev with Korda's and Ronins' data. No screen
  showed an error.
- Three read-only reviews of the code behind them, one per third of the menu.
  Every finding below was checked against the code before it went in.
  **Seen** marks what was also seen on screen.
- Clean: sorting, downloads, company privacy (every list read through the
  company's own hold), the places data is read by, and the Italian
  translations.

## 2. Phase 1 — fix first: they break or mislead today

**1.1 A competitor's page can crash.** Organic competitors links any website
the company holds; the competitor's page then asks for its comparison, and the
server refuses a website outside the site's group, so the error page replaces
the screen instead of its own "not found" note. A company with two owned sites
reaches it (a.com's search finds b.com). *Fix*: link, and look up, only the
websites in the site's group (`site.rivals`); an address naming another shows
the page's own note. *Size*: an hour. (`competitors/organic/page.tsx`,
`competitors/rival/page.tsx`, `sharedSearches` in `convex/siteRecords.ts`.)

**1.2 A keyword's "Position over time" is empty unless the search is on the
company's tracked list** — **seen** on every Korda keyword. It says charts
"fill in as more checks run"; they never will. Since the private lists
(e256fb38) the chart reads only tracked searches, so no screen can learn that
another company checks a search one by one. *Fix* (decision **F1**): chart any
search the site ranks for from the positions its own keyword lists recorded —
facts DataForSEO sends about the website to whoever asks — never from another
company's one-by-one checks; a tracked search keeps its daily line. Each stored
position names the request that filed it, so the two can be told apart.
*Size*: half a day. (`searchPositions`, `convex/siteGoogle.ts`.)

**1.3 The movement figures contradict each other** — **seen**. On Korda's
24 September, "New and lost" says 824 new, 594 up and 715 down, repeated on
25 September; its "See the keywords that moved" opens Wins and losses, which
says nothing moved; the Calendar says 2,545 new. New and lost shows
DataForSEO's own counts "since its last update" across everything the site
ranks for; Wins and losses and the Calendar compare our own checks. Position
bands and Search features have the same fault: their newest counts are
DataForSEO's whole-site figures but open the keywords we hold, which can be
fewer (foxint.com: 1,199 ranked, 947 held). *Fix* (decision **F2**): "moved"
means our own check-to-check comparison on every screen, so a number and the
list it opens always agree; a site's first check reads as its first check, not
as everything new; DataForSEO's own counts, where kept, are labelled as
theirs and open nothing. *Size*: half a day.

**1.4 A competitor's rows on "Your searches" freeze at the last check that
found it.** A "checked, not found" row is only written for the website whose
list tracks the search — the owned site — so a competitor that drops out of
the top 100 keeps showing its old place as though current (its row still says
"5 · Page one", dated weeks back). *Fix*: where the owned site was checked
more recently than the competitor was found, the competitor reads "Not in the
top 100" as of that check — on Your searches and on the keyword's record.
Worked out when read, so nothing is re-collected. *Size*: half a day.
(`searchStandings`, `listSearches`, `convex/siteGoogle.ts`; `keywordRecord`,
`convex/siteRecords.ts`.)

**1.5 Labels break onto several lines at laptop width** — **seen**: "Too /
early / to / tell", "Not in the top 100" and the headings on Your searches.
Today's cut-short change gave the name column all the spare width, squeezing
the rest. Also on Paid keywords, a page's searches and a competitor's shared
searches. *Fix*: a status pill never wraps (the kit's `StatusPill`), and those
four tables give the name column a fixed share, as the others do
(`CUT_COLUMN.first`). *Size*: an hour or two, checked in Chrome at laptop
width.

## 3. Phase 2 — figures that are wrong or misleading

**2.1 A run that finishes after midnight UTC splits its own day.** List pages
are dated by the day the run started; the everyday keyword request by the day
it finished. When they differ, the newest "ranking day" holds only the
everyday request's hundred or so keywords, so Wins and losses and its menu
count show only their moves, and "compare with" offers that day, on which
every other keyword reads "Not in the top 100". Ronins runs daily at
23:00 UTC, so it can happen now. *Fix*: every request in a run is dated by the
day the run started. *Size*: half a day.

**2.2 Paid keywords shows a slice as the whole.** Adverts are filed only from
the everyday request, a hundred rows of every kind, so "450 searches with
adverts" can open a table of 9, or one saying the site "does not appear to buy
Google adverts". Unknown volume, visits and cost are stored and shown as 0.
*Fix* (decision **F3**): say what the table holds ("9 of the 450, from the
everyday check"); never say the site does not advertise while the totals say
it does; unknowns show "–". *Size*: half a day.

**2.3 "Where links come from" reads too high.** Each breakdown keeps its top
15 entries, and the shares are worked out over those 15, while the page says
it lists every group. Links from 40 countries, the top 15 holding 80%: every
share is a quarter too high. Link attributes overlap (one link can be
nofollow and noopener), so their shares are not of links at all. *Fix*: keep
the full total when a breakdown is filed and show the rest as "Everything
else"; attributes as a share of all links. Older filings, without the total,
say "of the largest 15". *Size*: half a day.

**2.4 Suggested competitors: the count and the list disagree, and it suggests
websites the company already holds.** The menu leaves out every website the
company holds; the page only leaves out the site's group, and adds up to ten
websites the AI answers name. The company's other own site can be suggested,
and can never be added. *Fix*: one rule for both — nothing the company holds,
anywhere — and the menu counts what the page lists. *Size*: a quarter day.

**2.5 The Overview's AI panel shows dashes when the newest day has no AI
answers**, though the day before has them (a crawl-only day, or a run whose
AI requests failed). *Fix*: an empty day is filled from the newest day with
answers, as every other headline figure already is. *Size*: an hour.

**2.6 "Last checked" is when a request was planned, not when data came
back.** A run in progress, or one whose every request failed, moves it on, and
the Sites list shows a time for a site whose header says "Not checked yet".
*Fix*: the newest request that came back. *Size*: a quarter day.

## 4. Phase 3 — limits no client is near yet

**3.1 The AI chart lines count only a website's first 200 questions, across
every company — and past that, one company's list can remove another's AI
history.** The site rebuild reads the first 200 questions asked about a
website by anyone; a list outside them goes uncounted, and its day rows are
removed as unclaimed each time the window is rebuilt. It feeds the owned
site's AI figure in the menu and the Sites list, the Overview, the Calendar and
the Mentions chart. (The AI summaries plan expected its build to cover this;
it did not — `sites-ai-list-summaries-plan.md` §7, found 5.) *Fix*: each list
counted on its own, in batches, never touching another list's rows.
*Size*: a day. **Recommended now**, because it loses data rather than being
slow.

**3.2 Full answers offers only a list's first 200 questions**, and opens the
first question instead of the one asked for past that; its download leaves
the rest out without saying so, as does Sources cited's. *Fix*: offer the
whole list; a question not on it shows a "not found" note; downloads say when
they are cut. *Size*: a quarter day. **Recommended now.**

**3.3 Fan-out queries fails from about 600 questions**: four reads per
question, one per engine whether asked or not, and two more per search shown.
**3.4 Suggested competitors fails at a thousand questions**: one read per
question and engine (`loadQuestionRows`). **3.5 Side by side fails at a
thousand tracked searches with about 30 competitors**: one read per search,
and up to a hundred per competitor. *Fix* (decision **F4**): for 3.3 and 3.5,
a guard now — read up to a limit and say when the list is longer — and a
summary per list, like the AI one, when a client gets near the size; for 3.4,
keep the most-named websites outside the group in the list's AI summary, so
the page reads one row. *Size*: a day and a half; the speed test gains all
three at their limits.

## 5. Phase 4 — small ones

| # | What is wrong | Fix |
|---|---|---|
| 4.1 | Who ranks above you: "Lower on page one" also takes positions 11–100 | Positions 4–10 only |
| 4.2 | Every search, or every question, paused: those pages hide their history behind "not set up", while the menu still shows counts | Paused still counts as set up; the page says everything is paused |
| 4.3 | Long date ranges show a week's Monday or a month's 1st as the day checked; New and lost links says "Week of" for months | The real check day; "Month of" |
| 4.4 | Site structure stops at 300 folders without saying so | Say when it is longer |
| 4.5 | "Change since" disappears when the day before the dates holds only a crawl | Compare with the newest earlier day that has each figure |
| 4.6 | Mentions and Full answers name the same answer differently when it both recommends and warns | One order everywhere: warned first, as Mentions reads it |
| 4.7 | Full answers keeps an engine filter it does not apply when the question does not ask that engine | Clear it |
| 4.8 | A competitor's Calendar never shows AI, and its Overview reads "1 of 0" per assistant | "Named in 1 answer", no "of" for a website that asks nothing |
| 4.9 | A zero for "not known yet": Mentions "0 of 0" before an engine has answered, the Overview's pages before any answer, Side by side "0 of 100 searches" for a competitor with no positions | "–" or "Not asked yet" |
| 4.10 | Content gap and a competitor's shared searches mean different things by "ranks for" | Ranking at the latest check, both |
| 4.11 | Side by side: its download's "Top 3" differs from the Sites list's; its chart draws only five competitors while saying it shows the group | One count; draw all, or say which five |
| 4.12 | Backlinks summary: with no link data in the dates, two figures fall back to today's while two show "–" | The same rule for all four |
| 4.13 | Link quality: "Nofollow linking websites" opens a list filtered another way, with another total | Open the list that count describes |

*Size*: about a day and a half together.

## 6. Decisions for Anthony

| # | Question | Decision (agreed as recommended, 2026-09-26) |
|---|---|---|
| F1 | A keyword's chart (1.2) | **Chart every search the site ranks for from its own keyword lists**; one-by-one checks only for the company's own tracked searches. The alternative keeps it tracked-only and says so on the chart. |
| F2 | What "moved" means (1.3) | **Our own check-to-check comparison everywhere**, so each number matches the list it opens; DataForSEO's own counts, where kept, labelled as theirs and opening nothing. |
| F3 | Paid keywords (2.2) | **Say plainly what the table holds**, and nothing more. Buying the full list of adverts would be a new DataForSEO request on every run — a separate decision, not recommended now. |
| F4 | The limits (3.3–3.5) | **A guard now, summaries later**: the pages say when a list is longer than they read, and get their own per-list summary when a client nears the size. |

## 7. The work

| Phase | What | Days |
|---|---|---|
| 1 | Fix first: 1.1–1.5 | 2 |
| 2 | Wrong or misleading figures: 2.1–2.6 | 2 |
| 3 | Limits: 3.1 and 3.2 now; 3.3–3.5 guarded | 2¾ |
| 4 | Small ones | 1½ |

About **eight working days**. No DataForSEO runs: every fix works from what is
already stored, and new filings pick up 2.1 and 2.3 as they arrive. Each phase
can be built, checked and committed on its own; phase 1 first.

## 8. How it is proven

- Each fix gets a test that fails before it and passes after, on data shaped
  like the case that found it.
- The speed test gains Fan-out queries, Suggested competitors and Side by side
  at their limits.
- In Chrome, on Korda and Ronins, before and after, at laptop width: the
  screens marked **seen** first.
- The full local gate and the build before anything is committed.

## 9. Built — 2026-09-26

Every item in phases 1–4 is built, each with a test shaped like the case that
found it: `convex/siteAuditFixes.test.ts` for the server and
`src/app/(dashboard)/app/sites/[siteId]/siteAuditFixes.test.tsx` for the
screens. Nothing here calls DataForSEO; every fix reads what is already stored.

**Phase 1** — seen in Chrome on Korda and Ronins at laptop width.
- 1.1 Organic competitors, the Market map, Side by side and a competitor's
  page link and look up only the site's group (`site.rivals`).
- 1.2 (F1) A keyword's chart draws every search the site ranks for from its
  own keyword lists, and a tracked search's one-by-one checks as well — never
  another company's (`searchPositions`).
- 1.3 (F2) New and lost counts our own check-to-check moves, as Wins and
  losses and the Calendar do. DataForSEO's own counts are **no longer shown**
  there, rather than kept and labelled: two sets of numbers for one question
  read as a contradiction whatever their labels. A site's first check reads
  "First check · N searches" and counts no moves (`firstCheckDay`). Position
  bands and Search features open their keywords only when the list held is
  the whole list, and otherwise say how many of the total are held. Found in
  the Chrome check of phase 4: ronins.co.uk's history, filled in from the
  archive a month a row, goes back to 2019, and the first check was looked
  for only in a site's first sixty rows, so its 23 September read "101 new".
  It is now looked for from the day the website was first seen.
- 1.4 A competitor on the company's searches reads as of the list's newest
  check, on Your searches, the keyword's record and Side by side
  (`asOfListCheck`).
- 1.5 A status pill never wraps; the four tables give their name column a
  fixed share (`CUT_COLUMN.first`).

**Phase 2**
- 2.1 Every request in a run is dated by the day the run started (`runDayOf`,
  `convex/seoRunDay.ts`), for keyword checks, lists, links, the crawl and AI
  answers. Filings made before the fix keep their day.
- 2.2 (F3) Paid keywords says "N of the M, from the everyday check"; the
  summary never says the site does not advertise while a check counted adverts;
  unknown volume, visits and cost are left out when filed and show "–".
- 2.3 Countries, domain endings and kinds of link keep an "Everything else"
  row, so shares are of all links; platforms and attributes, which overlap,
  are shares of all links and say so; older filings say "of the largest 15".
- 2.4 One rule for the menu and the page: nothing the company holds is
  suggested (`pickSuggestions`).
- 2.5 A day holding an empty AI list is filled from the newest day with
  answers (`newestOfEach`).
- 2.6 "Last checked" is when the newest request came back with data.

**Phase 3**
- 3.1 Each company list's AI lines are counted on their own, ten questions a
  read, and written into that list's rows only (`convex/siteListAiDays.ts`).
- 3.2 Full answers offers the whole list; a question not on it shows a note;
  the answers and Sources cited downloads say when they are cut.
- 3.3 (F4) Fan-out queries reads only the engines a question asks, up to
  2,000 question-and-engine pairs, and says when the list is longer.
- 3.4 The list's AI summary keeps the fifty most-named websites outside the
  group (`othersNamed`), so Suggested competitors reads one row. Summaries
  written before this have none until the list is recounted: re-run the
  `2026-09-26-list-ai-summaries` migration on each deployment. Re-run on dev
  on 26 September: no answer there yet names a website outside its group, so
  Suggested competitors lists only those found ranking.
- 3.5 (F4) Side by side shares 2,500 lookups among the competitors and says
  on how many searches each is compared.

**Phase 4**
- 4.1 "Lower on page one" is positions 4–10.
- 4.2 A list with everything paused is still set up: its pages keep their
  history, with a note that nothing new is coming.
- 4.3 The day checked is the real check day; New and lost links names its rows
  by day, week or month, as the dates are stepped.
- 4.4 Site structure says when a site has more than the 300 folders it shows.
- 4.5 "Change since" takes each figure from the newest earlier day that has
  it (`dayBefore`), on the Overview and the Calendar.
- 4.6 One order for an answer that recommends and warns: warned first, on
  Mentions, Full answers and the answers download (`answerStance`).
- 4.7 Full answers clears an engine filter the question does not ask.
- 4.8 A competitor's Calendar and Overview say "Named in N answers".
- 4.9 "–" for what is not known yet: Mentions before an engine has answered,
  the Overview's pages before an assistant has, and Side by side for a
  competitor with no place on any search compared.
- 4.10 The content gap counts what each side ranks for at its own latest
  check, as a competitor's shared searches do.
- 4.11 Side by side's Top 3 is the Sites list's; a group of more than five
  draws the five with the most traffic, and the charts on Side by side and
  the Overview say so.
- 4.12 The Backlinks summary's four figures by one rule: as each stood at the
  end of the dates.
- 4.13 "Nofollow linking websites" opens the live linking websites with a
  nofollow link, through a new "Link type" filter on Linking websites.

**Seen in Chrome, 2026-09-26**, on Ronins and on Korda (switched back to
Ronins Agency after): the change since on every Overview figure; a
competitor's "Named in 1 answer" on its Overview and Calendar; Side by side's
"–" for chilliapple.co.uk, placed on none of the four searches compared, and
Korda's chart naming the five of its eleven competitors it draws; Site
structure, the content gap, all four backlinks figures for dates holding no
link count, "Month of" on New and lost links, Nofollow linking websites
opening 94 live linking websites against DataForSEO's count of 97, Full
answers, Fan-out queries, and Korda's paid search agreeing on no adverts.

**Found in the Chrome check — G1, for Anthony.** The day a site's whole
keyword list first arrived after days of only the everyday hundred reads as
hundreds of new searches: ronins.co.uk "706 new" on 26 September, and
lightflows.co.uk "654 new". They are not new rankings; the list simply held
them for the first time. It happened once, to the sites first checked before
their whole lists were bought, and would again if a company's keyword limit
were raised. Recommended: count the first day a list holds its whole length
as a first check, as 1.3 does for a site's first check. Not built: it changes
what "new" means, so it waits for his word.

**What differs from the plan, and what is left**
- **The speed test** gained Suggested competitors at a thousand questions,
  and Side by side and the Overview's extras at twenty-five and a thousand.
  Fan-out queries, Side by side at thirty-one competitors and Your searches at
  a thousand searches are held to their limits in small tests (3.3, 3.5)
  instead: at those sizes the test's in-memory backend took 276 seconds,
  which says nothing about the real one.
- `loadQuestionRows` — one read per question and engine — is no longer read
  by any Sites screen, but still is by `websiteMoves` and the admin client
  view. Neither is near the limit; it is the next per-list summary if one is.
- The commit, when Anthony says; and G1.

## 10. Three Keywords screens redesigned — 2026-09-27

Anthony, on Position bands, New and lost keywords and Site structure: "i
think the UX is not great on all of them". Three designs each were drawn in
the app's dark style with Ronins' and Korda's real figures; he chose two of
each to combine — "position bands i am torn between b and c and love them
both … new and lost … like a and B … site structure i like B and A" — and on
the combined drawings: "these are good let build these please".

**Position bands (B + C).** Page one first: how many searches sit on it, the
top 3 and 4–10 under it, each opening its searches; page two, the closest to
page one, opening its own; further down. A line of the three over time. Then
what moved between the bands at the newest check, in a sentence and a grid
from each band to each, every square opening the searches that made that move
on a screen of its own (`keywords/bands/moved`, back to Position bands); the
searches that changed band, the most searched first; and the searches at
positions 11 to 13. The counts are now the site's own keyword list's — the
list a band opens — where they were DataForSEO's count across everything the
site ranks for (ronins.co.uk's top 3: 27 where DataForSEO said 61; most of
the difference is likely G2 below). Checks before the whole list was first held covered
only the searches checked on every run; they are left out of the bands, and
the page says so. (`convex/siteBands.ts`.)

**New and lost keywords (A + B).** The newest check and what it covered —
the first check, the whole list for the first time, the whole list, or the
everyday check, and how many searches. Searches gained above the line and
lost below it at each check, with the net beside each bar. The newest check's
new, up, down and lost searches as four tabs, each listing its searches the
most searched first — the list Wins and losses shows. Then every check in the
dates with its counts and net. "See the keywords that moved" is gone: the
list is on the page. (`convex/siteChecks.ts`.)

**Site structure (B + A).** A map of the folders, each sized by its visits,
searches or pages, its colour the stronger the more of its searches are in the top 3, each
opening its pages. Then every folder with its share of the site's searches
beside its share of the visits, the most visited first.

**G1, settled by the design.** The day the whole list was first held is a
start, like a site's first check: its searches are counted as held, never as
new — on New and lost keywords, Position bands' grid, the charts' moves and
the Calendar, which now reads "Whole list, first time · N searches" that day
(`checkStarts` in `convex/siteFigures.ts`).

**Where the build differs from the drawings.** The page-one figure is drawn
at the size of every other Sites figure rather than larger. New and lost's
"compared with the check before" line names the newest check rather than
opening a picker: only the newest check's searches are kept one by one, so an
older check could show its counts but not its list. Wins and losses is
unchanged; New and lost keywords' list of moves is its own table, with the
searches a month.

**Shared parts.** `SiteGainLossChart` and `SiteTreemap` beside the other Sites
charts; a page's second table keeps its order and page under keys of its own
(`tableKey`, `docs/developer/screen-kit.md`).

**G2 — still for Anthony.** Our positions count every result on Google's
page, the boxes such as "People also ask" among them; DataForSEO's band
counts, and Ahrefs', count only the ordinary results. So a search 3rd among
the ordinary results can be 5th by our count, and ronins.co.uk has 27 searches
in the top 3 by ours against 61 by theirs. The menu's top-3 count, the
Overview and the Sites list still show DataForSEO's; Position bands now shows
ours. Recommended: store the ordinary-results position beside ours and count
the bands by it everywhere, so every screen agrees with the tools clients
compare against. Not built: it changes what a position means.

## Change log

- **2026-09-26** — Plan written from the screen audit: all 36 Sites screens in
  Chrome on Korda and Ronins, and three reviews of the code behind them.
- **2026-09-26** — Agreed, F1–F4 as recommended; building.
- **2026-09-26** — Built, phases 1–4, each fix with a test (§9). New and lost
  shows only our own moves rather than labelling DataForSEO's; the speed test
  holds three of the limits in small tests instead.
- **2026-09-26** — Checked in Chrome on Korda and Ronins. The check found the
  first check missed for a site with years of archive history (fixed, with a
  test) and G1, the first whole-list day read as new searches (not built;
  for Anthony).
- **2026-09-27** — Position bands, New and lost keywords and Site structure
  redesigned as Anthony chose from the drawings (§10). G1 settled by the
  design: the whole list's first day is a start. G2 found: our positions and
  DataForSEO's band counts measure different things.
