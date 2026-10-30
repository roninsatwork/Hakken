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
  - **A1 not started**: tools a specialist can call in several steps need a
    tool-calling loop in the agent provider adapters
    (`aiProviderRegistry.generateTextWithResolvedModel` is one shot, no
    tools), across Anthropic, Google and OpenAI. That is a design decision
    for Anthony — which providers, what each tool may read, the cost of
    several calls a bubble — before it is built.
  Overall for this plan: about 45%.
