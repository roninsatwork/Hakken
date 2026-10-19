# Auto Setup — one button writes a company's setup

**Planned 2026-10-19. Status: built on dev 2026-10-19 (go given the same day: "Go"), not committed; see "Built".**

## Where this came from

Anthony, 2026-10-19:

- "i would like to add a new feature - its an automated assistant button for
  the company. It will look at the company, the competitors added and create
  wording for all the boxes that need to be added to ensure collection is
  setup. things like Market - descriptions etc"
- Asked whether it would "access the internet to research their websites and
  find better wording": "yes to both" (read the websites, and search the web).
- "should be a new agent in the agents section so we can track costs and
  observability and cost control"
- "draw Auto Setup on a canvas with the real screens and write the plan. Don't
  build anything yet."

The screens are drawn on the canvas [Auto Setup](https://claude.ai/artifact/KTVyyBaVwbgkMzDAWwXdLW):
ten boards from the real screens' code, with National Extension College's real
websites and rivals from the local data. A copy of the boards and their
pictures is in [docs/plans/assets/auto-setup/](../assets/auto-setup/). The
wording on the boards (names, profile, searches, questions, costs) is an
example of what Auto Setup would write, not its output. Change a decision here,
with a date, before building anything that disagrees with it.

## What there is to fill today

Read on 2026-10-19 (the research behind this plan):

- Nothing checks whether a website is "ready to collect". The only hard stop is
  the company's **Collect data** switch; every other box left empty only makes
  the results weaker.
- National Extension College, added that day: nec.ac.uk and 8 rivals, and
  every box below empty.

| Box | Where | What reads it | Auto Setup |
|---|---|---|---|
| Brand names (own website and each rival) | Names and profile | AI answers are counted by them; Brand radar, share of voice, Search Console's brand split | Writes |
| Sector, Where it sells, What the business does (own website only) | Names and profile | The AI judgments: real competitor, Auto Classify, fan-out page judge, Insights | Writes |
| One-line description, About this company | Overview tab | The team and the assistant only | Writes |
| Google searches | Tracked keywords | Rank checks; none means no rank checks | Writes, up to 25 |
| AI questions | Your prompts | AI answers; none means none are bought | Writes, up to the website's limit (10 today) |
| Where it trades | Market | Which countries Search Console and Analytics keep | Writes only when the site says so plainly |
| Collect switch, schedules, limits, Google/Bing/Clarity connections, local listings | Schedules, Limits, client screens | Collection itself and spend | Never: listed for a person in its report |

A rival has names only: Hakken never keeps a business profile for a
competitor ("A competitor's business is not this company's to describe",
`convex/holdProfiles.ts`).

## What it is (AS1–AS12)

- **AS1. Its own agent.** Auto Setup is a system agent in Agents, listed under
  Collecting data beside Auto Classify (boards 7–9). Its model comes from the
  stored settings, never a name in the code. Its settings hold the internet
  switch (on), a spend cap per run ($2 by default) and its on/off switch.
- **AS2. A cap per day too.** Agents' cap per day exists today only for the
  DataForSEO Collector. Auto Setup gets one ($10 a day by default), shown on
  its settings. *Not drawn yet.*
- **AS3. Only when pressed.** One press on the company's Websites tab sets up
  the whole company: its own website or websites and every rival (board 1). No
  schedule, and adding a company or a rival never starts it.
- **AS4. Only empty boxes.** It never changes what a person wrote. Pressing it
  again fills only what is still empty, such as a rival added since.
- **AS5. It says what it wrote.** Each box it fills says so underneath, in the
  words Auto Classify already uses: "Hakken wrote this from nec.ac.uk's … pages.
  Change it any time." (boards 4, 10). Each search and question it adds says
  where it came from ("Written by Hakken · rivals rank for it: …", "· from a web
  search") and "by Auto Setup" under its date (boards 5, 6). When a person
  changes the box, the line goes.
- **AS6. What it reads.** Up to 6 pages of the company's own website (home,
  about and its main sections, found from the sitemap Hakken already reads) and
  each rival's home page, through the page reader Hakken already has. The text
  is read for this run and not kept; only the wording it writes is saved. *New:
  until now Hakken has never sent a client's page text to a model for this.*
- **AS7. What it searches.** Up to 10 web searches a run, through the agent's
  internet switch: how people name the business, what students and parents
  (customers) ask, and how they phrase their searches.
- **AS8. What the rivals rank for.** The rivals' Google rankings where Hakken
  already holds them (a website already in the system brings its history), else
  one rankings lookup per rival, the first 100 rows, through the DataForSEO
  operation the Collector uses, so the result is kept for collection too and
  never bought twice. About $0.02 a rival at DataForSEO's list price; the first
  build step checks that against the bill.
- **AS9. How it writes.** Plain customer words in UK English; searches as people
  type them, questions as people ask them; profiles saying what the business
  sells and to whom. The same rules as the rest of Hakken's advice: one voice.
- **AS10. It never switches collection on,** and never changes a schedule, a
  limit or a connection. Its report ends with what is left for a person
  (board 3).
- **AS11. It hands itself on.** It works in steps that book the next, judged
  alive by its last step, with the watch that restarts a lost step, as Auto
  Classify and the Collector do (AGENTS.md: no queue waits on a person). A cap
  reached stops it cleanly and says so.
- **AS12. Everything is counted.** Each run records what it read, searched,
  wrote and spent: model, web searches, page reads and rankings, each on its own
  line (board 8). Page reads are not costed anywhere today; this adds it.

## Limits, said up front

| Limit | Default |
|---|---|
| Pages read from the company's own website | 6 |
| Pages read per rival | 1 (its home page) |
| Web searches a run | 10 |
| Google searches written per website | 25 (the website's own limit is 1,000) |
| AI questions written per website | the website's prompt limit (10 today) |
| Rankings rows per rival | 100 |
| Spend a run | $2 |
| Spend a day | $10 |

## The steps (about 6 days)

1. **The agent** (½ day): Auto Setup as a system agent, listed under
   Collecting data and run "When someone presses Auto Setup"; its model from
   the stored settings; the internet switch, the cap per run, and the cap per
   day extended to it.
2. **Starting, steps and the watch** (1 day): the button's start, its steps
   handing on, its status for the screen, and the watch, on Auto Classify's
   pattern (`convex/autoClassifyStart.ts`, `autoClassifyRun.ts`).
3. **Reading and searching** (1 day): the pages through the existing page
   reader, with its cost recorded; web searches through the provider's search,
   within the limit. Checks first that a single model call can use web search
   the way the agent runtime does.
4. **Rival rankings** (½ day): stored rankings first, else one lookup per rival
   through the Collector's operation, inside its caps.
5. **Writing** (1 day): names, profile, company description and About,
   searches and questions; only into empty boxes, each marked as written by
   Hakken with where it came from. New fields to mark them: who wrote each
   profile box and the company's description and About, and who added each
   search and question and from what. Searches and questions go through the
   company's own lists (`convex/holdLists.ts`).
6. **Screens** (1 day): the line and button on Websites (boards 1–3), the
   "Hakken wrote this" lines (boards 4, 10), the source lines (boards 5, 6), the
   agent in Agents (boards 7–9); English and Italian; look tests for each board.
7. **Tests and the full gate** (1 day): only empty boxes; never a person's
   words; only when pressed; caps stop it cleanly; nothing collected or
   switched on; then the local check and GitHub's steps.

## To decide before building

1. **Agents' Run Agent button for Auto Setup.** Recommended: not offered there;
   the agent's page says to start it from a company's Websites tab. (Auto
   Classify's Run Agent sorts every website; for Auto Setup that would spend on
   every company at once.)
2. **Where it trades.** Recommended: written only when the site says it plainly
   (a .ac.uk address, prices in pounds), and named in the report so a person
   checks it. *Not drawn.*

## Not drawn

- The cap per day on Auto Setup's settings (AS2).
- Where it trades on the Market screen (decision 2).

## Built (2026-10-19)

Everything above is built, with Anthony's two recommendations taken
(decision 1: Agents' Run Agent says where Auto Setup starts and does nothing;
decision 2: where it trades is written only when the site says so plainly,
named in the report).

- **The agent** — `convex/utils/autoSetupAgent.ts` (definition and every
  limit), made and kept by `ensureAutoSetup` with web search on, $2 a run,
  $10 a day and no approval wait; listed under Collecting data
  (`convex/utils/agentWork.ts`). Its cap per day shows on its Settings beside
  the Collector's (`AgentFormSections.tsx`, `dailyCap`).
- **Start, status and the watch** — `convex/autoSetupStart.ts`: the button's
  `startAutoSetup`, `autoSetupStatus` for the Websites tab, `answerAgentsRun`
  for Agents' Run Agent, and the ten-minute watch (`auto-setup-watch` in
  `crons.ts` and `jobLedger.ts`). One row a company: `autoSetupRuns`
  (`convex/autoSetupSchema.ts`).
- **The steps** — `convex/autoSetupRun.ts` reads up to six of each own
  website's pages, makes at most two web searches a website and ten a run,
  reads the rivals' rankings Hakken holds or buys each once through the
  Collector's own request (filed as a DataForSEO pull, read by the Collector's
  parser, so it is kept and shown on Sites), then asks the agent's model to
  write; rivals are named eight to a step. `convex/autoSetupSteps.ts` writes
  only empty boxes, each marked as Hakken's with what it was written from
  (`hakkenWrote` on profiles and companies, `writtenFrom` on searches and
  questions, `searchConsoleCountriesBy`); a person's change takes the mark off.
- **Screens** — Auto Setup's line on the Websites tab
  (`websites/_components/AutoSetupNotice.tsx`), the "Hakken wrote this…"
  lines under Names and profile, Overview and Market, the "Written by Hakken
  · …" line under searches and questions with "by Auto Setup" under a
  question's date (`_components/useAutoSetupWords.ts`), and Auto Setup's
  agent page with no Run Agent. English and Italian.
- **Prices not reported by a service** — a page read is costed at
  `FIRECRAWL_COST_PER_PAGE_USD` (default $0.001, Firecrawl's Standard plan per
  credit) and a web search at `WEB_SEARCH_COST_USD` (default $0.035, the
  dearest provider's published price), so the caps are never reached late.
  Set both to the account's real prices.
- **Tests** — `convex/autoSetup.test.ts` (starting, refusals, only empty boxes,
  marks and their removal, rivals kept, a whole run with the reader, web and
  model stood in for, the cap stopping it), `convex/utils/autoSetupText.test.ts`,
  `AutoSetupNotice.test.tsx`, the agent page, and the look test
  `websites/autoSetupLook.test.tsx` holding boards 1 and 3
  (`docs/plans/assets/auto-setup/look/`).

- **Its own page, 2026-10-19** — Anthony: the button on All websites was "a
  bit hidden… add this to the left hand nav under collection", then "change
  COLLECTION to SETUP", then "this looks nasty". Auto Setup is now the first
  item under **Setup** in the Websites menu (`websitesSection.ts`), opening
  `…/websites/auto-setup` (`auto-setup/AutoSetupScreen.tsx`), redrawn and built
  as boards 1–3: the page's orange **Run Auto Setup** in its header, one box
  saying what is empty and a run's limits (or its progress, or what it cost and
  left for a person), and **What it fills** — a row for the company and each
  website, each box Empty, Filled or By Hakken with how many. The box is off
  All websites. Look tests: `docs/plans/assets/auto-setup/look/Main.txt`,
  `Running.txt`, `Done.txt`.

- **First live run, 2026-10-19** — Anthony pressed it for National Extension
  College: 2 min 41 s, $0.33, and every empty box was filled (4 names, the
  profile, GBR, the company's description, 25 searches, 10 questions, names
  for 8 rivals; 8 rivals' rankings bought at $0.024 each). But "the progress
  bar is not there and nothing is changing in the table": the bar counted
  whole websites, and nec.ac.uk's step — pages, two web searches, eight
  rankings and one 67-second writing call — took 2½ minutes, so it sat at
  nothing and the table changed only at the end.
- **A bar that moves, and what it is doing — 2026-10-19** — Anthony: "the bar
  moves with each piece of work and says what it's doing, and names,
  profile, description and countries are saved straight after the web
  searches". A run now counts its pieces of work when it starts (`ownPieces`,
  `rivalPieces` in `utils/autoSetupAgent.ts`: each website's pages, each web
  search, its names and profile, each rival's rankings, its searches and
  questions; each eight rivals' home pages and names) and the bar moves with
  each (`autoSetupRuns.pieces`, `piecesDone`); the line under it says what it
  is on now ("Now: looking up wolseyhalloxford.org.uk's Google rankings (3 of
  8)."; `doing`, `stepProgress`). The writing is two calls: names, profile,
  home countries and the company's description are written and saved straight
  after the web searches (`writeOwnProfile`), then the searches and questions
  once the rankings are read (`writeOwnLists`). The second call is sent the
  pages again, so a website costs a few cents more in model use (estimated,
  not yet measured).
  Questions are still saved with the searches, not with the profile.

Not checked live: a run with the moving bar — every box on NEC is filled now,
so a press there has nothing to do and nothing has been run since.

