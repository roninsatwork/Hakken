# Research Agent Autopilot Plan

Written 2026-08-03, after a run that did a thirtieth of the job and reported
success.

## Where this has got to

Built on 2026-08-03: the job record and its queue, the fixed phase order, the
tool that hands a run its next task, prospects joining the queue as the chain
pass finds them, retry-twice-then-record-as-undone, the job carrying on past a
dead run, the three end states, the job's own spend ceiling, the progress line
and stop button, and run titles. 3,879 tests pass.

Later on 2026-08-03, the first live press exposed three faults, all fixed the
same day:

- **Every triggered run died silently at its first three-minute handover.** The
  continuation refused to resume a run with no chat thread — it deleted the
  checkpoint and reported success, leaving the run marked RUNNING for ever and
  invisible to the stall sweeper. The job's runs are all triggered, so no run
  could ever work longer than one segment. The continuation now resumes
  threadless runs, taking the owner from the run row so the resumed segment
  rebuilds its tools with the right workspace.
- **The job recorded £0 spent.** A run only writes its cost onto its own row if
  it lives to finish, so dead and cancelled runs cost the job nothing and the
  spend ceiling bounded nothing. The job now sums the run's steps, which are
  written as the money is spent.
- **One crashed watchdog tick ended supervision for good.** A mid-edit deploy
  crashed the tick, nothing rescheduled it, and the job sat unsupervised. The
  tick now reschedules itself even when it fails.

The run screen work (step 5's second half) is done: the page leads with **What
it recorded** built from the rows the run wrote, the model's prose is collapsed
under "the agent's own account, unchecked", and the step graph names each call's
subject — "Used Firecrawl · allegracare.co.uk", not forty identical lines.

Step 6 — proving it on the real workspace — began 2026-08-03 ~10:10 with a
clean CRM (the reset had been run) and a queue of 49 items.

## What the live run taught, while it ran

The engine held: the handover survived its three-minute mark, runs ended on
their ceilings and the next run picked the queue up each time with nobody
touching anything, and zero items had failed at 63% of the customer pass. Two
runs in, the per-run bounds were raised on the settings screen from 100 steps
and calls to the 500 Anthony had already approved, so later runs cover more of
the queue per pound of context.

The screens failed the watcher twice more, both in the same way — a number that
had stopped being true:

- **The run page froze mid-run.** It read the *first* 500 step rows of a run
  and a working run writes ~80 a minute, so a few minutes in, the window filled
  and stopped following. Anthony: *"does the UI have an update limit"* — it
  did, and it took the oldest rows. It now reads the newest and keeps moving.
- **The spend figure trailed by one whole run.** The job banks a run's cost
  when the run ends, so the screen said £11.04 while £18.64 had been spent —
  during the exact minutes a person was being asked to think about money. The
  job description now adds the working run's step costs, read live.
- Also learned: the Dashboard tab — where a person instinctively watches — only
  gains a row per finished run, so it sits still while the agent works hardest.

The lesson under all three, named by Anthony (*"the UX of the UI is shit"*):
**the screens are shaped around runs, but the thing a person watches is the
job.** Run pages go stale by design, because runs end. The follow-on piece of
work is one job page that never goes stale — progress, live spend, what it is
researching this minute, and everything recorded so far across every run, with
runs demoted to forensic detail. Not started; proposed as the next piece after
the proving run ends.

A cheaper model was tried between the two jobs, twice. The first pick was from
a provider the agent engine has no adapter for, and the run refused honestly at
the first step — the runtime names the provider and says it cannot run it. The
agent engine today drives one provider's models only; chat and titles can use
the others, agents cannot. The second pick — the same provider's budget tier —
worked immediately and cut the finisher's cost to roughly a sixth of the
morning's rate. **Follow-on piece: an adapter per enabled provider for the
agent runtime** — streaming, tool calls, checkpoint handover and per-model
pricing — so the model choice on the agent screen is real for agents, not just
for chat. Roughly a day each. Until then, the model dropdown offering agents a
model the engine cannot run is a trap for the person the screen was built for.

The second job exposed a queue-building leak: customers whose only open items
are **parked findings** (saved as needs-a-check, awaiting review) are counted
as "still has gaps" and re-queued every job. The run then re-visits them,
finds nothing new to save, and marks them done — twenty to sixty seconds of
spend per customer for nothing recorded. It also made the run screen look like
a contradiction: a busy step graph over "this run recorded nothing", both
honest. Fix: a parked field is not a gap; `describeGaps` should count it as
already searched. One line, to land after the proving run ends rather than
changing the rules mid-flight.

Money, from the live figures: a business costs roughly 50p to research
properly. The full job — customers, chains, prospects — projects to £50–60,
against the £25 default ceiling the job started with, so this first job will
stop at its ceiling with work remaining unless the ceiling is raised. The stop
is safe and resumable: findings keep, a second press researches only what is
still missing. The default ceiling for a job this size wants revisiting once
the true total is known.

## What it has to do

One instruction from Anthony, three tasks, no supervision:

1. Go through **every customer** in the workspace and find the details that are
   missing — address, postcode, phone, email, and the one extra figure that
   customer type carries.
2. Go through **every chain** those customers belong to and find the sites in it
   the workspace does not already supply. File each one as a prospect.
3. Go through **every prospect it just found** and find that prospect's details,
   to the same standard as a customer.

Finished means finished: every customer, every chain, every prospect, each one
either filled in or explicitly recorded as "looked for, not found". It runs to
completion on its own. The only things a person does are press start once, and
read what it says when it stops.

## What is wrong today

Pressing "Fill in what's missing" did not start *a* job. It queued one separate
agent run per customer — up to sixty at a time, four seconds apart. "Find more
sites" did the same per chain. On this workspace that produced **141 runs**, and
about a quarter of them died on their own tool-call ceiling with their work half
done.

Three things follow from that shape, and they are the real fault:

- **No run owns the job.** Each run knows about one customer. Nothing in the
  system holds the sentence "there are 39 customers and 12 are done", so nothing
  can tell whether the work is finished, and nothing retries what died.
- **A failure is invisible.** A run that hits its ceiling ends marked FAILED in a
  list of 141. The list still says the sweep started, so the screen reads as
  though the work happened.
- **It pays for the same context 141 times.** Every run re-reads its instructions
  and re-establishes what it is doing, for one customer's worth of output.

The fan-out was not forced by the platform. The runtime already checkpoints a run
every three minutes and continues it in a fresh action, up to thirty segments —
about ninety minutes of continuous work inside a single run, surviving restarts.
That machinery was built for exactly this and the sweeps do not use it.

Being straight about the cause: each round of this was built to the button that
was asked for — one customer, then all customers, then all chains — and never to
the job underneath. That is why it keeps nearly working.

## The design

### One job record

A `salesDataResearchJobs` row per workspace, holding what the job is for and how
far it has got: counts of customers, chains and prospects done against total, the
phase it is in, when it started, and how it ended. This is the thing that knows
whether the work is finished. It is also what the screen reads, so progress is
one number from one place rather than inferred from a run list.

At most one job may be active per workspace. Pressing start while one is running
shows the running one instead of queueing a second.

### One run, working a queue

The job starts a single agent run whose objective is the whole job. Its loop is:

    ask for the next piece of work  →  do it  →  record the result  →  repeat

The agent gets one new tool, `nextResearchTask`, which returns the next item and
what is missing from it, or "nothing left". The order is fixed in code, not left
to the model: all customers first, then all chains, then every prospect the chain
phase produced. Phase three is fed by phase two inside the same run, which is why
this cannot be three separate buttons pressed in sequence.

Recording results uses the tools that already exist and already hold the rules
about what a finding is worth (`recordResearchFinding`, `recordProspect`). None
of that judgement moves into the model.

For customer and prospect detail work, the queue is ordinary except for one
priority: the size field for the customer type. Bedrooms for care homes and
hotels, and pupils for schools, feed the opportunity report's per-unit pricing.
A record missing that field is handed out before a record whose only gaps are
lower-value contact details. If an agent says the size field is not published,
it must cite a page it actually opened in that run; a bare "not found" is refused
for that field so the report-critical number is not closed after a shallow
search.

For prospecting, the queue is the authority. When a run claims a chain item, the
prospecting read and write tools must be bound to that item:

- a no-name "Read a group" call returns the chain already claimed by this run;
- asking to read another group is refused and tells the agent which chain it is
  currently working;
- recording a site against another group is refused before anything is written.

This closes the reliability gap where the progress line could say the job was
working one chain while the model asked the tool for a different "next" group.
The prompt still helps the model, but the backend owns the checklist.

### Running to completion

- The run uses the existing checkpoint-and-continue machinery rather than being
  capped at one customer's worth of budget. Its per-run ceilings are raised to
  suit a job of this length.
- When a run exhausts its segments, the job starts a fresh run that picks up the
  queue where it stopped. The job record is the handover, so nothing is lost.
- An item that fails twice is marked "could not be done", with the reason, and
  the job moves on. One awkward chain must not stop the other twenty-nine.
- The job ends in one of three states, and always says which: **Complete**,
  **Complete with exceptions** (with the list), or **Stopped** (by a person, or
  by the spend ceiling).

### What the person sees

One line on the customer screen: what it is doing now, how far through, and a
stop button. When it finishes, what it found and what it could not do. No run
counts, no "queued 60".

## What bounds it, and why today's bounds block it

The agent is currently set to: **24 steps · 20 tool calls · 1,000,000 tokens ·
30 minutes · £5**. Every one of those is counted across a whole run and does not
reset when a run checkpoints and continues, so they are ceilings on the entire
piece of work, not on a burst of it.

**Tool calls at 20 is what you have been watching fail.** Reading one site costs
several calls — ask for the group, fetch the group's own page, fetch a site page,
record the finding — so a chain of any size exhausts twenty before it is
finished. That is the exact message on a quarter of those 141 runs: *"Agent
stopped after reaching the maximum tool-call limit of 20."* It is also below the
platform's own default of 25, so the agent has been running with less room than
an agent nobody configured.

Then the arithmetic that decides the shape of the whole thing. The job is about
**39 customers + ~30 chains + every prospect those chains produce** — call it a
hundred-plus items, at three to six tool calls each. That is several hundred tool
calls. The platform's hard ceiling for a single run is 100 tool calls, 100 steps,
60 minutes and £50, and those ceilings exist for good reasons.

**So one run cannot do the lot, and no setting will make it.** This is the point
that matters for the plan: the thing that runs to completion has to be the
**job**, not the run. The job owns the queue, and starts run after run until the
queue is empty — each run doing ten or so items properly and handing on. It will
still take a number of runs; the difference from today is that something owns
them, retries what failed, knows when the work is finished, and reports once.

What changes:

- **Per-run bounds go up to the platform ceiling for this agent** — 100 steps,
  100 tool calls, 60 minutes, 10,000,000 tokens. These stop a runaway; they are
  not meant to be where the work stops.
- **Spend moves to the job.** One figure — "this will cost about £X, ceiling
  £Y" — shown before it starts and enforced across every run the job launches.
  The per-run £5 stays underneath as a guard against one run going mad.
- **Hitting a per-run ceiling stops being a failure.** The item goes back on the
  queue and the next run picks it up. Only an item that fails twice is recorded
  as "could not be done".

Without the first of those, the plan delivers the same half-finished chains in a
tidier wrapper. With them, and with the job owning the queue, total research is
reachable.

## What a run says it did

The run screen currently opens with a block headed **"What it came back with"** —
several hundred words of the model's own prose, listing sites with a status
against each. Below it sits **"Where the time went"**, the step graph, which is
the actual record of what the run did. Two accounts of the same run, and the
longer, softer one is on top.

The prose is not evidence. It is the model narrating itself at the end of the
job, written before anybody checked it against the database. In the Allegra Care
run it listed nine sites: eight it said it had "Recorded as prospect", and one it
said was "Already supplied on file". Eight prospect rows exist, so that account
happens to be true — but nothing on that screen tells the reader which lines are
recorded facts and which are the model's claims, and a run that says it filed
something it did not file would read exactly the same.

Anthony, 2026-08-03: *"I don't know what this is, as we have information in each
step — understand the step graph."* That is the fix. The step graph already
holds, per step, what was read and what was written. The screen should lead with
that.

- The run opens with **what was recorded**: one line per site or per detail,
  built from the rows the run actually created, each one linking to the step that
  created it. Site, outcome, source.
- Outcomes are named plainly and kept distinct: **added as a prospect**,
  **already a customer**, **rejected** (with the rule that rejected it), **looked
  for, not found**.
- Anything the model's summary claims that has no recorded row behind it is shown
  as **claimed, not recorded** rather than being quietly presented alongside the
  real ones. That line is a bug report, and it should look like one.
- Each step says what it did in those same words, not a JSON blob.
- The model's own write-up stays, collapsed, labelled as the agent's account of
  its work rather than as the result.

This applies to every run of this agent, including the ones the autopilot job
starts for itself, and it is what the job's closing report is assembled from.

## What a run is called

The run page is headed by the agent's own instruction, set in the page-title
style. For this agent that instruction is a paragraph — *"Read a group with no
group name given - you will be handed the next group nobody has looked through
yet. Find every site in that group and record each one. Prefer the group's own
list of its sites over any single register page."* — so the reader gets three
lines of large bold text telling them what the agent was told, where the name of
the job should be.

It is not a styling accident. The screen has a special case that gives one kind
of run — Rightmove property collection — a short title and a quiet detail line
underneath. Every other agent falls through that case to "use the whole
objective as the title". One agent was given a name and the rest were left with
their instructions.

Anthony, 2026-08-03: *"what is this and why is the font so large."*

- A run is titled by **what it was working on**: `Allegra Care · find sites`,
  `Fairmile Grange · fill in details`. Short enough for one line.
- Underneath, one quiet line of context: the phase it belongs to, and the job it
  is part of once the autopilot exists.
- The full instruction stays on the page, in body text, under a plain heading —
  available to read, not shouted.
- The naming is a property of the run rather than a special case in the screen,
  so a new agent gets a proper title by default instead of inheriting this bug.
  The Rightmove special case is deleted at the same time.

## How we will know it worked

These are the acceptance rules. The job is not done until every one passes on the
real Comax workspace:

1. Every customer in the current import has either its details filled in or a
   recorded "looked for, not found" against each missing field.
2. Every chain in the import has been searched at least once, and says when.
3. Every prospect the run created has been through the same detail research as a
   customer.
4. The job ends **Complete**, from a single press, with nobody intervening.
5. Pressing start again immediately afterwards reports there is nothing to do,
   rather than repeating the work and the spend.
6. A run killed mid-way (deploy, restart, timeout) resumes and still reaches
   Complete.
7. The whole job on this workspace costs less than the 141-run version did, and
   the figure is shown before it starts.
8. Every run is titled by what it worked on, in one line, with its instruction
   readable but not shouted.
9. Every site or detail a run's summary mentions is either traceable to a
   recorded row, or is marked on screen as claimed but not recorded.
10. No item is left unfinished because a run hit a ceiling. Reaching one is a
    handover to the next run, and the job still ends Complete.

## Order of work

1. The job record and its progress figures, with the states above. — half a day
2. `nextResearchTask` and the fixed phase order; the job driving one run through
   the whole queue. — one day
3. Continuation across runs, retry-twice-then-skip, and the three end states. —
   half a day
4. The progress line and stop button on the customer screen. — half a day
5. Run titles, and the run screen leading with what was recorded. — half a day
6. Prove it against the real workspace, all nine rules. — half a day

Roughly three and a half days. The two sweep buttons and their fan-out are deleted at step
2, not left beside the new path.

## The two-agent split (agreed 2026-08-03, not yet built)

Anthony created the second agent himself — **Prospect Search Agent** beside the
**Company Research Agent** — and the split is agreed as the right shape: one
skill per agent, each with its own model, instructions, tools and spending
guard. The job stays the only conductor; it hands chain tasks to the finder
and detail tasks to the filler, and neither agent ever decides its own work.

What the split includes, from the discussion:

1. The job routes by task kind and starts runs on the right agent per phase.
   Pressing Run Agent on either agent starts or joins the one workspace job.
2. Instructions rewritten one-skill-each; tools bound to match, so the
   boundary is enforced, not just described.
3. Per-agent spend lines in the job's report — "finding cost £X, filling cost
   £Y" — under the job's single ceiling.
4. Run titles name the worker: "Prospect search · run 2", "Research · run 4".
5. **Starting from the user frontend as well as the agent screen.** This
   supersedes the earlier instruction that only the agent screen may start it:
   Anthony, 2026-08-03, now wants both. The frontend gets a new row beneath
   the database section on the customers screen showing the job's progress
   bar while it works, so a user can see the system is working without the
   admin screens.
6. The agents list must show that an agent is working while it has a run in
   flight — today its status column says "Active" whether it is running or
   idle, and nothing on that screen changes during a run.

## What this plan does not do

- It does not schedule itself nightly. It is started by a person, because it
  spends money.
- It does not change what counts as a good finding, or the rules that stop a
  prospect being filed against a site already on the books.
- It does not touch the imported spreadsheet, ever. See
  optional module (not included in this copy) for why that sentence is in this document.
