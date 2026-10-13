# Insights to one standard — every judgement decided once, by its agent, through the Head of Strategy

**Started 2026-10-12.** Anthony: "we need to bring the insights section up to
this same standard. We can create new agents if we need to … make a separate
plan and ask questions … I want to build this overnight". "This standard" is
the one Keyword cannibalisation reached the same day
([keyword-cannibalisation-owners-plan.md](keyword-cannibalisation-owners-plan.md)).

Built overnight 2026-10-12 on local dev, committed phase by phase, not pushed; the morning list followed on 2026-10-13 ("Go"), also committed, not pushed. What waits on Anthony is listed under "Waiting on Anthony".

## The standard

Every Insights screen meets these seven rules:

1. **Code gathers the evidence; an AI never types a figure.** Every number
   comes from the sources and is named by its fact. The Editor fills it in and
   checks it.
2. **A rule makes the first pick wherever a judgement is needed.** It is free,
   the same every week, and it is the fallback.
3. **The Head of Strategy hands each judgement to its agent, only when
   something changed.** Unchanged items keep last week's decision. The run log
   says what was handed to whom.
4. **The agent decides and says why** in a sentence a client reads, and
   writes the screen's words.
5. **It is saved once.** The screen, the findings, Page decisions, the reports
   and Ask Hakken all read that one copy.
6. **What decided it is shown.** "Decided by the … specialist on …", or "Hakken's
   rule decided this: the specialist hasn't looked yet."
7. **Every agent's Instructions page is filled**: its job and brief to refine,
   and the fixed parts read-only.

## Where the section stands (checked against the code, 2026-10-12)

- **Already written by agents and saved:**
  - findings, in every section;
  - the Head of Strategy's verdict and note (Executive summary, This week);
  - the Analyst's "why";
  - the Report Writer's monthly and board reports;
  - the Conversion specialist's page reviews;
  - Keyword cannibalisation.
- **Decided by code rules, with no agent:**
  - Page decisions: every page's keep, improve, merge, redirect or remove;
  - the page plan and Opportunities;
  - Strategy's call for each service;
  - Measurement checks, Track record and the Leaderboards.
- **Fixed-wording "What Hakken sees" boxes, filled from figures and never
  saved:** every screen not listed above, and the boxes on most screens that
  are.
- **What Ask Hakken reads of Insights:**
  - the newest week's verdict and findings;
  - the monthly report's headline;
  - the cannibalisation groups.

  Nothing else, and none of the "What Hakken sees" boxes: Insights never saves
  them.
- **Where answers can disagree today:**
  - Page decisions ignores cannibalisation's keep and link decisions, page
    reviews and findings.
  - Ask Hakken is told it can answer "merge or redirect" but can't see Page
    decisions.
  - Search Console's competing screen saves its own rule's advice for Ask
    Hakken, separate from the cannibalisation specialist's.
  - Strategy's service calls can contradict the Head of Strategy.
  - When the Head of Strategy joins findings into one story, it can reword a
    cannibalisation finding's action.
- **The weekly run is one step with Convex's 10-minute limit.** A ronins.co.uk
  run was cut off at 10 minutes on 2026-10-12 when an AI call stalled for five,
  and nothing was saved. More agents need more time, so this comes first.

## Phases

Estimates are man-days, as a developer would take.

| Phase | What it does | Man-days |
|---|---|---|
| 0 | **The run never times out.** The weekly run hands itself on in steps (gather → specialists → Head of Strategy and Editor → save → after the save), each well inside 10 minutes. A run is judged alive by its last step. A stalled AI call is given up in time, and that step goes on without it. Follows the AGENTS.md rule that "no queue waits on a person". | 1.5 |
| 1 | **The standard as shared parts.** One shape for a decision: who decided, when, its reason, the rule's first pick and the reading it was made on. One carry-over for unchanged items. One "who decided" line on screens. A guard test that fails any Insights judgement saved without them. | 1 |
| 2 | **Page decisions, by a new Page decisions specialist.** The rule's verdict for every page is its first pick. The Head of Strategy hands it only the pages not kept, and those whose inputs changed. It reads cannibalisation's full decisions, page reviews and findings, and decides each page with a reason. One verdict per page, read everywhere. | 2 |
| 3 | **Strategy's service calls, by the Head of Strategy.** The rule's call is the first pick; the Head of Strategy confirms or changes each with a reason, in line with its own verdict and the findings. | 1.5 |
| 4 | **Every "What Hakken sees" box written by its discipline's agent and saved each week.** Enquiries and pages, and Where enquiries come from: Conversion. Funnel: Conversion. AI search: AI visibility. Leaderboards: Market. Measurement: Measurement. Opportunities and Page decisions: Search and content, and Page decisions. Track record: the Head of Strategy. Strategy's service pages: the Head of Strategy. The cannibalisation boxes: its specialist. Every figure is named and checked by the Editor; the fixed wording stays as the labelled fallback. | 3 |
| 5 | **Ask Hakken reads everything saved:** each page's verdict, the service calls, each screen's saved box, and the open findings of earlier weeks, all under one rule ("give it as written; never your own advice"). Search Console's competing screen reads the cannibalisation decisions instead of its own rule. | 1.5 |
| 6 | **The remaining disagreements.** A joined story keeps each finding's action. The summary's words follow the chosen period. Track record counts the chosen website. | 1 |
| 7 | **Proof.** The new agents' Instructions pages, the plan's record, a run on ronins.co.uk, every screen and an Ask Hakken answer checked in Chrome, and the full gate. | 1.5 |

**Total: about 13 man-days.** Built overnight on local dev if the questions
below are answered. Nothing is pushed.

## Progress

- **Phase 0, built 2026-10-12 (night).** The weekly run is three steps,
  each booked with a watch set past Convex's ten minutes
  (`insightsRunSteps.ts`): gather (`insightsRun.runWebsite`), read and decide
  (`insightsRun.decideWebsite`), and what follows the save
  (`insightsRunAfter.afterWeek`). In the decide step the Analyst and the
  Keyword cannibalisation specialist work beside the specialists. After the
  save, the reports, drafts, buyer questions and page reviews work side by
  side, each reading the saved week back. Any one AI call is given up after
  three minutes (`insightsAsk.ASK_LIMIT_MS`) and its step goes on without
  it. A step the platform stops is finished by its watch, saying where.

- **Phases 1 and 2, built 2026-10-12 (night).** The standard's shared parts
  (`utils/insightDecided.ts`): who decided, the week, the agent's reason and
  the rule's reading on every judgement, with last week's decision kept where
  the rule reads an item the same. Keyword cannibalisation now uses them too.
  The **Page decisions specialist** (`INSIGHTS_PAGE_DECISIONS`,
  `utils/insightPageAgent.ts`) works in the step after the save, reading this
  week's page reviews. It is handed at most 40 pages the rule doesn't simply
  keep, the most used first. Its guards: it never removes a page other
  websites link to or a page a website needs, and merges or redirects only
  into another page of the site. Keyword cannibalisation's pages stand as
  that specialist decided them. The rule also reads cannibalisation's
  keep-and-link decisions and page reviews asking for a change. Page decisions
  shows who decided and each reason, and Ask Hakken reads every page to act
  on.

- **Phase 3, built 2026-10-12 (night).** The Head of Strategy calls each
  service in its one weekly call: no second request, no added time. Each
  service carries the rule's call and its figures, and the Head of Strategy
  keeps or changes it with a sentence. Last week's call stands where the rule
  calls a service the same. Guides stay "for readers", and no service can be
  given that call. The Strategy screen shows each reason and who called it;
  a service's page shows the Head of Strategy's reason in place of the
  rule's sentence when it made the call. Ask Hakken reads every call. Phase
  6's first item went in with it: the Head of Strategy can no longer join a
  Keyword cannibalisation finding into another story.

- **Phase 4, built 2026-10-12 (night).** Six screens' "What Hakken sees"
  boxes are written each week by their discipline's specialist, after the
  save, one request a specialist, from the figures of its own discipline
  (`utils/insightBoxes.ts`, `insightBoxes.ts`):
  - Enquiries and pages: Conversion, for the newest whole month, and shown
    only when that month is chosen;
  - AI search: AI visibility;
  - Leaderboards: Market;
  - Measurement: Measurement;
  - Opportunities: Search and content;
  - Strategy: the Head of Strategy.

  Every figure is named by its fact and filled in, and a sentence typing a
  number or naming one not held is left out. A screen shows its box with who
  wrote it and for which week, else its own sentences. Ask Hakken reads every
  box. Left with their own sentences: Track record, whose figures aren't in
  the run's reading; the funnel, Where enquiries come from, Page decisions'
  summary and the cannibalisation screens. The cannibalisation screens wait
  on the parked question of the specialist alone writing the page.

- **Phase 5, built 2026-10-12 (night).** Ask Hakken's Insights read holds
  everything saved: the week's findings and the earlier ones still open
  (published, not yet checked), Page decisions, Strategy's calls, each
  screen's box and the cannibalisation groups. Its tool says so. Search
  Console's pages-competing box no longer says "choose one page … and link
  the others to it". It now says that Hakken's Keyword cannibalisation
  specialist gives each keyword one page, and links there, so both screens
  and Ask Hakken say the same.

- **Phase 6, built 2026-10-12 (night).** Three fixes:
  - A joined story can't take in a cannibalisation finding (built with phase
    3).
  - Track record counts the chosen website's own checked findings, and the
    company's only when no website is chosen.
  - The Executive summary's note says the period it describes: the last 90
    days against the same 90 days a year before, "whichever period is chosen
    above". This is the lighter fix. Making the note follow every period
    would mean rewriting it for each period, which means many more AI calls.
    That fuller version is Anthony's to ask for.

- **Keyword difficulty, built 2026-10-12 (night).** For each cannibalisation
  group's ten most searched searches, difficulty (0–100) is read from the
  monthly ranking collection where held, else from a shared store of bought
  difficulties (`searchDifficulties`). The missing ones are bought from
  DataForSEO Labs (`keyword_difficulty`, live) when the week's groups are
  saved, in one request, never again within 30 days. The specialist reads
  each search's difficulty as what a top-three place would cost, never as who
  owns it, and Ask Hakken reads it too. **Not on the screen yet:** the
  "Difficulty" column changes the approved look of the searches table, so it
  waits for Anthony to see it drawn.

- **Phase 7, proved 2026-10-12 (night).** The team's setup step made the
  Page decisions specialist. Two ronins.co.uk runs followed:
  - **First run:** 534 seconds, $0.35. All three steps handed on. The
    cannibalisation specialist reviewed 6 groups and changed one owner. The
    Page decisions specialist kept 19 of 19 pages with its reasons. All 6
    boxes were written. 47 searches' difficulty was bought for $0.018 and
    filed. The Head of Strategy was given up at 3 minutes and the week still
    saved, which is why its limit became 4½ minutes.
  - **Second run:** 420 seconds, $0.32. Every unchanged decision was kept
    without asking: 0 of 6 groups, 0 pages and no difficulty bought twice.
    The Head of Strategy answered in 3 minutes 41 seconds and called all 32
    services.

  Checked in Chrome: Page decisions, Strategy, AI search and Ask Hakken, which
  gives the saved page advice word for word. The gate passed:
  - `npm run check`: 953 files, 7,521 tests;
  - `lint:all`;
  - coverage, above every target;
  - the smoke tests (19 of 19) and the build, run in a copy.

  Nothing pushed.

- **Follow-up, built 2026-10-13.** Anthony's "Go" on the morning list
  below, item by item, each committed on dev, not pushed:
  - **7, the stale run:** nothing to do. The platform had already closed it
    as failed at 19:36 on 12 October.
  - **6, coverage:** the bar is now one point under where coverage stands:
    80/77/65/72 (lines, statements, branches, functions), up from
    72/70/58/66; the next target is 83/80/68/76.
  - **2, the Head of Strategy's time:** it calls only the services that
    brought an enquiry this year (24 of 32 on ronins.co.uk). The rest keep
    the rule's call, said to be the rule's. Every one of the 32 brought
    clicks, so "enquiries or clicks" would have changed nothing.
  - **4a, the specialist writes the cannibalisation page:** it is shown and
    decides every search a group keeps (up to 200, not 60). Its headline and
    story are kept on the group with their figures named by key, filled from
    the group's figures each time the page opens, and open the group's page
    and its finding; Ask Hakken reads them too. A group it hasn't decided
    keeps the rule's sentences, labelled.
  - **4b, Jev picks each search's page:** through the "Which page answers
    this search?" Decision (`seo.angle-page`), the one Fan-out asks
    (`insightCompetingJudge.ts`). While it acts on its own, a sure answer is
    the search's page ("Chosen by the decision model"), the rule's stands
    where it isn't sure, and the specialist explains the picks and decides
    the pages' actions, never picking a page. Turning it on or off reads
    every group anew. It is off for Ronins, so nothing has changed yet.
  - **3, the boxes:** Funnel (Conversion specialist), Track record (Head of
    Strategy) and Page decisions (Page decisions specialist, written once its
    pages are decided) now have written boxes, their figures worked out from
    what is saved (`utils/insightBoxFacts.ts`). The Funnel box covers "where
    visitors came from", its sources table.
  - **1, the Difficulty column:** drawn on ronins.co.uk's app group and sent
    as a picture. It reads difficulty free for every search wherever it is
    already held, and still buys only each group's ten most searched: 45 of
    the group's 200 searches have one, up from 9. Built and set aside, not
    committed, until Anthony approves the look.
  - **5, the summary note:** left as it is.

## Morning list (2026-10-13, answered "Go" — see the follow-up above)

1. **The "Difficulty" column** on a cannibalisation group's searches table:
   to see it drawn and approve its look.
2. **The Head of Strategy's time:** 3 minutes 41 seconds of its 4½ on the
   second run. If it runs long again, give it only the services that bring
   enquiries rather than all 32.
3. **Boxes still in the screens' own words:** Track record, the funnel,
   Where enquiries come from, Page decisions' summary, and the
   cannibalisation screens (with the parked "specialist alone writes the
   page").
4. **The parked cannibalisation questions:** the specialist alone writing
   the page, and Jev picking each search's page.
5. **The Executive summary's note:** says its period rather than following
   each period chosen; the fuller version means more AI calls.
6. **Coverage** cleared its next targets; raising them in
   `coverage-thresholds.json` is Anthony's call.
7. **The first run cut off before phase 0** still shows as running in its
   record. The watches only cover runs from now on; a one-off fix can close
   it.

## Waiting on Anthony (2026-10-13, after the follow-up)

1. **The Difficulty column's look:** the picture is sent; a yes builds it.
2. **Turning Jev on for Keyword cannibalisation:** Decisions → "Which page
   answers this search?". It is the same switch as Fan-out's "Your page".
3. **"Where enquiries come from", if it means the page for one source**
   (for example "Enquiries from ChatGPT"): that page has no box today, and
   giving it one changes its look.
4. **A ronins.co.uk run to prove the follow-up:** about $0.50. Until one
   runs, the cannibalisation pages show the rule's sentences and the three
   new boxes show the screens' own.

## Answered by Anthony, 2026-10-12

1. **Agents:** one new agent, the Page decisions specialist. The Head of
   Strategy takes Strategy's service calls, and the existing specialists write
   their own screens' boxes ("yes").
2. **Spend:** about $0.45–0.55 a website a run instead of $0.27, and about
   $0.50 for each test run tonight ("ok").
3. **Overnight commits:** each phase committed on dev once its checks pass,
   never pushed ("thank you").
4. **Keyword difficulty is added tonight** ("yes"), as agreed in the
   cannibalisation plan. Check the monthly ranking collection first, then buy
   it for each group's ten most searched searches only where missing, in one
   request a week. The specialist reads it, and the searches table shows it.
   It never chooses an owner. The specialist alone writing the page, and Jev
   picking each search's page, stay for later.
