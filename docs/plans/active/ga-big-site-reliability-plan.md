# Google Analytics — reliable on big websites

**Planned 2026-10-15, Anthony's go the same day** ("Go. Write the plan and
build all five fixes, including the two-year fill waiting for the night").
Status: **built 2026-10-15** on `dev`, local commit, nothing asked of Google
while it was built. Korda's first night is the real test (BR8).

## Why

Anthony connected Korda's Search Console and Google Analytics on
2026-10-15. Korda and a second large website are about to be switched on,
and he asked whether the Analytics data is normalised and optimised: "this
is something that I want to be confident of".

**What Ronins measures today** (dev database, 2026-10-15):

| | ronins.co.uk |
|---|---|
| A night's pull | 967 asks to Google, 34,921 rows, 1 h 22 min (most of it the hour's wait for age and gender) |
| Google's allowance | about 2,150 of Hakken's 14,000 tokens in its busiest hour; 88 of the 120 age and gender asks |
| Everything held | about 3.8 MB: days 0.7, weeks and months 0.6, each page over time 0.9, ready-made lists 1.6 |
| Pages in a year | 156 |

The data is normalised to the standard set on 2026-10-14
(ga-stored-figures-plan.md SF12–SF16). The screens are tested at 45,000
pages. **The nightly pull is not**, and three things break on a big
website:

1. **Memory.** Convex gives a step of the default runtime 64 MB. A row as
   Hakken holds it takes about 630 bytes (measured), so 100,000 rows are
   60 MB; one answer of 100,000 rows from Google is about 30 MB of text and
   80 MB once read. A big website's widest lists (each page by country, by
   the page before, the pages a visit saw, over 12 months) reach 100,000
   rows and more.
2. **The two-year fill.** It starts by itself after a website's first
   collection, in the daytime; one that stops part-way starts again from the
   beginning the next time, so on a big website it may never finish and
   spends the allowance each time.
3. **Connecting.** On 2026-10-15 Korda's events could not be read from
   Google at 11:11 ("Google busy"); nothing tried again, and the screen said
   "Reading…" until it was retried by hand.

## Decisions

- **BR1 — Connecting tries again by itself.** When reading a property's
  events fails for any reason but "this account can't read it", Hakken asks
  again after 5 minutes, then 30, then 2 hours, then every 6 hours until it
  reads. Google's own words are kept (`problemDetail`), and the screen says
  what happened and when Hakken tries next — nothing for anyone to press.
  The same goes for a connected website whose events are read again before
  its night's collection.
- **BR2 — Google's answers read 25,000 rows at a time** (was 100,000), at
  most 20 pages an ask (500,000 rows, as before), each handed on as it
  arrives rather than all held, and an ask Google stops part-way carries on
  from the page it reached rather than from the start.
- **BR3 — A page list trimmed while it is read.** Once more than 50,000
  rows are held for a list, each page keeps its 100 biggest rows (five times
  the 20 stored) and the rest is added into its "other" row at once; the 20
  are chosen at the end, as now. Sums stay whole. Below 50,000 rows nothing
  changes, so small websites store exactly what they do today. A website
  above it loses only rows past a page's 100th, which were already folded
  into "other"; a page's "viewed next" list, read the other way, can miss
  some of those.
- **BR4 — The collection's steps run in Convex's Node runtime**: 512 MB a
  step instead of 64 MB, so a 15,000-page website's widest list (about
  150,000 rows, 95 MB) fits with room to spare. A step already stops itself
  after 4 minutes, inside the Node runtime's 10. It costs a little more of
  Convex's action compute, which is billed by memory and time.
- **BR5 — Each page's own figures asked in pieces sized to the website**:
  as many months, weeks or days an ask as keep the answer near 30,000 rows
  (`PAGE_ROWS_PER_ASK`), worked out from the pages viewed in its last 90
  days — ronins.co.uk's 95 pages a whole span an ask, as before; Korda's
  1,400 about seven units an ask; a 15,000-page website a month, a week or
  a day an ask. The night's new days the same way.
- **BR6 — A fill carries on where it stopped.** Each fill notes how far it
  has got after each piece (`fillsReached`, per country and list); the next
  time starts there. A fill hands itself on every 4 minutes, as the
  collection does, so no fill meets a runtime's limit.
- **BR7 — The two-year fill waits for the night** (Anthony, 2026-10-15,
  replacing "both" of 2026-10-14 for new websites filling themselves at
  once): connecting brings the last 90 days and the ready-made lists
  straight away, as now; the two years start only after the 01:00 run. Inside
  the night (the 4½ hours after the run began) a fill that spends the hour's
  budget waits for the hour, as the run does; past it, it stops, and the
  next night's run starts it again where it stopped.
- **BR8 — Proof before Korda.** Counted, not timed, on every push: Google's
  answers asked 25,000 rows at a time and carried on from the page reached;
  the most rows a list holds while read stays bounded on a big website's
  widest answer; a fill resumes where it stopped and waits for the night;
  connecting tries again by itself. Then Anthony saves Korda's conversions,
  and its first night is checked together the next morning.

## Limits, each a number in the code

| Limit | Value | Where |
|---|---|---|
| Rows in one answer from Google | 25,000 | `REPORT_PAGE_ROWS` |
| Answers an ask reads at most | 20 (500,000 rows) | `MOST_REPORT_PAGES` |
| Rows held before a page list is trimmed | 50,000 | `TRIM_ABOVE` |
| Rows a page keeps while read | 100 | `TRIM_KEEP` |
| Rows a page keeps when stored | 20 | `PAGE_TOP_ROWS` (unchanged) |
| Rows one ask of each page over time is kept near | 30,000 | `PAGE_ROWS_PER_ASK` |
| Connecting's tries | after 5 min, 30 min, 2 h, then every 6 h | `READ_AGAIN_MS` |
| A step's time | 4 minutes | `STEP_BUDGET_MS` (unchanged) |
| A night | 4½ hours from the run's start | `NIGHT_MS` (unchanged) |

## Not in this plan

- How many tokens a big website's ask costs: measured on Korda's first
  night, read from Google's own count. The run already paces itself to it.
- Rows written to the database a night: a big website rewrites its
  ready-made lists every night, as Ronins does (796 lists); to read on
  Convex's usage page after Korda's first week.

## Phases

| Phase | What | Man-days |
|---|---|---|
| 1 | BR1, connecting tries again by itself; the screen says so | 0.25 |
| 2 | BR6, BR7, the fills: resumed, handed on, waiting for the night | 0.5 |
| 3 | BR2–BR5, memory: answers handed on, page lists trimmed while read, the Node runtime, each page a day at a time | 0.75 |
| 4 | BR8, the proof; the full gate with GitHub's steps | 0.5 |

**Total: about 2 man-days.**

## Built — 2026-10-15

- **BR1** (`googleAnalyticsConnect.ts`): `readWhatCounts` hands a failure to
  `readFailed`, which keeps Google's words (`problemDetail`) and asks again
  after `READ_AGAIN_MS`, noting when (`readAgainAt`); a retry stops itself
  once another property is chosen or the events are read. An account that
  can't read the property goes to "connect again", nothing asked again. The
  choose-what-counts screen says what happened, Google's words and when
  Hakken asks next, in English and Italian.
- **BR2** (`googleAnalyticsApi.runReport`): 25,000 rows an answer, at most
  20; with a sink each answer is handed on as it arrives and nothing held,
  and an ask Google stops part-way carries on from the page it reached
  (`pagesRead`, `googleAnalyticsCollect.ask`).
- **BR3** (`googleAnalyticsPageLists.ts`): each shared page list is added up
  as it arrives (`heldRows`, and `listJoiner` for a list joined from two
  asks), and cut to each page's 100 biggest once 50,000 rows are held. A row
  already folded into a page's "other" never takes one of its top places
  (`topPerPage`), so the 20 stored are the same as from the whole list.
  `topPerPage` also groups a page's rows in one pass: it copied them each
  row, which on a page with 20,000 rows was 200 million copies.
- **BR4** (`googleAnalyticsSteps.ts`, "use node"): the run's step and both
  fills run in the Node runtime; what each does stays beside its section
  (`collectSiteStepHandler`, `fillHistoryStep`, `fillPageHistoryStep`).
- **BR5** (`googleAnalyticsPageSeries.ts`): `unitsPerAsk`, `pageFillPieces`,
  the night's page days sized the same way.
- **BR6** (`fillsReached`, `googleAnalyticsFillAfter.ts`): each fill notes its
  place with each piece it writes and starts after it; a fill hands itself on
  after 4 minutes (`fillStops`). A website's figures cleared, or a home
  country taken off, clears its places.
- **BR7**: a site run started by the night's run carries `night`;
  `finishCollection` starts the fills only then (`nightFrom`), and a fill
  that spends the hour's budget inside the night waits for the hour. By hand,
  on Anthony's go: `npx convex run googleAnalyticsFillAfter:startFills
  '{"connectionId": "…"}'`.
- **BR8**: `googleAnalyticsBigSite.test.ts` (answers 25,000 at a time and
  resumed; a 200,000-row list never past 75,000 held, its top 20 and sums as
  from the whole; the steps in the Node runtime), `googleAnalyticsFills.test.ts`
  (fills wait for the night, resume, wait for the hour; pieces sized), and
  the connecting retries in `googleAnalyticsConnect.test.ts`. The tests that
  read two years now run the first night's fills (`collectedWebsite`).

Decided while building, in the plan's spirit:

- **Connecting keeps asking every 6 hours** after the third try, rather than
  stopping, so no website waits on a person to press anything (AGENTS.md).
- **Each page's fill sized to the website** (BR5) rather than a day at a
  time for every website: ronins.co.uk's fill goes from 64 asks to 16,
  where a day at a time would have been about 560.

## Change log

- 2026-10-15 — Built (see "Built").
- 2026-10-15 — Planned and approved (Anthony: "Go").
