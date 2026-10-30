# Build plan — the Conversions page, the eye's speech bubble, and the stronger Insights team

**Started 2026-10-30. Status: written at Anthony's request ("I want a plan to
build all of it"); not yet approved to build.** One plan for everything
decided on 2026-10-30, in build order, with days. Follow `AGENTS.md`. The
decisions live in three places and are not repeated here:

- the canvas "Conversions page, three ways"
  (https://claude.ai/artifact/DexG7cSzEhELxzFvLahQbs), boards Main,
  Conversion and Sees, which are the binding drawings;
- [sees-conversion-specialist-plan-2026-10-30.md](sees-conversion-specialist-plan-2026-10-30.md)
  (S1–S12: the bubble, written by the Insights team through the Head);
- [stronger-agents-plan-2026-10-30.md](stronger-agents-plan-2026-10-30.md)
  (A1–A6: tools, model, rules, memory, second look, evals).

## How long

**About 20 working days of agent work**, phase by phase below. Phases 1 to 4
are screens and can run as overnight builds; 5 and 6 are agent work and need
Anthony's eye on the words. Run as two sessions side by side (screens, then
agents), it is about 12 calendar days.

| Phase | What | Days |
|---|---|---|
| 1 | The standard website header on every section | 1 |
| 2 | The Conversions page as drawn | 2 |
| 3 | A conversion's own screen, with "When people convert" and its collection | 3 |
| 4 | The speech bubble from the eye in the top bar | 1 |
| 5 | The eye asks the Insights team through the Head | 3 |
| 6 | Stronger agents (A1–A6) | 9 |
| 7 | Measuring, costs and the full gate | 1 |
| | **Total** | **20** |

## Phase 1 — the standard website header (1 day)

Decided on the canvas 2026-10-30 (memory "standard-website-header"): the
website's name row, then one row with "Updated <date>" on the left and the
filters on the right (country, device, the Dates menu, the chart step); no
property line, no "figures to" line; the eye in the top bar, not beside the
title.

- `src/ui/components/screens/PageHeader.tsx`, `TitleSwitch.tsx`,
  `DatesMenu.tsx`; the top bar `src/ui/components/layout/Header.tsx`;
  `HakkenSeesEye.tsx` moves from the headers to the top bar and keeps its
  tooltip and "2 new".
- Rolled out to every section with a website header: Google Analytics,
  Search Console, Bing Webmaster, Microsoft Clarity and Discovery
  (`src/app/(dashboard)/app/{analytics,search-console,bing-webmaster,clarity,sites}`).
- Done when: every section's header is the same part; a drift test fails a
  section that draws its own; `npm run check:guards` passes.

## Phase 2 — the Conversions page (2 days)

Board "Main". `src/app/(dashboard)/app/analytics/[siteId]/conversions/page.tsx`
and its parts in `src/ui/components/screens/` (`ConversionsMap`,
`ConversionsOverTimeChart`, `ChartExplorer`).

- Four figure boxes, each with the month before: Conversions, Purchases (the
  website's top conversion), Conversion rate, Added to basket.
- "Visits it took for one purchase, day by day".
- The map, as built, with its hover and click-through to the pages behind a
  square.
- The table: "13 events" on its bar; columns Event, Conversions, Visits,
  Worth, Change; search box; a row opens the conversion's own screen.
- The description under the title: "Sales, sign-ups and the other things that
  count. How many, and where they came from." The line above the table:
  "Each row is a Google Analytics event this website counts as a conversion.
  Click one to see it on its own."
- Done when: the page matches the board at 1440 and on a phone; a look test
  holds the box order and words; `messages/en.json` and `it.json` in parity.

## Phase 3 — a conversion's own screen (3 days)

Board "Conversion". The event screen
(`src/app/(dashboard)/app/analytics/[siteId]/events/event`) becomes the
conversion's screen, opened from the table.

- Detail header with "Back to Conversions"; four boxes: the conversion's
  count, visits that did it, conversion rate, worth, each with the month
  before.
- "<Conversion>, day by day", then "<Conversion> a day, a line per channel".
- **"When people convert"**: hours across, a line per day of the week, tick
  boxes, the readout hover, Count and Compare menus. Its data is not
  collected today: the Google Analytics Collector gains one list per website
  (conversion × day of week × hour, for the dates kept), asked in the night
  run under the quota rules in `AGENTS.md`, never by hand. One day of the
  three is that collection and its tests.
- Done when: the screen matches the board; the new list fills from the night
  run on ronins.co.uk and morehandles.co.uk; no screen asks Google.

## Phase 4 — the speech bubble (1 day)

Board "Sees", S6, S11.

- `HakkenSeesEye` in the top bar opens a bubble under it, tail on the eye,
  over the page (`absolute right … top-full mt-3`, the bell's panel style in
  `src/ui/components/layout/NotificationBell.tsx`), closed by the eye or a
  click outside. `HakkenSees` no longer draws a card in the page.
- The bubble shows the saved answer if one is held (phase 5); until phase 5
  lands it shows the rule's words, so nothing goes dark in between.
- While an answer is being written it says only "Hakken is researching…".
- No fixed height: the bubble grows with the answer, up to three sentences
  and three steps, at a fixed width; taller than the screen, it scrolls
  inside itself (Anthony, 2026-10-30: "assume the bubble gets deeper to suit
  the reply from the agents"). The gap under the eye is 22px.
- Done when: the bubble matches the board; a test holds the tail, the words
  and the close.

## Phase 5 — the eye asks the Insights team (3 days)

S1–S5, S8–S12. New: `convex/seesAsk.ts` and a `seesAnswers` table.

- **Gather (code).** The page's figures as named facts with units: the
  boxes, the chart rows, the table rows, the website's name and kind, the
  dates, country and device. Nothing from another section; no fetch.
- **Ask.** One internal action, run on the Insights team's run log as a
  step with its cost: the Head of Strategy is handed the page and picks the
  specialist (`askSpecialist` in `convex/insightsRun.ts`, reused); the
  specialist writes two or three sentences and up to three steps with links;
  the Editor checks it; a code check refuses any number not among the facts
  or without its unit (S5).
- **Save.** Keyed by website, page, dates, country and device; shown again
  for 3 hours while all five are the same (S3, S9); any change writes afresh.
- **Feed Insights.** The answer is kept as a candidate for the specialist's
  next weekly run (S10).
- The words follow S7 and `plain-words-for-every-agent`: the rule goes in the
  fixed part of each agent's instructions (`convex/utils/insightBriefs.ts`).
- Done when: pressing the eye on Conversions gives an answer within the
  wait, saved and shown again; a refused answer leaves the rule's words; the
  run log shows the three steps and the cost; a test holds the number check.

## Phase 6 — stronger agents (9 days)

A1–A6, in this order so each step is measured.

| Step | Work | Days |
|---|---|---|
| A3 rules + A2 model | Anthony's rules into every agent's fixed instructions; the specialists on the strongest model in Model Defaults (the newest Google model Anthony added on 2026-10-30 is the candidate), the Head's routing and the Editor on the cheapest that does the job. No model in code. | 1 |
| A6 eval set | 20 real pages, each with the sentence Anthony would write; graded with `convex/agentEvalFixtures.ts` / `runEvalSuite`; a small Admin screen to add a page and its answer. Built first so A1, A4 and A5 are measured against it. | 2 |
| A1 tools | Read-only tools a specialist can call in several steps over the saved data (`aiToolExecutionService.ts` is the place): a page's figures, a list's rows, the month before, a page kind's pages. Never Google, never a fetch. | 4 |
| A5 second look | A ranking pass before saving: "what would the client act on first?"; the Editor's number check stays. | 1 |
| A4 memory of corrections | A correction from Anthony or a client saved against the agent (`convex/agentMemories.ts`) and read before it writes again. | 1 |

- Done when: every agent's Instructions page shows the rules; the eval set
  grades each change; costs per run are on the run log.

## Phase 7 — measuring and the gate (1 day)

- Costs of a bubble and of a weekly run measured on ronins.co.uk, then
  morehandles.co.uk, before any other website.
- The full local gate from `AGENTS.md` (`verify:env`, `lint:all`, `check`,
  `test:coverage`, `coverage:check`, `test:e2e:smoke`, `build`,
  `git diff --check`), plus GitHub's own steps.
- Commits local, batched per phase; no push until Anthony says.

## What is not in this plan

- Any other page's eye asking the team: the Head can, but each page is added
  when Anthony names it.
- Reports, email, or anything in Insights beyond what the bubble feeds it.
- The product list on a conversion's screen (removed on the canvas).

## Progress

- 2026-10-30: plan written.
- 2026-10-30, afternoon (Anthony: "Build it"): phases 1, 2 and 3 built on
  dev, committed locally, not pushed. Phase 1: the standard website header on
  Google Analytics, Search Console, Bing Webmaster, Microsoft Clarity and
  Discovery, the eye in the top bar, `src/website-header-drift.test.ts`.
  Phase 2: the Conversions page as board "Main", its look locked at
  `docs/plans/assets/conversions-page/look/Main.txt`. Phase 3: a conversion's
  own screen as board "Conversion" (`_components/ConversionScreen.tsx`, opened
  for any event that counts; other events keep the event screen), the lines
  part reused with the hours across the bottom
  (`src/ui/components/screens/ConversionsByHourChart.tsx`, a new kit part),
  and the `eventHour` list — the counted events by weekday and hour — asked
  by the night run with every other period list and read by
  `analyticsEventHours`; until the first run since, the card says "Hakken
  collects this with the next night's run". Nothing was asked of Google by
  hand. Overall: 30%.
- 2026-10-30, later: phases 4 and 5 built on dev, committed locally, not
  pushed. Phase 4: the speech bubble (`SeesBubble`) under the eye in the top
  bar, over the page, closed by Escape, a click outside or the eye; no box in
  the page. Phase 5: the eye asks the Insights team (`convex/seesAsk.ts`,
  `convex/seesAskActions.ts`, `convex/utils/seesAsk.ts`, the `seesAnswers`
  table): the Conversions page and a conversion's own screen hand over their
  figures and links (`_components/seesAskFacts.ts`); one run of the Head of
  Strategy's picks the specialist, the specialist writes, the Editor's code
  checks every number and word, the answer is saved three hours per website,
  page, dates, country and device, and the week's bubbles are kept for the
  weekly run (`weekSeesAnswers`; the weekly run reading them is phase 6's
  A1). The plain-words rule is in every agent's ground rules
  (`PLAIN_WORDS`). Checked on morehandles.co.uk in the app: the bubble
  answered in about two seconds. Overall: 50%.
- 2026-10-30, later still: phase 6 built as far as the bubble's path
  (stronger-agents-plan-2026-10-30.md, Progress): A3 in every agent's ground
  rules; A4's read side (a specialist's memories bind its bubble); A5, the
  Head's second look on every bubble; A6's set, grading and functions, with
  the Admin screen still to draw; A1 (tools) not started, a design decision
  for Anthony. S10 finished: the weekly run's Head reads what the bubbles
  said this week (`saidOnThePages` in `askStrategy`). Overall: 75%. Phase 7
  (the full gate) next.
- 2026-10-30, evening (Anthony: "can you audit the code and the screen
  don't look like the signed off UI"): the two live screens read against
  boards Main and Conversion in his Chrome, and every gap closed. The
  Conversions page: the shop's first box says Purchases, the map is titled
  "Conversions by page kind, channel, device or country" with its hint, the
  table's bar holds the count alone, every chart carries the board's hint.
  A conversion's own screen: a purchase's boxes read "Purchases" and
  "Visits that bought"; the first chart is the share of each day's visits
  that did it, with Show and Compare pinned; the lines part is named for the
  conversion; When people convert has a Count menu, conversions or visits.
  Two wordings differ from the board on purpose: a conversion is named by
  Google's event name as the connection holds it ("Ua 5 minutes on site"),
  and the figures say "added up over the dates shown" where the board said
  the month. Every word is in `messages/en.json` and `it.json`. The eye on
  both screens still answers through the Insights team.
  Phase 7, measuring: no bubble or weekly run was costed on a website — a
  cost needs a run, and runs are Anthony's to start — so that line stays
  open. Phase 7, the gate: `npm run check` passes (8,179 tests, one skipped);
  the speed check had one test over five seconds on its own
  (`convex/googleAnalyticsCountries.test.ts`, the country taken off), the
  `eventHour` list having added a list to each of its two collections. It
  was made lighter honestly: the file's connections were never marked as
  counted the current way, so every first collection there was a recount
  asking every finished period again, and the "fetched already" list the
  file set did nothing; marking them (`countedWith`) made the file's own
  comment true, and that one test also has Last Month fetched already,
  which it never read. 5.0s became 2.8s.
