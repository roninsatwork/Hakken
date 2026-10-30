# Stronger agents — closing the gap between the Insights team and a specialist

**Started 2026-10-30. Status: agreed in principle, not approved to build.**
Anthony, 2026-10-30: "we need to make the agents really strong and powerful.
You find data that's better than the current agents do. There is a big gap in
skill. How do we make our agents closer to you?" Then, to the six changes
below: "I agree with all of this." Follow `AGENTS.md` and
[sees-conversion-specialist-plan-2026-10-30.md](sees-conversion-specialist-plan-2026-10-30.md),
which is the first place the stronger team is used.

## Where the gap is

Not mostly the model. A specialist today gets a short digest of candidates and
one call ([insights-analyst-plan.md §6](insights-analyst-plan.md), "Cost").
The agent writing this plan gets the whole page, tools to read the data and
work things out, the rules Anthony has set, and as many steps as it needs.

## The six changes

| # | Change | What it means |
|---|---|---|
| A1 | **Tools, not digests.** | A specialist can read the saved data itself, through read-only queries over what the sections have downloaded, in several steps, and work figures out. Never Google, never a fetch (AGENTS.md: Insights draws only on saved data). |
| A2 | **The strongest model for the thinking.** | The specialists on the strongest model in Admin's stored settings; the Head of Strategy's routing and the checks on a cheap one. Models stay in the settings, never in code. |
| A3 | **Anthony's rules in their instructions.** | Plain words; every number with what it counts; never a worked-out figure as a fact; never the supplier's name; the look-and-wording rules in AGENTS.md and the memories of 2026-10-30. Written into each agent's fixed, read-only instructions. |
| A4 | **Memory of corrections.** | When Anthony or a client says "that is not the best thing to say", it is kept against that agent and read before it writes again. The platform's agent memories (`convex/agentMemories.ts`) carry it. |
| A5 | **A second look at their own work.** | Before saving: is every number real (the Editor, today), and is this the most useful thing the page says (new: a ranking pass that asks "what would the client act on first?"). |
| A6 | **Tested like staff.** | A set of real pages with the answer Anthony would give. Every change to an agent is graded against it with the platform's agent evals (`convex/agentEval*.ts`), which exist but have no such set. |

## Models

Nothing to change in code. Three things in Admin:

1. Admin → AI models: make sure the newest Claude models are in the list
   (synced from the provider, or added there), with their prices.
2. Model Defaults: the Insights specialists on the strongest; the Head's
   routing and the Editor's checks on the cheapest that does the job.
3. Each agent's engine settings only where one should differ from the default.

Anthony added Google's newest flagship model to Admin → AI
models on 2026-10-30 ("great at reasoning"). It is a candidate for the
specialists' default. Which model the specialists run on is decided by the
eval set (A6) on real pages, not by name: the one that gives the answer
Anthony would give, at the best price, wins, and the choice can change as
models do.

## Order

A3 and A2 first (words and model, a day); then A1 (tools, the real work);
then A5 and A4; A6 alongside from the start, so each step is measured. Costs
measured on ronins.co.uk before anyone else's website.

## Progress

- 2026-10-30: agreed in principle.
- 2026-10-30, afternoon (Anthony: "Build it", on the build plan): built on dev
  as phase 6 of [conversions-and-agents-build-plan-2026-10-30.md](conversions-and-agents-build-plan-2026-10-30.md),
  committed locally, not pushed, as far as the eye's bubble path:
  - **A3 done**: the plain-words rule is in every agent's ground rules
    (`PLAIN_WORDS`, `convex/utils/insightTeam.ts`), so it binds the bubble,
    the findings, the boxes and the reports, and shows read-only on every
    Instructions page with the ground rules.
  - **A2 is Admin's**: nothing in code; Anthony added Google's newest flagship model on
    2026-10-30 and sets the specialists' model in Model Defaults.
  - **A4 half done**: the specialist writing a bubble reads its "always"
    memories for the company (`agentMemories.getAlwaysMemoriesInternal`), so
    a correction saved against it in Admin → Agents → Memories binds its
    next bubble. Saving a correction from the bubble itself needs a control
    Anthony has not drawn; the weekly run's specialists do not read memories
    yet.
  - **A5 done for the bubble**: the Head of Strategy takes a second look at
    every bubble the Editor passed — "is this the most useful thing the page
    says?" — and may say better words, kept only when the Editor passes them
    too (`SECOND_LOOK_FORMAT`, `seesAskActions.writeBubble`). Not yet on the
    weekly findings.
  - **A6 built, no screen yet**: a bubble the eye asked for can be kept as an
    eval page with the sentences Anthony would write
    (`seesAsk.keepSeesEvalPage`); `gradeSeesEvalNow` writes every page's
    bubble again through the same path and grades it — the Editor's verdict
    and the share of Anthony's figures named (`gradeSees`) — a run of the
    Head's per company, twenty gradings kept per page
    (`seesEvalResults`). The Admin screen to add a page and read the
    gradings is still to draw and build; until then a super admin calls the
    functions.
  - **A1 not started** (superseded below, the same evening): the note said a
    tool loop had to be built in the one-shot adapters. It did not: the agent
    runtime's own adapters (`agentProviderRegistry`) already call tools on
    Google, Anthropic, OpenAI and OpenRouter.
  Overall for this plan: about 45%.
- 2026-10-30, evening (Anthony, on the bubble: "wow the advice from ask hakken
  is poor … there is so much data on this page and this is the best it can
  do"; "you said the agent would talk directly to the data"; then "yes
  please" to building A1): **A1 built** on dev, local commits.
  - **The loop**: `convex/insightsToolAsk.ts` (`askWithTools`), on the agent
    runtime's adapters, so every provider the runtime runs can read. Up to six
    turns, the last for writing; each turn a model call on the run with its
    cost, held by the run's spend limit and the ask's time limit. The Editor's
    check runs inside the conversation: what it sends back goes back to the
    agent once, with why, with everything it read still in front of it.
  - **The reads**: `convex/insightsTools.ts` — Google Analytics' screens
    (`read_google_analytics`) and Search Console (`read_search_console`),
    through Ask Hakken's internal reads, which call the very functions the
    screens call. Saved data only: Live, which asks Google, is not offered;
    Clarity has no read yet and the weekly reading has no Bing figures, so
    neither is offered. Each read is fixed to the company and website, and for
    a bubble to the page's dates, country and device; a page on custom dates
    offers no reads.
  - **Every number keyed**: `convex/utils/agentTools.ts` (`keyedRead`) hands
    each read back with every number replaced by its words and its own key
    (`"18,344 [[r1.conversions.kinds.add_to_cart.count]]"`), so an agent that
    reads for itself still never types a figure and the Editor fills and checks
    it like any other. Raw fractions give way to their percentages.
  - **The bubble**: the specialist is handed the page's own screen read for it
    (Conversions, and a shop's products), may read any other, and at least one
    sentence must name a figure read beyond the page's boxes — for the Head's
    rewrite too, which had turned a good point back into the boxes. Every step
    must name the figure it should move. A saved bubble now stands only while
    the page's figures do (S3; it had stood for three hours after the box
    changed, which is how the bubble said 1,246 beside a box of 1,258).
  - **The weekly run**: each specialist reads Analytics and Search Console for
    itself, choosing the period, its reads keyed under its own name; what it
    read joins the week's reading, so the Head weighs it and the Editor checks
    it against the fresh reading like every other figure. A figure it names
    that is neither given nor read goes back to it once (`findingsCheck`). Not
    yet checked on a real weekly run: the next one is the first.
  - **Checked on morehandles.co.uk** in the app: the specialist read the
    Conversions screen (152 figures) and the products steps (133) and wrote
    "75.6% of baskets are left behind without a purchase", from the Products
    screen; about two minutes from the press, most of it the Head's second
    look.
  - **Not done**: the eval set grades bubbles with no reads (its pages keep no
    calendar period); the weekly Head and the Analyst still answer in one
    ask; a weekly step that is run again re-asks its specialists rather than
    reusing their answers (single asks were reused by their request key).
  Overall for this plan: about 70%.
- 2026-10-30, later that night (Anthony, on the first bubble that read for
  itself: "the advice is still really shit"; then "yes please" to five
  changes): the Head had handed the Conversions page to the measurement
  specialist, whose advice was about settings, told him to undo a choice he
  made on purpose (basket additions count), missed that checkouts got worse,
  and glued numbers onto steps because every step had to name a figure. Now:
  - **Who writes**: a page about conversions goes to the Conversion
    specialist; the measurement specialist only when tracking health found a
    fault that breaks the conversion figures themselves
    (`SERIOUS_TRACKING_FAULTS`: nothing counted, tracking stopped, a sudden
    fall, a conversion that is really something else, an enquiry not counted,
    conversions on another address). Housekeeping faults — no value, never
    happens, a page counted twice, other addresses, unknown sources — never
    displace what the sales say. The Head still chooses; `routeFor` holds it
    to that rule and the run's log says when it did.
  - **No tracking advice without a fault**: the Editor sends back words about
    tracking or about changing what counts as a conversion when no such fault
    was found (`TRACKING_TALK`).
  - **A shop's brief** (`SEES_SHOP_FORMAT`): money first; then the biggest leak
    in its steps against the month before; then the channel or kind of page
    that earns most or least; never a comparison with nothing.
  - **Steps name the thing to fix** in words — a step of the shop, a channel, a
    kind of page, a product — never a figure glued on; the rule that every step
    names a figure is gone.
  - **The Head's second look** rejects tracking advice without a fault, words
    that don't say what got better or worse, and for a shop words that leave
    out the money or the biggest leak.
  - Checked on morehandles.co.uk: "£104,165 in sales was earned, beating
    £94,011 the month before. 75.6% of baskets were abandoned, improving from
    76% the month before. 6,155 checkouts were started, down from 7,857 the
    previous month." Steps: find what stops basket shoppers starting
    checkout; win abandoned baskets back by email; make checkout shorter. About
    two and a half minutes from the press; the Head's second look takes about
    a minute and a half of it.
- 2026-10-30, last thing (Anthony: "i just dont want it focusing on money";
  he had first agreed, then withdrawn, limiting the bubble to the screen's own
  figures — the reads stay): the shop brief speaks in conversions and
  purchases, never leading with money, and the Head's second look rejects
  words that lead with money. The two reads were renamed `read_analytics_screen`
  and `read_search_console_figures` (`ANALYTICS_READ`, `SEARCH_CONSOLE_READ`),
  apart from Ask Hakken's own tools. Checked on morehandles.co.uk: "75.6% of
  baskets were abandoned, against 76% the month before. 46.1% of checkouts
  were abandoned, worsening from 44.2% previously. 6,155 checkouts started,
  falling from 7,857 the previous month." Steps: basket reminders; a shorter
  checkout. About four minutes from the press: the Head's second look took
  three of them, which wants looking at (its model, or dropping the second
  look when the specialist's words pass every check).
- 2026-10-30, near midnight (Anthony: "can we get more advice in what hakken
  sees please … the advice it gives is very good and we can't lose it, but
  see a lot more"; "im happy for the advice to be twice as much"; "i dont
  want it hard coded, these are examples of what i want it to find"; "it
  could find other things that i have not spotted, that's the whole point"):
  the bubble holds up to six sentences and four steps; the brief asks for what
  a person looking at the page would miss, and lists no findings; the agent is
  handed the page's map, read through the map's own function
  (`convex/agentReads.ts`, `conversionsBy`, by kind of page and by channel
  first, devices and countries on request), every rate and "visits for one"
  worked out in code. On morehandles.co.uk: "5,198 visits added items to
  basket, up from 4,525. 6,155 checkout starts took place, down from 7,857.
  46.1% of checkouts were left, worsening from 44.2%. 9.2% of Paid Search
  visits bought, up from 7.9%." About two minutes from the press. Every round
  and rule is now in `docs/developer/what-hakken-sees-guide.md`, for bringing
  the bubble to every screen. Anthony also floated a slide-out side panel he
  can talk to, in place of or beside the bubble: not drawn, not built.
- 2026-10-30, past midnight (Anthony: "the advice is still very poor"; then
  "do this, argon is the new model"): all fourteen Insights agents set to
  Google's newest flagship model in Admin → Agents (each agent's own model; the
  platform's default for agents stays the fast model, so nothing else moved).
  The brief now asks for a short story — what is happening, where, why it
  matters — not a list of figures, and to dig before writing: break the
  biggest change down by device, channel, kind of page and country until it
  knows where it happens; every step says where. Limits set so a bubble ends
  well inside Convex's ten minutes (one minute to choose, four and a half to
  read and write, two and a half for the second look). On morehandles.co.uk
  the specialist read the map's device view by itself and found that mobile
  brings more visits than desktop but 11.2% of mobile visits add to basket
  against 16.7% on desktop; steps named the pages and devices. 76 seconds from
  the press; $0.39 a bubble (it was about $0.06 on the fast model).
- 2026-10-31, after midnight (Anthony, asked how the bubble compared with his
  three notes, then "yes" to four changes): the page's parts are covered
  before the agent digs; two figures a sentence, eight a bubble (the rest left
  off), sentences under 20 words, words the screen never uses sent back; a
  gap of three times or more questioned as tracking first. A6 grows a judge:
  eval pages keep where they were looked at, so graded bubbles read the
  screens; the Head marks each of Anthony's notes found or missed. His three
  notes on morehandles' Conversions page are the first eval page. First
  grading: one of three found (about 25 visits for one conversion), the basket
  to checkout drop and the channels missed. A bubble costs about $0.39 and is
  written only when the page's figures change or three hours pass. Anthony then
  said each press should spend the company's credit allowance: not built,
  proposal to agree first.
- 2026-10-31, late (Anthony: "ok build the fix now"): the map read gains
  every conversion together a visit, a shop's steps each into the next
  (Google's standard basket, checkout and purchase events), and each view's
  standouts — highest and lowest rate among groups with 2% of visits or 100,
  biggest rise and fall — all in code; the bubble no longer spends a sentence
  on the boxes. The Editor went back to the platform's fast model at his word.
  Graded three times: one of three each time. Every bubble found about 25
  visits for one conversion (29). Two of three found the basket to checkout
  step (44.4% of basket visits started checkout; "over half of basket visits
  stop"), but the judge marked it missed against his "about a 10% drop": what
  his 10% measured is to ask him. None mentioned AI assistants. Tomorrow: a
  strong, cheaper ChatGPT model graded against these scores.
