# Auto Classify — every page sorted into a website's own groups

**Planned 2026-10-16. Status: built on dev 2026-10-16 (go given the same day), not committed; see "Built".**

## Where this came from

Checking morehandles.co.uk's setup before connecting Google Analytics, we found its
Page classification thin: **1,626 of its 10,000 busiest pages have a group; 8,374
are Unclassified.** Its product pages sit at the top of the site
(`/hafele-boston-cabinet-bar-handle.html`), so rules written as folders
(`starts with /hinges/`) miss them. The Hinges rule catches 163 pages; 405
unclassified pages have "hinge" in their address.

Anthony, 2026-10-16:

- "should we page classification agent that uses jev to classify each page based
  on the words in the URL and the available categories"
- "we add a button here to kick off the page classification and yes to the new box"
- "I want you to write the description to help jev - but remember hakken works
  across all types of sites, ecommerce, service firms, brands etc"
- On the canvas: "why are you naming dev, this should say Auto Classify"
- "i like the pages this is great"

The screens are drawn on the canvas
[Page classification — Auto Classify](https://claude.ai/artifact/Hs6cemN7D4pqbmEQrrP66C):
three boards from the real screens' code with More Handles' real pages and
clicks. A copy of the boards and their pictures is in
[docs/plans/assets/auto-classify/](../assets/auto-classify/). Change a decision
here, with a date, before building anything that disagrees with it.

## What it is (AC1–AC9)

- **AC1. Who wins.** A page set by hand keeps its group. Then the rules. Auto
  Classify only fills the pages neither catches. It never overrules a person
  or a rule.
- **AC2. One answer everywhere.** Auto Classify's answers go into the one rule
  every screen already shares (`classifierFor`, `convex/utils/pageClassification.ts`):
  Page classification, Your pages, Analytics and Search Console's splits by
  group, Insights. No screen keeps its own copy, so none can disagree.
- **AC3. What it reads.** A page's address, the search that brings it the most
  visits where Hakken holds one, and each group's name, type and description,
  with the company's own account of the business (Names and profiles). Never
  the page's text: no page text is kept or sent to a model, as for every
  judgement like it.
- **AC4. Not sure stays Unclassified.** "None of these" is always an answer.
  Sure and fairly sure are applied; not sure leaves the page Unclassified.
  Nothing is queued for a person (AGENTS.md: no queue waits on a person).
- **AC5. Asked once.** Each page is asked once and its answer kept. Pages Auto
  Classify placed are asked again, at the next press, only when the groups
  have changed since: a group added, renamed or removed, or a description
  changed. Pages set by hand or caught by
  a rule are never asked.
- **AC6. It runs only when a person presses a button** (Anthony, 2026-10-16:
  "i dont want the classify to auto start ever", "i want it only to be on the
  press of the button like i asked"). The Auto Classify button on Page
  classification sorts one website; the agent's own Run button in Agents sorts
  every website with groups. No schedule, and no group change, starts it. It
  works in steps that hand on to the next until done, busiest pages first, and
  a run is judged alive by its last step, never its start; a watch every ten
  minutes carries on a run a person started whose step was lost — it never
  starts one.
- **AC7. It is a Decision.** "Which group is this page in?" sits with the other
  Decisions (Admin → AI → Decisions): one switch, the model it uses, every
  answer and its cost on the Decisions screens. Like every Decision it ships
  switched off. Jev is the expected model, but any model can answer it
  (Anthony's ruling of 2026-09-17). **The screens never name the model: it is
  "Auto Classify" everywhere a person reads it.**
- **AC8. Every group has a description, and Hakken writes it.** A Description
  box on a group's own page. Hakken writes it when a group has none — on
  creation, and once for every group that exists today — and a person can
  change it. Hakken never writes over a description a person has edited.
  It is written for every kind of website (below).
- **AC9. Owned websites only.** Page classification is only for a company's own
  websites, so Auto Classify is too.
- **AC10. An agent of its own, seen like every other** (Anthony, 2026-10-16, with
  the go: "remember to hook up the agents to costs and logs and observations").
  Auto Classify is a built-in agent ("Auto Classify", made by itself, with no
  schedule: it runs only when a person presses a button, AC6). Each website it sorts
  is a run of its own in Agents and the run observatory: every step a line on
  the run's timeline and in its log; each description's model call priced on
  the run and on the cost screens; every Jev answer filed under the run, so
  the agent's Observability lists them. A watch every ten minutes carries on
  a run whose step was lost.

### How Hakken writes a description, for any kind of website

One pattern for every website: **what belongs here, in the site's own words,
then the nearest thing that doesn't and where it goes instead.** Hakken writes
it from the group's name, its type, its rules, its busiest pages, the names of
the website's other groups, and the company's account of the business (sector,
description, market). For example:

- A shop (More Handles, Hinges, Product): "Pages for hinges and hinge packs:
  butt, ball-bearing, rising butt, parliament, tee and gate strap, piano,
  spring and concealed cabinet hinges, with their repair plates and cover
  caps. Not latches, locks or handles sold on their own, and not guides to
  fitting hinges, which go in Blog."
- A service firm (a law firm, Family law, Service): "Pages about family law
  services: divorce, separation, child arrangements, financial settlements and
  prenuptial agreements, including each office's family law page. Not the
  firm's people pages, which go in Our team, and not news about family law,
  which goes in Insights."
- A brand (Korda, Rigs and terminal tackle, Product): "Pages for hooks,
  swivels, leads, hooklinks and ready-tied rigs. Not rods, reels or bags, and
  not how-to videos about tying rigs, which go in Video."

A description is read by Auto Classify, not by a company's customers, so it is
written once in English and not translated.

## The screens (approved look)

- **Page classification, Pages view.** The info box gains a grey **Auto
  Classify** button beside "Show the 8374 unclassified" (the box holds both).
  While it runs, the box reads "Auto Classify is sorting the unclassified
  pages, the busiest first: 2,140 of 8,374 done. Each page takes its group as
  it is sorted, and a page it isn't sure about stays Unclassified."
  Under that line, the kit's bar (`Meter`) fills as each step lands, as
  Search Console's catch-up draws its own (Anthony, 2026-10-16: "we need a
  better UX for the auto classify can we have a progress bar"; drawn on
  board 2, "happy with the bar lets build it").
- **How it's set** reads "By Auto Classify: sure" or "By Auto Classify: fairly
  sure", beside "By the rule: …" and "Set by hand". Picking a group by hand on
  a row replaces Auto Classify's answer, as with a rule.
- **The Classification filter** gains one choice, **Sorted by Auto Classify**, to
  review what it did.
- **A group's own page** gains the **Description** box under Name and Type,
  with the hint "Hakken wrote this from the group's name, its rule, its busiest
  pages and what More Handles sells. Auto Classify reads it to sort the pages
  no rule catches, so it says what belongs here and what doesn't. Change it
  any time: this group's pages are then sorted again." Its pages list shows
  "By Auto Classify: sure" beside "starts with /hinges/".
- **Admin → AI → Decisions** lists "Which group is this page in?" like the
  others. With it switched off, the Auto Classify button says where to switch
  it on.

Every part is an existing kit part (`Button`, `Notice`, `Select`,
`TextAreaField`, `DataTable`, `CompactList`). Nothing new for the screen kit.

## Limits, each a number in the code

These are proposals; each is Anthony's to change.

| Limit | Proposed | Why |
|---|---|---|
| Pages sorted per website | The 10,000 busiest, as Page classification reads today | The ones left out have almost no clicks; the screen already says so |
| Groups offered in one ask | 25, the default group limit | A website whose limit is raised past 25: the groups past 25 are not offered, and the screen says so |
| Pages a step asks | 100 (40 when planned) | Each step reads the website's page list once, so fewer, larger steps read less; each still ends in well under a minute and hands on to the next |
| Asks at once | 8, as the same | Keeps the model's own limits in hand |
| Description length | 400 characters | Two or three sentences; long enough to say what belongs and what doesn't |
| Applied | Sure and fairly sure | Not sure stays Unclassified |

## What it costs

Measured on the 379 "What kind of page is this?" answers already on dev: about
760 words of input a page. More Handles' 8,374 pages come to about **25p of
input** at Jev's input price. Jev's output price is still missing from Hakken's
price list (decisions-typesafe-plan.md, "Waiting on Anthony"), so the true total
is a little higher, still pennies. Writing a description is one call to the
platform's stored writing model per group: a few pence for every group of
every website. Nothing is asked of Google, so no Google allowance is used.

## What does not change

- Rules, pages set by hand, and how they win over each other.
- What is collected from Google, Bing or DataForSEO.
- Every screen's reading of groups, apart from the third kind of answer (AC2).
- Hakken's own page kinds ("What kind of page is this?"), which carry on as before.

## Phases

| Phase | What | Man-days |
|---|---|---|
| 0 | The plan's index entry and the approved drawings saved with it (done with this plan) | 0.25 |
| 1 | AC8, the box: a group's description kept (schema, create and update), the Description box on a group's page, words in English and Italian | 0.5 |
| 2 | AC8, Hakken writes it: the writer for every kind of website, the stored writing model, its cost on the cost screens; written on creation and once for every existing group | 0.75 |
| 3 | AC7: the Decision "Which group is this page in?", its question and its 25 group labels plus "none of these", in the Decisions screens | 0.5 |
| 4 | AC1, AC2, AC5: where answers are kept, the third kind of answer in the one shared rule, cleared with a website; tests that every screen gives a page the same group | 0.75 |
| 5 | AC6: the run — the button, steps that hand on, progress for the screen, each night's new pages, asked again after a group changes, stopped when the Decision is off | 1.0 |
| 6 | The screens: the button and progress line, How it's set, the filter choice, a group's pages; look tests from the approved boards | 0.75 |
| 7 | Proof: Auto Classify run on morehandles.co.uk on dev, checked in Chrome, counts before and after, a sample of its answers read through, its cost read off the Decisions screen; the full gate with GitHub's steps | 0.5 |

**Total: about 5 man-days.** The "about 2 days" said in conversation on 16
October was before reading the code closely. Most of the difference is three
pieces of work. The answers have to go through the one shared rule so every
screen agrees (phase 4). The run has to hand itself on and show its progress
(phase 5). And the approved boards need look tests (phase 6).

## Built and proven on dev, 2026-10-16

"Which group is this page in?" was switched on for the platform on dev, and
Auto Classify pressed for morehandles.co.uk. One run, start to finish in about
seven minutes, 97 steps on its timeline:

- **Descriptions.** Hakken wrote all ten groups' descriptions first, each in the
  pattern above; for example Hinges: "…Non-hinge window fittings belong in
  Window Furniture, while cabinet pulls belong in Cupboard Handles."
- **Pages.** All 8,374 unclassified pages were asked; 5,684 were given a group
  (4,806 answers sure, 1,157 fairly sure, 2,411 not sure, of which the sure and
  fairly sure with a group are applied). Page classification went from **1,626
  of 10,000 pages classified to 7,310**; 2,690 stay Unclassified.
- **What is left** is mostly what no group fits: lighting, sockets, curtain
  poles and drawer runners (More Handles has no group for them), and the
  delivery, returns, discounts and reviews pages, which Brand's description
  did not claim.
- **Cost.** $0.86 on the run: $0.83 for Jev's 8,374 answers (19.8 million
  words in, at Jev's input price; its output price is still missing from the
  price list) and $0.02 for the ten descriptions. Each answer carries the
  website's groups and their descriptions, about 2,400 words a page — three
  times the 760 the plan measured for "What kind of page is this?", which is
  why the 25p estimate was low.

Found while proving it, and fixed: an agent's Observability adds up at most 50
of a run's answers, so a run's own cost now includes its answers' (AC10).

## Before it is built

morehandles.co.uk's Google Analytics can be connected now. Groups are applied
when a screen opens, not when data is collected, so Auto Classify sorts
everything already collected the moment it runs, with no collection again.

## Found while planning, for later

- morehandles.co.uk: `/door-handles.html` and `/front-door-furniture.html` are set
  by hand to Door Knobs; probably meant for Handles. Its Window Furniture group
  is typed Other, not Product.
- morehandles.co.uk's sitemap: the first file (`morehandles-1-1.xml`) is turned
  away as over 10 MB, so 4,927 pages come from the second file only. The
  sitemap reading does not say it stopped.

## Change log

- 2026-10-16 — Planned from the conversation and the approved canvas; waiting
  for Anthony's go.
- 2026-10-16 — Go given ("ok lets build this please and remember to hook up
  the agents to costs and logs and observations etc"): AC10 added. Built the
  same day on dev, not committed: the description and who wrote it on each
  group; Auto Classify's answers kept in 32 records a website and applied
  third in the one shared rule (`utils/pageClassification.ts`), so every
  screen agrees; the Decision `site.page-group`; the Auto Classify agent, its
  nightly schedule, its runs, steps, logs and costs, and its ten-minute watch;
  the button, progress, "By Auto Classify", the filter choice and the
  Description box; tests and look tests from the approved boards. A page
  taken out by hand from Auto Classify's answer is never asked again.
- 2026-10-16 — Anthony: "i dont want the classify to auto start ever … i want it
  only to be on the press of the button like i asked". The run after a group
  changed and the nightly schedule were mine, not asked for: both taken out
  (code and dev's schedule row) the same afternoon. AC6 rewritten.
- 2026-10-16 — The progress bar under Auto Classify's line, drawn on board 2 and
  approved ("ys happy with the bar lets build it"), built the same afternoon.
