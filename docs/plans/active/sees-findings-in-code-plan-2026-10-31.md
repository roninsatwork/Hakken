# What Hakken sees: code finds, Jev judges, a model writes — planned 2026-10-31

**Status: planned 2026-10-31, after midnight, at Anthony's word ("Ok let's make
a plan here, as you suggested and with jev"). Nothing built.** About seven days
of agent work; three to four calendar days. Read
`docs/developer/what-hakken-sees-guide.md` first: it holds the eight rounds
that led here.

## Why

On 30 and 31 October the eye's bubble went from repeating the boxes to finding
things Anthony had not spotted, but it still found only one of his three notes,
three gradings in a row. The agent was asked to spot findings in hundreds of
figures, and it spotted different ones each run: it never once mentioned AI
assistants, though the figures held them, and once it stated a guess as fact.

Anthony asked: "do we need AI for a lot of this, could we do this in code
better?" Yes. Finding things in figures is sums and comparisons. Code does them
the same way every time, for every website, exactly and for free. A model is
needed to explain the findings in plain words and say what to do; Jev is the
right tool for the few judgments in between.

## The split

- **Code finds and ranks.** A set of general rules, the same for every website,
  turns the saved figures into findings, each with a score.
- **Jev judges.** Quick yes-or-no questions, each with how sure it is: does this
  finding matter to an owner; is this gap behaviour or broken tracking; does this
  sentence state a guess as fact; would this step fit any website; did the bubble
  make this point. Through the Decisions engine Hakken already has
  (`convex/decisionRegistry.ts`): each question fixed in code, a simple rule to
  fall back on, every answer recorded, switchable in Admin.
- **A model writes.** It is handed the top findings and must cover each one; the
  Editor checks it did. It still reads the screens for context, but no longer
  has to find the story alone.

Anthony's notes stay the test, never the instructions. A finding rule is general
(a drop between steps, a group far from the average), never one of his notes.

## Phases

### 0. Two answers and two more eval pages (half a day; needs Anthony)

- What his "about a 10% drop from added to basket to checkout started" measured.
  The figures say 44.4% of basket visits started checkout (42.7% the month
  before), so the judge marked every bubble that found the step as missed.
- Eval pages on one or two other websites, each with his notes on what a good
  bubble should find, so nothing is tuned to morehandles.co.uk alone.

### 1. The findings, in code (two days)

A pure module, `convex/utils/sees/findings.ts`, tested on its own, reading what
the screen's reads already return. Each rule gives findings with their figures
as keyed facts, a size, the visits it covers, and whether it could be chance
(`couldBeChance`, as the weekly Editor uses):

- **A drop between steps**: a shop's basket, checkout and purchase, each into
  the next, against the month before.
- **A group far from the website's average**: each channel, kind of page, device
  and country, for each conversion and for every conversion together; only groups
  with visits enough to trust.
- **The biggest movers**: what rose or fell most against the month before.
- **Visits for one conversion**, and how it moved.
- **A gap too big to be behaviour**: one group three or more times another,
  marked to be checked as possible broken tracking.

Each finding is scored by size, the share of visits it covers, and trust; ties
broken by the page's own order. The top six go forward. Tested on the
morehandles figures and on the reads test's fixture: it must surface AI
assistants (all conversions together, newsletter sign-ups) and the basket to
checkout step.

### 2. Jev chooses what matters (one and a half days)

New Decisions in the registry, each with a simple rule for when Jev is off:

- `sees.finding-matters` — would a shop owner (or a business owner, for a
  website that sells nothing) act on this finding? Re-orders code's top findings.
  Simple rule: code's score.
- `sees.gap-or-tracking` — is this gap more likely behaviour or broken tracking?
  Simple rule: three times or more is tracking.

Run first with the Decision on "ask a person" (recorded, not acted on), graded
against the eval set beside code's own order, then switched to act only if it
scores better.

### 3. The writer covers the findings (one day)

- The specialist is handed the top findings, each with its keys and Jev's
  answers, and its reads for context. It must cover every finding.
- The Editor checks each finding is named by at least one of its keys; one that
  is missing sends the bubble back once.
- The Head's second look is kept only if the eval set shows it helps; it takes a
  third of the time.

### 4. Jev checks the words (one day)

- `sees.guess-as-fact` — does this sentence state a cause the figures don't show
  as fact? ("Shoppers simply reloaded the checkout step fewer times.")
- `sees.generic-step` — would this step fit any website, saying nowhere what or
  where?

A sure yes sends the bubble back once with why; the Editor's code checks stay.

### 5. Jev grades (half a day)

`sees.point-covered` — did the bubble make this point, in any words, figures
allowed to differ? It replaces the Head as the eval judge if it agrees with the
Head's judgments on the gradings so far; cheaper, faster, and the same each time.

### 6. Which model writes (half a day; needs Anthony to add the model)

A strong ChatGPT model, cheaper than Argon, added in Admin → AI models and set
on the writers, graded on the eval set against Argon and the fast model: score,
cost a bubble, seconds. Keep the cheapest that scores as well. With code finding
and Jev judging, a cheaper writer may do.

### 7. Write it down and check (half a day)

The guide gains the findings rules and the Decisions; the weekly run's
specialists get the same findings (a later step, agreed separately); the local
gate; commits local, no push until Anthony says.

## How we will know

The eval set, graded three times a change, averaged: today one of three on
morehandles. The aim is three of three where the finding is real, on every
website in the set, at a lower cost a bubble than today's $0.39.

## Not in this plan

- Credits spent by each press of the eye: its own plan, with Anthony, 31 October.
- The slide-out side panel you can talk to: drawn first, its own plan.
- Any screen other than Conversions and a conversion's own: each added when
  Anthony names it, by the guide's steps.

## Progress

- 2026-10-31: planned. Nothing built.
- 2026-10-31, overnight: phases 1 to 5 built and committed locally (264890eb, ea84f39d), nothing pushed.
  Code finds the figures (`convex/utils/sees/findings.ts`); five `sees.*` Decisions let Jev order them, call a
  gap tracking or behaviour, catch a guess stated as fact and a step that fits any website, and grade the eval
  set. They shipped off and were switched to act in Admin → AI → Decisions. The writer must cover code's top
  four findings. On morehandles.co.uk the bubble now names Paid Search at 9.2%, Brand pages at 5.7%, Organic
  Search at 2.2%, checkout to purchase at 54% and 29 visits for one purchase. The eval still scores one of
  Anthony's three points: his "10%" step and AI assistants are not found.
  - Waiting on Anthony: phase 0 (what his "10%" measured; eval pages on other websites) and phase 6 (adding
    a ChatGPT model to grade against Argon).
- 2026-10-31, morning, with Anthony: his "10%" was read down the map's column — 14.3% of visits add to basket,
  6.3% start checkout — so a step is now weighed and said as visits lost in every 100 of all visits (f582c5fc,
  4d370a87); "visits for one" always kept and covered. His AI assistants note was taken out of the eval page:
  over September AI Assistant bought at 3.2% against the website's 3.4% (his picture was one day, 2 of 28).
  Eval: 2 of 2. Then the cost (bdf125ff): with findings the writer reads no screen and the Head's second look is
  gone — $0.058 a bubble against $0.54, still 2 of 2. Open: eval pages on other websites; the ChatGPT trial;
  credits for a press.
