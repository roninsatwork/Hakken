# Agents and Microsoft Clarity — the Agents screen, a Clarity Collector, and Clarity's figures put right

**Planned 2026-10-16. Status: the Agents screen is drawn and liked (Anthony,
2026-10-16: "ok ty this is good"); Clarity's screens are drawn on
[Hakken — Microsoft Clarity](https://claude.ai/artifact/Gw4pfVgJ9SmyBRwq3q3MNJ)
for discussion; the Clarity parts may change. Nothing built. Waiting for
Anthony's go.**

## Where this came from

Anthony, 2026-10-16, on Microsoft Clarity (`/app/clarity`):

- "can you audit this section please — it's awful — it's mostly empty of data and
  it has visits but the UX of this entire section is total garbage"
- "do we need a Clarity agent to collect the data like we have already in other
  parts of the platform"

On the Agents screen (Admin → Agents → Manage Agents), showing Conterra's agents
list: "I think we also need to look at the agent overview screen itself … I do
love the layout — can we add to the canvas a redrawn version for this platform".
Then: "add the Clarity fixes to the plan we are creating with the new agents
stuff too".

Conterra's screen was the inspiration only. The drawing is Hakken's, with
Hakken's own fields and its 37 real agents, on the canvas
[Hakken — Agents](https://claude.ai/artifact/GESRM3sz1dJ6rkbn2HAyBR), drawn from
the drawing kit (kit.css `bbf2fe1eb729`) and passed by `npm run check:drawing`.
Change a decision here, with a date, before building anything that disagrees
with it.

## What the audit found (2026-10-16, ronins.co.uk)

Read from the stored rows and the running screens, not from the code alone.

1. **Every page is filed as the home page.** `clarityRowsFrom`
   (`convex/utils/clarityRows.ts`) never finds the page address in the rows
   Clarity sends for the URL breakdown, so each row falls back to `/` and
   overwrites the one before it. The stored days 12–15 Oct hold one page row
   each. Pages and Frustration show one row; "What Hakken sees" quotes `/` at
   19.2% scroll, which is whichever page Clarity listed last; Insights'
   conversion work (`convex/insightsConversion.ts`) reads the same rows. The
   device rows are right. Clarity keeps three days, so the page rows already
   lost cannot be asked for again.
2. **"Last 30 days" is four days.** Figures exist for 12–15 Oct (11 Oct is
   empty). 7, 30 and 90 days all show the same thing.
3. **One measure, different numbers.** Visits 238 (Overview, the list) and 248
   (Pages). Scroll depth 27.9% (Overview), 28.0% (the list rounds to a whole
   number first) and 19.2% (What Hakken sees).
4. **Dead clicks, rage clicks and excessive scrolling are 0 every day.** That
   is what Clarity sent. The only chart is a flat line, and the Frustration page
   is about nothing.
5. **Words that are wrong.** Connection says Clarity is asked twice each
   morning; it is asked three times. The time it was read is said twice, once
   to the second.
6. **What Clarity sends that Hakken throws away:** JavaScript errors, error
   clicks, bot visits, unique visitors and pages per visit; it can also split by
   traffic source, channel and country. Hakken uses 3 of its 10 asks a day.
7. **The screens.** Four thin pages for one screen of data; nothing compared
   (the period before, the website's average, a device); no chart on Pages
   or Devices; "Do first" advice that does not match what was found; "Open in
   Clarity" on every row goes to Clarity's home page; Frustration hides pages
   under 20 visits without saying so.
8. **Clarity's visits are probably not all people.** For 12–15 Oct Clarity
   counted about 60 visits a day; Analytics counted about 8 a day over the
   last 30 days. Clarity's answer carries a bot count beside its visits
   (`totalBotSessionCount`), which `clarityRowsFrom` ignores. To be checked
   against Analytics for the same days before any figure is trusted.
9. **Heatmaps and recordings stay in Clarity.** Anthony, 2026-10-16: "isn't
   Clarity famous for heatmaps and behaviour info". It is, but Clarity's export
   carries no heatmaps and no recordings. Microsoft's own Clarity connector
   ([clarity-mcp-server](https://github.com/microsoft/clarity-mcp-server))
   lists recordings by page, device, country or error, with links to watch
   them in Clarity; what it returns, and how its asks count against the ten a
   day, is to be checked before it is built on.
10. **Collection is a bare timer.** `clarity-morning` in `convex/crons.ts`.
   Search Console, Google Analytics and DataForSEO each collect through a
   Collector agent, with runs, logs, a switch and the step watch; Clarity has
   none of that, and a failure is one line on its Connection page.

## Part 0 — Clarity's data, normalised (CD1–CD8): built 2026-10-16, not committed

Anthony, 2026-10-16, after the screens were drawn: "we have to optimise the
data, normalise the data and optimised for speed and storage", then "lets
build it". Built the same day on branch `clarity-data` in the worktree
`.claude/worktrees/clarity-data`, away from the Auto Classify work in the main
checkout; not committed, not merged, nothing run against dev. The screens are
unchanged: they read the new records through the same queries.

Measured as Convex counts it (`getDocumentSize`), before building:

| A morehandles-sized website | Before | Now |
|---|---|---|
| Kept, per website | 40 MB (13 months of days) | about 4.5 MB |
| Pages kept a day | the 300 most visited | every row Clarity sends, up to 1,000 |
| A 30-day screen reads | 1.5 MB, 30 records | one period |
| A 90-day screen reads | 4.6 MB, 180 records | one period |
| Clarity's asks a morning | 3 | 2 |

At five times morehandles.co.uk (`convex/clarityScale.test.ts`: 90 days of
1,000 rows, 15,000 pages): the morning's 90-day build reads 4.4 MiB and holds
2.5 MiB; a 90-day Pages screen reads 1.6 MiB for 15,000 rows; Overview's
devices read 4.2 KiB. Each within half of Convex's 16 MiB a read and 64 MB a
query.

- **CD1. Read Clarity right.** `clarityTotalsFrom` (`convex/utils/clarityRows.ts`)
  finds the page's address whatever its field is called, and failing that any
  value that is an address — reading `URL` alone filed every page as "/". The
  query string is not a page of its own. Confirmed against Clarity's real
  answer by the first morning after it is merged; no extra ask spent.
- **CD2. People, not bots.** Clarity's bot visits are taken out of every
  visit count and kept as their own figure (CF6).
- **CD3. Totals, not averages.** Visits, scroll depth × visits, seconds
  engaged × visits, and the visits with each frustration or error, all whole
  numbers. Days add up by addition; every screen works its average from the
  same totals (CF4).
- **CD4. One packed record a day.** Each page on each device, and each device
  across the website, in one record (`clarityFigures`, span `DAY`), with its
  own book of addresses and devices and every figure a packed column
  (`convex/utils/clarityPacks.ts`). A page's total is its devices added up, so
  the separate by-page ask and its copy are gone: two asks a morning, not
  three — which is what the Connection page already says.
- **CD5. Ready-made periods.** Each morning, after the day is kept, the 7, 30
  and 90 days are worked out once, each in its own step (`rebuildFigures`,
  `buildSpan`): part 0 the website's figures and its days, then the pages in
  parts of 4,000, so no record nears Convex's 1 MiB. Screens and Insights read
  a period; nothing adds up days when a screen opens. A period says how many
  days Clarity recorded (CF3's "4 days so far").
- **CD6. History.** Days kept 90 days, the longest any screen shows; months
  kept 13, worked out while their days are kept and never redone from what is
  left (`tidyFigures`). Built as recommended, since Anthony said "lets build
  it" without choosing; one constant each (`CLARITY_DAYS_KEPT`,
  `CLARITY_MONTHS_KEPT`) if he wants days kept the full 13 months.
- **CD7. Insights reads the periods.** The counting check (Clarity's visits
  against Analytics', `insightsPeriod.ts`) reads the 90 days' website figures —
  now by people, bots left out; the money pages' behaviour
  (`insightsConversion.ts`) reads the 30 days' pages.
- **CD8. The old records converted.** `clarity:convertOldDays` turns the
  by-device records kept before into days of the new kind and deletes them
  all; the by-page ones are dropped, every page in them being "/". Then the
  old table (`clarityDays`) comes out of the schema in a step of its own.

Still to do for Part 0, each on Anthony's word: commit and merge into local
`dev` (his running `convex dev` then deploys it); run `convertOldDays` once on
dev; remove `clarityDays`; check the first real morning files pages under their
own addresses.

## Part 1 — Clarity's figures put right (CF1–CF5)

- **CF1. Each page filed as itself.** Read the page address from Clarity's URL
  rows correctly. One test ask (one of that day's ten) shows the field's exact
  name; its answer is kept as the test's fixture, so a change on Clarity's side
  fails a test rather than a screen. Pages are held from the day of the fix;
  the screens say so rather than showing the four lost days as one page.
- **CF2. Insights reads the right pages.** `insightsConversion.ts` needs no
  change of its own once CF1 lands; the week's Insights run after the fix uses
  real pages.
- **CF3. Honest days.** Until 7, 30 or 90 days are held, the screens say how
  many are: "4 days so far, since 12 Oct". A day with no figures (11 Oct) is not
  counted as a day.
- **CF4. One number per measure.** Visits and scroll depth come from one place
  for the list, Overview and Pages, weighted the same way; the list stops
  rounding to a whole number first.
- **CF5. The words.** "Asked three times each morning"; the time it was read
  said once, without seconds.
- **CF6. Visits are people's.** Bot visits are kept apart and left out of
  every figure, and the Overview says how many were left out. Checked against
  Analytics for the same days first (audit, item 8).

## Part 2 — the Microsoft Clarity Collector (CC1–CC6)

- **CC1. A Collector agent like the others.** A new role,
  `MICROSOFT_CLARITY_COLLECTOR` (`convex/utils/agentRoles.ts`), built as the
  Bing Webmaster Collector is: each run starts a run of its own for every
  website connected to Clarity. Runs, logs, its switch and its schedule are
  the ones every agent has; it is listed under Agents with the other
  collectors, and a website's Schedules page shows it as today.
- **CC2. One sender.** The agent's schedule replaces `clarity-morning`, so
  Clarity is never asked twice for the same morning.
- **CC3. Clarity's ten asks a day.** Each project's asks are counted per UTC
  day, and two are always kept in hand. "Run now" refuses once the day's asks
  are spent and says when they come back. A refusal from Clarity (429) is never
  retried in a loop: the run stops and the next day starts again (AGENTS.md,
  "Respect Google's quotas", applied to Clarity).
- **CC4. A missed morning caught up.** Clarity keeps three days. When a morning
  failed, the next run asks for two days and files the missed day as the two
  days less the day already held: visits exactly, averages and shares weighted
  by visits. Beyond three days a day is gone, and the screens show it as a
  missing day, not as a zero.
- **CC5. Somebody is told.** A refused token marks the connection Needs
  reconnecting and tells the company's admins in the bell, as Google Analytics'
  does. Nothing waits on a person to press a button.
- **CC6. Days filed once.** The ask made on connecting tests the token and
  shows the last three days as one block, marked as such; only the morning run
  files days, so no hours are counted twice.

## Part 3 — more of what Clarity sends (CM1)

- **CM1.** Keep JavaScript errors, error clicks, bot visits, unique visitors and
  pages per visit from the asks already made, and add two asks a day: by
  traffic source, and by page and browser (for Errors, CS6). Four of the ten
  asks a day (two since CD4), two kept in hand.
- **CM2. Recordings worth watching.** Each morning Hakken picks a few of
  Clarity's recordings — a phone visit that left a busy page within seconds,
  a visit that hit a JavaScript error, the longest read of an article — and
  lists them with a link to watch each in Clarity. Depends on the check in
  the audit, item 9; if the recordings can't be listed, the panel and the
  Recordings page go, and each page keeps its link to Clarity.

## Part 4 — Clarity's screens (CS1–CS9), drawn for discussion

Anthony, 2026-10-16: "I think we need to remake the UX of the screens in a
canvas too please as it's very dull and boring at the moment", then "let's
draw it on the canvas and we can discuss it". Asked whether it plays to
Clarity's strengths, and shown that combining it with Search Console and
Analytics would: "we can't combine screens in Clarity, Insights is for that —
we need this section only to show the strength and power of Clarity".

Drawn on [Hakken — Microsoft Clarity](https://claude.ai/artifact/Gw4pfVgJ9SmyBRwq3q3MNJ)
from the app's real parts and charts, laid out as Google Analytics' approved
Overview is: four boards, Overview, Pages, a page's own screen
(`/ai-agency/`) and Errors. Copies and pictures are in
[docs/plans/assets/agents-and-clarity/](../assets/agents-and-clarity/).
ronins.co.uk's pages and titles are real; every figure is an example of a
kind Clarity measures, until CF1 and CF6 land. Not yet approved.

- **CS1. Only what Clarity measures.** Every figure, sentence and comparison
  on these screens is Clarity's own: against the 30 days before, the whole
  website, a page group, a device, a source or a browser. No other source's
  figure, panel or link; joining Clarity with Search Console or Analytics is
  Insights' work (`observations-direction`).
- **CS2. The menu.** Clarity: Overview, Pages, Recordings, Errors; Settings:
  Connection. Devices and Frustration stop being pages of their own: they
  become the Overview's "Phones and computers" and "Where visitors get stuck".
  The header is Analytics' compact one, with Every device and the dates.
- **CS3. Overview answers "where do visitors give up?"** What Hakken sees,
  its steps naming the page, the heatmap, the error or the recordings; eight
  figures against the 30 days before (visits with bot visits left out,
  scrolled on average, time engaged, went straight back, visits with an
  error, pages a visit, dead clicks, rage clicks); how far down visitors
  scroll day by day; then, highest because they are the most to act on,
  errors visitors hit and recordings worth watching; then pages where
  visitors give up, how far each page group is scrolled, phones and
  computers, where visitors came from (each source its own line, as Clarity
  names it), and where visitors get stuck — a "None in 30 days" is said as
  good news, not drawn as a flat chart.
- **CS4. Pages.** How far down the ten busiest pages are scrolled, as bars,
  under a quarter in orange, too few visits faint; then the table with its
  search row and chips (Page group, Scrolled), its bar and Download CSV: page
  and title, visits, scrolled, change, engaged, went back, errors, and each
  page's heatmap link. A row opens the page. No page group on a table's rows
  (Anthony, 2026-10-16: "we don't need page classifications on tables like
  this"); the Page group chip still narrows the list.
- **CS5. A page's own screen.** What Hakken sees for the page; visits,
  scrolled, time engaged and went straight back, each against the 30 days
  before and the website; how far down it is scrolled day by day against the
  website; its errors by browser and device; its recordings; phones and
  computers on it; where its visitors came from. "Open its heatmap in
  Clarity" sits in its header.
- **CS6. Errors.** JavaScript errors and the clicks that set one off: four
  figures against the 30 days before, visits with an error day by day, errors
  by browser as a share of each browser's visits, and the pages with errors,
  each with the browser and device it mostly happens on and its recordings.
  Clarity splits its figures by browser, so a fourth ask a day (page by
  browser) is needed; CM1 counts it.
- **CS7. Honest scrolling.** Clarity gives a page's average scroll depth, not
  how many people stop where, so the screens say "scrolled 21.3% of the way
  down on average", never "most visitors see only the top fifth".
- **CS8. "Open in Clarity" opens that page's heatmap**, or the link goes to
  the project if Clarity has no address for one page's heatmap.
- **CS9. No hidden limits.** A page, device, source or browser with fewer
  than 10 visits is shown with its figures greyed and "Too few visits to
  judge" on hover, never left out; the table says so above its rows.

## Part 5 — the Agents screen (AG1–AG6), drawn

Board: [Hakken — Agents](https://claude.ai/artifact/GESRM3sz1dJ6rkbn2HAyBR); a
copy is in [docs/plans/assets/agents-and-clarity/](../assets/agents-and-clarity/).

- **AG1. Filters down the left.** The section's side menu
  (`SectionMenu`) used as filters, each group with its count, the counts
  following the other choices:
  - **What it does**: Collecting data, Insights team, Tasks and alerts,
    Assistant and research, Writing and sending, Wiki staff, Platform.
  - **When it runs**: On a schedule, In the Insights team's run, When
    something happens, When someone asks, Never on its own.
  - **Status**: Active, Working now, Draft.

  The choices stay in the page's address. `SectionMenu` lights one item for
  the whole menu today; it gains one lit item per group, an extension said so
  in a comment, not a second menu.
- **AG2. Where an agent's group comes from.** Its role (`systemKey`), in one
  map beside the roles in `convex/utils/agentRoles.ts`; no new field on an
  agent. An agent made with New Agent and given no role is listed under "Your
  own agents", a group shown only when there is one.
- **AG3. The table.** Agent (its name, and its description on one line, cut
  with "…", the whole of it on hover), What it does, Runs, Model (the model,
  "Platform default" beneath), Status, and the settings cog. Sorted by its
  headings; 15 rows a page; the search finds a name or a description.
- **AG4. Runs, from the record.** A scheduled agent's time is its schedule's
  ("Daily 04:00"); a built-in job's comes from the same constants `crons.ts`
  uses ("Every 15 minutes", "Nightly"), so the screen cannot disagree with
  what runs. A paused schedule says so: "Every hour, paused" (the Outbox's
  schedule is paused today).
- **AG5. Today's faults, fixed on the way.** The footer reads "Showing 1–15 of
  15" beside "Page 1 of 2" when there are 37 agents; every Insights agent
  shows its name twice (its role's name is the same words); descriptions are
  cut at 300px. The delete icon shows only on an agent a person made: built-in
  agents and agents holding a role are never deletable.
- **AG6. Left out of Conterra's layout, for Anthony to confirm.** The Sort
  drop-down (Hakken sorts by its headings), the "List / By country" switch (it
  would be a new part), and the round robot picture before each name, which
  the drawing leaves out.

Also seen: no Bing Webmaster Collector agent exists, though its role does.

**Built 2026-10-16, not committed** (Anthony: "yes please", then "we need to
build the agent stuff"), on branch `agents-screen` in the worktree
`.claude/worktrees/agents-screen`:

- The map of what each agent does and when it runs: `convex/utils/agentWork.ts`,
  every role and wiki staff member in it, and each timer it names checked
  against `crons.ts` by `agentWork.test.ts`.
- The filters on the server: `agents.getPaginatedAgents` takes What it does,
  When it runs and Status and narrows before it pages, so the list still pages
  on the server — the rule `src/pagination-drift.test.ts` holds for every admin
  inventory since 2026-06-02 ("a list that silently stops at the cap"), kept
  rather than loosened. `agents.getAgentFilterCounts` gives each choice's count
  and the exact total, and says when the catalogue's limit of 500 was reached.
- `SectionMenu` lights one choice a group when given `currentIds`, and a phone
  gets a drop-down a group (`SectionMenu.test.tsx`).
- The screen (`admin/agents/page.tsx`): the drawn layout; Runs from the
  Schedules page's own wording, a paused schedule said so; the model with
  "Platform default" beneath when inherited; delete only on an agent a person
  made. Its look is held by `agentsLook.test.tsx`
  (`docs/plans/assets/agents-and-clarity/look/Agents.txt`).
- One change from the drawing: the headings don't sort. The list pages on the
  server in the order agents were made, and sorting by a heading would mean
  reading every agent on each page; the filters do that job.


## Order and size

| Step | What | Man-days |
|---|---|---|
| 0 | CD1–CD8 — Clarity's data normalised (built 2026-10-16; merge, convert dev, check the first morning) | 2 |
| 1 | CF1 — confirm each page is filed as itself on the first real morning (read in CD1) | 0.25 |
| 2 | CF3, CF5 on the screens — honest days and the words (CF4, CF6 done in CD3, CD2) | 0.5 |
| 3 | CC1–CC6 — the Clarity Collector | 2 |
| 4 | CM1–CM2 — more of what Clarity sends, and recordings worth watching | 1.5 |
| 5 | AG1–AG6 — the Agents screen (built 2026-10-16; commit and merge on Anthony's word) | 2 |
| 6 | CS1–CS9 — Clarity's screens, as drawn once approved | 4 |
| | **Total** | **12.25** |

Each step is built, tested and shown on its own; nothing is committed or
pushed until Anthony asks.
