# Search Console — collect on connecting, and fill its 16 months

**Planned 2026-10-15. Status: built on dev 2026-10-15, not committed (see "Built").** Anthony said "Don't
build until I say."

## Why

Korda connected kordatackle.com's Search Console on the morning of 15 October.
Its screens said "Connected, with nothing collected yet", because the first 90
days only come in on the Collector's 04:00 run, the next morning. Analytics,
connected at the same time, started collecting at once. A run was started by
hand at 15:13 to get kordatackle.com's 90 days.

Anthony asked "does search console not perform a full collect on first
connection", then said: "Yes, plan Search Console starting on connecting and
filling its 16 months, like Analytics. Don't build until I say."

## What this reverses

These decisions of `search-console-plan.md` §12 and §14.3 item 7 (Anthony,
2026-10-02) change:

- **"Nothing starts collecting: connecting … collects nothing."** The first
  90 days came "on the Collector's next scheduled run".
- **"Nothing older is fetched."** Phase 9 of `insights-intelligence-plan.md`
  already overtook this on 2026-10-12, with "go back 16 months", for the main
  country's daily totals.

Two things stay as they are:

- **Collecting stays the Collector agent's job,** seen in its runs and the
  Collection pipeline. Nothing is collected by a hidden job.
- **Rule 2 of `keep-less-history-plan.md` stays.** Google keeps 16 months of
  Search Console and answers again for free, so Hakken doesn't copy every
  keyword and page line. Those are asked of Google when a screen needs them,
  as now.

## What is there today (2026-10-15)

- **Connecting starts nothing** (`searchConsoleConnect.ts:208-213`). A website
  waits for the 04:00 run, which takes its last 90 days, then the newest days
  each night after.
- **Most of the 16 months already reaches the screens.**
  - Once the first 90 days are in, the **main country's daily totals** are
    fetched back to Google's 16-month line, once. These are clicks,
    impressions, click rate and position (`searchConsoleHistoryDays.ts`). So
    are the **Position bands and Brand charts'** weeks and months, inside the
    charts' reach.
  - The **lists** (Keywords, Pages and the rest) for 90 days and 12 months are
    asked of Google weekly, back to the 16-month line. Any other dates are
    asked live.
- **Not filled back today:**
  - the countries kept ready beside the main one
  - New and lost, which counts from when collecting began
  - Volatility
- **No budget for Google's limits.** Search Console has none of Analytics'
  quota reading or budget. Google's limits are 1,200 asks a minute per website
  and per Google account, plus a heavier "load" limit measured over ten
  minutes and a day. When Google says it is busy, a run tries twice more, then
  stops.
- **The 16-month fill is one hidden action.** It has no steps, no pacing and
  no lines on the agent's run. If the first 90 days started on connecting, it
  would start in the daytime, which Analytics stopped doing on 15 October
  (`ga-big-site-reliability-plan.md` BR7).

## What it would be (SF1–SF6)

- **SF1. Collect on connecting.** When Search Console is connected, the
  Collector starts that website's own run at once: its last 90 days for the
  main country, then each country kept ready. This applies whether it was
  connected on its own, by choosing another property, or through an
  Analytics sign-in.
  - It is a run of the agent, titled "Search Console: <website>", like the
    nightly ones. It copies Analytics' `startFirstCollection`.
  - If another website's run is going, it tries again every 5 minutes, as the
    main-country switch already does (`collectSwitched`).
  - If the agent is switched off, nothing starts, and the screen says the
    first 90 days come with the agent's next run.
- **SF2. The 16 months fill straight after the first 90 days** (changed
  2026-10-15, see Decided 2). The fill is the last stage of the website's
  own run, after its days are in.
  - It goes one ask at a time, each piece a line on the run.
  - A run cut short leaves what it fetched. The next run carries on, asking
    only for what isn't held yet.
- **SF3. What the fill brings.**
  - What phase 9 fills today: the main country's daily totals and the charts'
    weeks and months.
  - The same for **each country kept ready**.
  - Never the per-day keyword and page lines (rule 2).
  - New and lost and Volatility are Anthony's call (Q3).
- **SF4. Kept inside Google's limits.** Search Console gives no "allowance
  left" reading like Analytics' does, so the budget is a fixed pace.
  - At most a fifth below Google's per-minute limit, and pieces spread across
    the night.
  - When Google says it is busy, the fill waits 15 minutes and carries on,
    never retrying in a loop (AGENTS.md, "Respect Google's quotas").
- **SF5. The screens say it is filling.** Performance shows one line while the
  fill is going, for example "Filling its 16 months: back to 3 June so far".
  - The Connection page's History row is reworded. It still says "kept for 90
    days, then as weeks; after 12 months, as months", which stopped being
    true on 2026-10-07.
  - The new line is drawn and approved before it is built.
- **SF6. Records kept true.** These are updated in the same build:
  - `search-console-plan.md` §12 and §14.3, with a dated change
  - the tests "connecting collects nothing" (`searchConsole.test.ts:419-428`)
    and "nothing comes back by itself" (`:874`)
  - the out-of-date comments and words

## Build — five phases, about 3½ days

| Phase | What | Days |
|---|---|---|
| 1 | **Collect on connecting (SF1).** All three ways of connecting start the website's own run. It tries again every 5 minutes while the agent is busy, and says so when the agent is off. The two "collects nothing" tests flip. | ½ |
| 2 | **The night's fill, paced (SF2, SF4).** The fill starts after the 04:00 run, in steps that are lines on the agent's run, at a fixed pace a fifth under Google's limit. When Google says it is busy, it waits 15 minutes. It carries on from where it stopped. | 1 |
| 3 | **Countries kept ready (SF3).** Each country kept ready gets its daily totals and chart weeks and months back to the 16-month line. Performance reads them for that country. | ¾ |
| 4 | **The screens say it is filling (SF5).** The Performance line and the Connection page's History wording are drawn first, approved, built, and given a look test. | ¾ |
| 5 | **Records and checks (SF6).** The plans, comments, words and tests are made true, then the full local checks run. | ½ |

## Cost and time

- **Cost:** none. Google charges nothing, and no model is called.
- **The first 90 days:** seven to forty minutes, depending on the website's
  size.
- **The 16 months:** one or two nights.

## Decided (Anthony, 2026-10-15: "Yes to all three recommendations. Keep it as a plan until I say build.")

1. **Collect on every kind of connecting:** connecting on its own, choosing
   another property, and Search Console connected through an Analytics
   sign-in.
2. ~~The 16 months wait for the night.~~ **Changed 2026-10-15, same day:**
   the fill runs **straight after the first 90 days**. It is paced, shown as
   lines on the website's own run, and carries on with the next run if cut
   short. There is no waiting for the night. (Anthony: "Fill straight after
   the first 90 days, paced, with lines on the run, carrying on if cut short.
   No waiting for the night.")
   - Why it changed: kordatackle.com's 16 months of day totals filled within
     minutes of its first 90 days, through the phase-9 fill. Search
     Console's fill is small, unlike Analytics' two years of page lists, so
     BR7's reason doesn't apply. Waiting would only make a new website's 16
     months arrive the next morning.
3. **What is filled back:**
   - the main country's day totals and chart weeks and months, as now
   - the same for **each country kept ready**
   - **not** New and lost or Volatility, which count from when watching began

Building waits for Anthony's "build".

## Built (2026-10-15, on dev, not committed)

Anthony: "lets build this now". Then, on the drawing of the three screens
([canvas](https://claude.ai/artifact/UhBACniHQYKePsgj8jKkUX)): "Yes, the
three screens are right. Build them, and also fix the adding-up so big
websites hand on, and build kordatackle.com's web lists."

- **SF1, collect on connecting** (`convex/searchConsoleFirstCollection.ts`):
  - `connectTo` starts the website's own run, or does so after another
    property's figures are cleared (`clearFigures`, `collectFirst`).
  - The run is a run of the Collector Agent, through `beginSiteRun`, which
    is shared with the nightly run.
  - The nightly run's turn check (`takeCollectorTurn`) counts only the
    Collector's own runs, never a website's. Its list (`agentCollections`)
    leaves a website whose own run is going to that run.
  - Nothing starts when the agent is missing or switched off.
  - There is no "try again in 5 minutes": a website's run goes alongside
    others, so it never has to wait.
- **SF2–SF4, the 16 months** (`convex/searchConsoleHistoryFill.ts`):
  - The fill is the last stage of every website run, from `collectSiteStep`
    to `fillSiteStep` to `afterDays`. It is no longer started from a step's
    end.
  - One ask a second.
  - When Google is busy, it waits 10 minutes, three times at most, then
    leaves the rest to the next run.
  - Each scope is a line on the run. A scope is marked whole (`daysFrom`)
    only once every ask for it is in.
- **SF3, the countries kept ready:**
  - each country's `countriesHeld` entry carries its own `daysFrom`, kept as
    new days join
  - `writeHistoryDays`, `chartFillOf` and `writeChartPeriod` take a country
  - Performance reads a country's days back to its `daysFrom`
- **SF5, the screens:**
  - Performance shows the line "Google's 16 months are still coming in: the
    days shown start on {day} for now" while the scope read isn't whole.
  - The nothing-collected notice reads "Collecting its last 90 days now"
    while the website's own run is going.
  - The Connection page's History and Collected rows are reworded.
  - The status gains `historyWhole` and `collectingNow`, and
    `countriesNewest[].daysFrom`.
- **The adding-up that hands on** (not in the plan; asked for once it
  showed):
  - kordatackle.com's web settle job ran past Convex's ten minutes and died,
    so its web lists were never built and its run never ended.
  - Now each kind is a chain of jobs (`settlePart` `stage`): the short
    periods, then the 90 days and those before, then the twelve months.
    Each job has a seven-minute budget and stops itself between pieces past
    it (`RanLong`). What it didn't reach keeps what was built before.
  - Google's weekly answers are added in as they come (`addRowsInto`), never
    all held at once.
  - The long periods read only whether any line is kept (`anyKept`), not
    the 60 days.
  - A settle older than 45 minutes counts as dead (`settlingNow`), so it
    never blocks a screen's catch-up or the next settle.
- **Tests:**
  - `convex/searchConsole.test.ts`: connecting starts a run, the agent
    switched off, the nightly run not stopped by a website's run, Google busy
    during the fill, the chain of three jobs, a job stopping itself
  - `convex/searchConsoleCountriesKept.test.ts`: a country kept ready's own
    16 months
  - `convex/searchConsoleSettling.test.ts`: a dead settle
  - the Search Console screen tests, for the line and the notice
