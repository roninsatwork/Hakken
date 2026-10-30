# What Hakken sees, written by the Conversion specialist

**Started 2026-10-30. Status: decided, not approved to build.** Anthony,
2026-10-30, on the "Conversions page, three ways" canvas
(https://claude.ai/artifact/DexG7cSzEhELxzFvLahQbs): "we need to create a CRO
agent that will help with the insights section and each time someone presses
on the eye, it looks at the data and generates the answer and caches that
answer for 3 hours"; then "can we use the same agent for the insights and this
page" and "yes, and we feed it content each time". Follow `AGENTS.md`. Nothing
here is built.

## Why

What Hakken sees is today fixed rules in code (`convex/utils/sees/`). On the
Conversions page it said "six conversions never happened", the least useful
thing on the page. Anthony: "is this really the best thing the page has to
say? I don't think so". A specialist reading the same figures would say
something worth reading. Hakken already has that specialist: the Conversion
specialist on the Insights team (`INSIGHTS_CONVERSION`,
[insights-analyst-plan.md §6](insights-analyst-plan.md)), built, writing the
page reviews. It is not connected to the eye.

## Decisions

| # | Decision | Who, when |
|---|---|---|
| S1 | **No new agent.** The eye asks the Conversion specialist that already exists. One agent, one voice, in Insights and in the bubble. | Anthony, 2026-10-30 |
| S2 | **Written when the eye is pressed.** Pressing the eye sends the page's figures to the specialist, which writes the bubble. | Anthony, 2026-10-30 |
| S3 | **Kept for 3 hours.** The answer is saved and shown again for 3 hours. The next press after that writes it afresh. | Anthony, 2026-10-30 |
| S4 | **Fed the page's content each time.** The specialist is given the figures the page shows, in the dates and filters the page is on, and nothing else. It never asks Google. | Anthony, 2026-10-30 |
| S5 | **Every number in the bubble is one the page shows, with what it counts.** Never a figure worked out and presented as a fact: "3 in 4 baskets were left" was refused because Google counts visits that added to a basket and visits that bought, not baskets. "The platform will lose credibility." | Anthony, 2026-10-30 |
| S6 | **It is a speech bubble under the eye in the top bar**, its tail pointing at the eye, over the page. Not a box in the page. Drawn on the canvas, board "Sees". | Anthony, 2026-10-30 |
| S7 | **Plain words, from every agent.** Number first, then what it means. One fact a sentence, under 12 words. No list of names inside a sentence: the count in the sentence, the names behind the link. Each step one thing a person can do. The words on the screen, never Google's own names. This binds every agent that writes words a client reads, not only the bubble: it goes in each agent's fixed instructions and in the check before its text is saved. | Anthony, 2026-10-30 ("make this more simple and clearer"; "please remember the wording style with any agent too") |

## How it works

1. A person presses the eye on a page.
2. If a bubble for this website, page, dates and filters was written in the
   last 3 hours, it is shown at once.
3. Otherwise the bubble shows the rule's words straight away (what the code
   says today), with a line that Hakken is looking, and the page asks the
   Conversion specialist. Code gathers the figures; the agent is handed them
   as named facts, the same way the Insights team works
   ([insights-one-voice-plan.md](insights-one-voice-plan.md), rule 1: "an AI
   never types a figure").
4. The specialist writes two or three sentences and up to three steps, each
   step with a link to the page where it is done.
5. A check reads the text before it is saved: every number in it must be one
   of the facts handed over, and each must carry its unit. Text that fails is
   not shown; the rule's words stay.
6. The text is saved with the time, the website, the page, the dates and the
   filters. The bubble shows it, and shows it again for 3 hours.
7. The run is a step on the specialist's own run log, with its cost, held by
   the agent's spend limit like every other agent.

## What it is fed

The figures the page shows, no more:

- the figure boxes, with their month-before comparison;
- the chart's rows (a day, a channel, a page kind) for the dates shown;
- the table's rows;
- the website's name and what kind of website it is (a shop, a service
  business), from what is already stored;
- the page's name and what each figure counts (visits, purchases, pounds).

Not fed: anything from another section (Search Console, Visibility); anything
fetched live from Google.

## What it costs

One call per press that is not already saved, so at most eight a day per
website and page under the 3-hour rule, and far fewer in practice. The model
comes from Admin's stored settings for the Conversion specialist, never
written in the code. Measured on ronins.co.uk before it is turned on for
anyone else.

## Where it applies

Decided for the Conversions page and a conversion's own screen first, where
it was drawn. Every other page's eye keeps the rule's words until Anthony
names it.

## Answered 2026-10-30

| # | Decision | Who, when |
|---|---|---|
| S8 | **The page talks to the Head; the Head works out the task.** A page sends its name and its figures. The Head of Strategy decides which specialist answers, as it does in the weekly run. No fixed page-to-agent table: more specialists will join the team over time, and the Head picks from whoever is on it. | Anthony, 2026-10-30 ("each page talks to the head and the head works out the task"; "over time we will add a lot more sub agents") |
| S9 | **Nothing is kept once anything changes.** The saved answer is for one website, page, dates, country and device. Change any of them and a new answer is written. The 3 hours apply only while everything is the same. | Anthony, 2026-10-30 ("don't cache if things change") |
| S10 | **A new bubble feeds Insights.** What the specialist says in a bubble is kept for its next weekly run, so the bubble and Insights say the same thing. | Anthony, 2026-10-30 |
| S11 | **While it writes, the bubble says only "Hakken is researching…"**, no rule words. | Anthony, 2026-10-30 |

### Who the Head can hand a page to

Whoever is on the team at the time (`INSIGHTS_ROLES`, `convex/utils/
agentRoles.ts`): today the Analyst, Market, Technical SEO, Search and
content, Cannibalisation, Page decisions, Local and reputation, Links and PR,
AI visibility, Conversion, Measurement, the Editor and the Report Writer. A
specialist added later is available to the Head without any change here. For
the Conversions screens, where this was drawn, the Head is expected to pick
the Conversion specialist.

## Decided: every press goes through the Head of Strategy and the Editor

| # | Decision | Who, when |
|---|---|---|
| S12 | **One path.** A press goes to the Head of Strategy, which hands it to the page's specialist (the table above), whose words the Editor checks before they are saved and shown. The same path as Insights' weekly run, so the rules, the number checks and the log live in one place. The code check on numbers (S5) stays as well. The first answer takes longer, ten to twenty seconds; after that it is saved for 3 hours (S3, S9). | Anthony, 2026-10-30 ("keep the paths clean … if everything goes through the Head the quality is easier to maintain"; "I'm ok with the steps, I don't think many people will use it") |

I had recommended going straight to the specialist for speed; Anthony chose
one path for quality, accepting the wait.

## Progress

- 2026-10-30: decided on the canvas; the bubble and its words drawn (board
  "Sees", Version 41).
- 2026-10-30, afternoon (Anthony: "Build it"): built on dev as phases 4 and 5
  of [conversions-and-agents-build-plan-2026-10-30.md](conversions-and-agents-build-plan-2026-10-30.md),
  committed locally, not pushed. S1–S9, S11 and S12 are in the code
  (`convex/seesAsk.ts`, `convex/seesAskActions.ts`, `convex/utils/seesAsk.ts`;
  `src/ui/components/screens/HakkenSees.tsx`, `HakkenSeesEye.tsx`); S10 is
  half done — the week's bubbles are kept (`weekSeesAnswers`) and the weekly
  run reads them with phase 6. Checked on morehandles.co.uk: pressing the eye
  on Conversions gave the team's words in about two seconds. The Conversions
  screens hand over their figures today; another page's eye asks the team
  once Anthony names it.
