# Insights to one standard — every judgement decided once, by its agent, through the Head of Strategy

**Started 2026-10-12.** Anthony: "we need to bring the insights section up to
this same standard. We can create new agents if we need to … make a separate
plan and ask questions … I want to build this overnight". "This standard" is
the one Keyword cannibalisation reached the same day
([keyword-cannibalisation-owners-plan.md](keyword-cannibalisation-owners-plan.md)).

Nothing here is built. The questions at the end are waiting on Anthony.

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
