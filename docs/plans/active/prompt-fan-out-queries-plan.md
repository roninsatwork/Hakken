# Admin → company → Websites → Your prompts: each prompt's fan-out queries

**Started 2026-09-28. Status: built on dev 2026-09-28, awaiting review; made
opt-in the same day ([fan-out-opt-in-plan.md](./fan-out-opt-in-plan.md)).**
Change a decision here, with a date, before building anything that disagrees
with it.

## What was asked

Anthony, 2026-09-28:

- "i would like the question row clickable to view the fan out queries for that
  query in a table that i can add edit and delete from".
- "when we click on a row it opens a new screen with a table that i can add
  edit and delete from / i can generate the fan out queries automatically
  through a button".
- Delete means "remove it from searching that fan out phrase again": it never
  comes back.
- Generate: ask the four AIs now.
- Of the first build: "its a admin data entry page not a results page, and this
  page is trying to do both"; "its intent is to add edit and delete fan out
  queries". Then, of the recommendation below: "Yes".
- Of the caps: "We need these limits on the company and on the website";
  "We need this in the ux we can't keep hiding things".
- Row actions are the house pencil and trash icons, each with a tooltip.

## How it works

1. A company asks a prompt, e.g. Ronins: "who are the best web designers in
   Surrey, England".
2. Each collection the prompt is put to the assistants it names (ChatGPT,
   Perplexity, Gemini, Claude).
3. Each assistant googles first. Those searches are the **fan-out queries**;
   they come back with the answer at no extra cost.
4. The assistant names companies found in those Google results — so ranking
   for the fan-out queries is how a company gets named.
5. Every fan-out query on a prompt's list is checked on Google once. The ones
   ticked there are checked every collection — they are on the company's
   Tracked keywords — up to 200 per website. The results are What came back's
   (AI searches, Rankings).

Opt-in since 2026-09-28 ([fan-out-opt-in-plan.md](./fan-out-opt-in-plan.md)):
every fan-out query an AI runs joins the list unticked and is checked once.
The admin ticks the ones to check every run, adds their own, edits words,
deletes, or generates now.

## What was built

**Your prompts** (`CompanyQuestions.tsx`, both scopes): "Asked of" is one
dropdown with a tick box per assistant (`EnginePicker`); every row opens the
prompt's fan-out queries. Columns: Question, (Website), Asked of, Fan-out
queries, Added, State, Actions.

Later the same day (Anthony: "this screen needs to show the limit and our
number"; "if it made a spelling mistake i had to delete and re-enter and there
was no edit"):

- The add box shows the website's prompts against its limit
  (`PromptAllowance.tsx`): "Prompts for ronins.co.uk", "6 of 10 used", a bar,
  how many more can be added and a "Change the limit" link to the website's
  Limits. Paused prompts count, as adding one checks. At the limit the bar
  turns amber, the question box and Add grey out, and Add's tooltip says why;
  past it (the limit lowered), the line says only the first that many are
  asked. On All websites it follows the website chosen in the add box.
- A **pencil** on each row changes a question's words and which assistants
  it is asked of (Anthony: "edit also needs to edit the assistants"): the
  words become a text box and "Asked of" the same dropdown as the add box's,
  with ✓ and ✕, Enter and Esc (`editWebsiteQuestion`). The question keeps its
  place and state, and uses no more of the limit. The AIs are asked the exact
  words and everything collected is filed under them, so new words start
  fresh from the next collection; what came back for the old words stays with
  them, and the company's choices for the old words' fan-out queries go, as
  when a question is removed. Other assistants are asked from the next
  collection, and the AI figures and fan-out queries follow the ones chosen.
- Removing or editing a question clears its fan-out queries from AI searches
  straight away, rather than at the next collection.

**Fan-out queries** — one screen per prompt, at
`…/websites/ai-searches/prompts/<prompt>` for All websites and
`…/websites/site/<website>/questions/<prompt>` for one website; the menu keeps
Your prompts lit (`PromptFanOut.tsx`, `convex/promptFanOut.ts`). An admin
data-entry list and nothing else:

- The header: back to Your prompts, "Fan-out queries", the prompt, one line on
  what the list is. **Generate fan-out queries now** is the page's orange
  action; its tooltip gives the price.
- **Add a fan-out query** — the company's own, ticked unless the website is
  at its limit.
- The list: a tick box, **Check on Google**, with "Every run" or "Once only"
  beside it; the fan-out query; **The AIs searched it** ("once", "8 times",
  "Your own"); the **pencil** to edit its words and the **trash can** to delete
  it, each with a tooltip. A delete takes effect at once with an **Undo**;
  deleted, it is no longer checked and never comes back, however often an AI
  runs it.
- The footer: the count, how many are ticked here and what they cost a run,
  and how many of the website's limit are ticked.

Taken off it: found by, Google position, the page that answers it, per-row
switches, a rule for new queries and the prompt's settings — the first build
(earlier the same day) had them, and they mixed results into data entry.
Times seen came back with the opt-in, as "The AIs searched it", as drawn.
Asked of, Pause and Remove stay on each row of Your prompts.

**AI searches** (`CompanyFanOut.tsx`) is What came back, read only: every
search the AI ran, most seen first, with where the website came in its newest
Google check ("4th", "Not in the top 100", "Not checked yet") and whether it is
checked every run or once. Tracking and untracking there are gone — the list
is changed and ticked on the prompt's own screen. Pausing or removing a
fan-out query on **Tracked keywords** unticks it; it stays on the prompt's
list.

**Existing lists** were put on Tracked keywords by the migration
`2026-09-28-track-fan-out-queries`, run on dev on 2026-09-28: 87 fan-out
queries (Ronins 7, Korda 80). The same day, when the lists became opt-in,
`2026-09-28-untick-fan-out-queries` took them off again and gave each its
first check instead. Nothing was bought.

## Limits — every one on screen

Schedule and limits → **Prompt, fan-out and tracking limits**, a company
default and each website's own (`convex/fanOutLimits.ts`):

| Setting | Choices | Default | Before |
|---|---|---|---|
| Prompts per website | 10, 25, 50, 100, 250, 500, 1,000 | 10 (Anthony, 2026-09-28) | fixed 1,000 |
| Tracked keywords per website — each checked every collection | 100, 250, 500, 750, 1,000 | 1,000 | fixed 1,000 |
| Fan-out queries checked every run — ticked on a website's prompts | 50, 100, 200, 500, 1,000 | 200 (Anthony, 2026-09-28) | new with the opt-in |
| Purchases per collection — the whole company, so company only | 1,000, 5,000, 10,000, 25,000 | 25,000 | fixed 25,000 |
| Fan-out queries read per prompt and assistant | 25, 50, 100, 150, 200 | 100 | a setting |
| Wordings kept per phrase group | 5, 10, 25, 50 | 25 | a setting |

Shown on the card, not settable: up to **50** fan-out queries are kept from one
AI answer, because one answer is shared by every company asking the same
prompt. The "track several at once" limit went with the tracking it limited.

Since 2026-09-28 these are on Limits, with a platform level above the
company's (docs/plans/active/platform-limits-plan.md). At a website's
tracked-keyword limit nothing more can be added; set below what a list holds,
its oldest that many are checked.

**Costs**, averages charged on dev on 2026-09-28: a Google check $0.003; an
answer from ChatGPT $0.008, Perplexity $0.006, Claude $0.015, Gemini $0.038 —
so a prompt asked of all four, or one press of Generate, about $0.067. Each
new fan-out query's first check: $0.003, once — Ronins' 7 about $0.02, Korda's
80 about $0.24. A website at its 200 ticked: $0.60 a collection; at 1,000
tracked keywords: $3.00.

## Not done

- The page that answers each fan-out query is judged only once page judging is
  switched on (FA4); that is What came back's, not this list's.
- Nothing was bought while building: Generate was not pressed.

## Change log

- 2026-09-28: first build — per-row "Check on Google" switches, a rule for new
  queries, results columns and the prompt's settings on the page.
- 2026-09-28: rebuilt as the admin data-entry list above on Anthony's review;
  automatic checking; AI searches read only; every cap a setting on screen.
- 2026-09-28: opt-in planned — [fan-out-opt-in-plan.md](./fan-out-opt-in-plan.md):
  one first check, then only ticked ones; 200 ticked per owned website.
- 2026-09-28: opt-in built on dev (see that plan's "Built" section).
- 2026-09-28: Your prompts shows the website's prompt limit; a question's
  words can be edited.
