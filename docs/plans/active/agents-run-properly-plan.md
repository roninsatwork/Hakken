# Pressing Run should actually run the agent

**Started 2026-07-29.** Anthony asked why the Rightmove Agent's observability
screens never showed Firecrawl, when he remembered the agent scraping. The
screens were right. The agent had not scraped, because the button that runs it
cannot.

---

## What is actually wrong

### 1. There are two engines, and the button uses the crippled one

Chatting to an agent runs the real engine: `runAgentObjective` builds a loop
context, hands the model its tools, and iterates — call something, read the
result, decide again — up to the agent's step budget.

Pressing **Run Agent**, or a schedule firing, goes somewhere else entirely.
`runTriggeredAgentObjective` makes a single `generateTextWithResolvedModel`
call with **no tool declarations at all**, writes a MODEL step and a FINAL step,
and stops. It is not a shortened agent loop; it is a text generation wearing a
run's clothes.

So a triggered run cannot call Firecrawl, or Apify, or anything else, whatever
it is asked to do. That is why every waterfall on that agent reads *read the
request, thought about it, wrote the answer* and why `agentToolCalls` is empty
across the whole deployment.

### 2. Nothing says what the agent should do

The objective handed to a manual run is the agent's own database id:

    Manual run for scheduled agent mh75esr2sejpx6n4ammbv259kn86729c

A schedule is no better — `Scheduled run: ${schedule.name}` — because the
`schedules` table stores a name and an interval and nothing about the work.

So even on the good engine the agent would have nothing to act on. It currently
does the only sensible thing: it replies asking for instructions.

### 3. The agent record has nowhere to put a standing job

`agents` has `name`, `description` and `systemPrompt`. The system prompt shapes
*how* it behaves; nothing states *what* it should do when nobody is typing.

---

## The Rightmove Agent, as it actually is

Checked against the live deployment on 2026-07-29, because too much of this was
being reasoned about from code rather than from the record.

- **It has no instructions at all.** Its system prompt is empty. The line under
  its name — "Apify based Agent to scrape right move" — is a description shown
  on screens and never sent to the model.
- **Nothing schedules it.** The only schedules belong to the Sales Report Agent
  and one orphaned row. The phrase "manual run for scheduled agent" in its
  history is just misleading text.
- **The Apify tool is attached to it.** Firecrawl is installed but not attached.
- **It has never called a tool.** `agentToolCalls` is empty across the whole
  deployment.
- **Its first real tool call will park for approval.** The agent has
  `autonomousToolExecution: false`, and anything reaching outside the platform
  requires confirmation, so the call stops and waits for a person. It appears
  as *Needs you* on Activity, not as a failure. Correct, but surprising.

The scraping that does work is a different path entirely: Properties → Search
takes an address from a person, starts the Apify Rightmove actor directly,
and Apify calls our webhook when it finishes. That path never touches an agent,
which is why none of it appears on any observability screen.

## What is already true

Worth writing down, because it is what makes this tractable:

- The loop touches a conversation far less than its signature suggests. Across
  `executeObjectiveLoop` and `buildLoopExecutionContext`, `thread` is used only
  for `companyId`, `userId`, and streaming its reply into a message.
- Streaming is already conditional — `createStreamState()` takes an optional
  message id, and the loop guards on `stream.messageId !== undefined` in most
  places. The exception is the point where it *creates* a message if there is
  none.
- Approvals, checkpoints, budgets and tool policy all live in the loop, so a
  triggered run gets them for free once it uses it.
- Apify and Firecrawl are already registered tools. Nothing more is needed from
  them.

---

## Decisions

### One engine, not two

The cut-down path is deleted rather than improved. Two engines means two sets
of behaviour for "run this agent", and the weaker one is the one every schedule
and every button uses.

### A run does not need a conversation

Rather than inventing a hidden thread per run, the loop takes an **owner** —
the company and the person the work belongs to — and a conversation becomes
optional context rather than a precondition. A hidden thread would leave
thousands of empty conversations behind and put scheduled work into a screen
people read as their own chat history.

### An agent gets a standing job

One field, in the agent's own words, describing what it should do when run with
no other instruction. Schedules may override it; the button uses it as-is.

---

## The plan

Roughly two days. Step 1 carries the rest.

### Step 1 — let the engine run without a conversation (1 day)

1. Replace the `thread` dependency in `buildLoopExecutionContext` and
   `executeObjectiveLoop` with an owner: `{ companyId?, userId? }`, sourced
   from the thread when there is one.
2. Make the streaming site that *creates* a message do nothing when the run has
   no conversation, rather than creating one.
3. No behaviour change for chat. This step is done when the chat path is
   byte-for-byte equivalent in behaviour and every existing runtime test passes
   untouched.

### Step 2 — point the button and schedules at it (0.5 days)

1. `runTriggeredAgentObjective` builds a loop context from the owner and runs
   `executeObjectiveLoop`.
2. Delete the single-shot generation, and the `maxSteps: 1` that went with it.
3. Approvals now apply to scheduled work, which they never have. Check what a
   parked scheduled run looks like on the Activity screen before calling this
   done.

### Step 3 — say what the job is (0.5 days)

**Anthony's design, agreed 2026-07-29.** The screen at Governance → Prompt
becomes **Instructions**, and carries two fields:

| Field | What it is |
| --- | --- |
| How it behaves | Today's system prompt. Tone, rules, what it must never do. |
| What it should do | The standing job. |

The rule for the second field is the whole design:

- **Filled in** — every run uses it as its objective.
- **Left blank** — whatever starts the agent must supply the instruction. The
  Run button then refuses outright and says so, rather than running, spending
  money and coming back with "please provide the details".

"Prompt" is developer vocabulary on a client-facing screen, which is why the
screen is renamed at the same time.

### Step 4 — the Search screen passes its address in (0.5 days)

Properties → Search already asks a person for the one thing the agent cannot
invent: which Rightmove search to collect. That screen can start an agent job
with the address as its run-time instruction — the "left blank" case above.

Deliberately **not** changing what the existing "Gather Properties" button
does. It is a direct call that works, and putting a model in the middle of it
would add cost and a new way to fail for a job where the person has already
made every decision. The agent earns its place on the unattended case, where
nobody is there to paste anything.

---

## Not in scope

- **A per-run spend ceiling on Apify.** The generic tool lets an agent choose
  its own jobs, and Apify bills per item. Raised at the time and deliberately
  left: it needs a limit model, not a constant.
- **Installed tools following the catalogue.** A tool keeps whatever the
  catalogue said on the day it was installed, so editing a built-in tool's
  description has no effect on agents already using it. Real bug, separate fix.
- **Live watching of an in-flight job**, and **per-agent alerting**. Both were
  already out of scope for the observability plan and remain so.

---

## Verification

- The gate before merge: `npm run verify:env`, `npm run lint:all`,
  `npm run check`, `npm run build`, `git diff --check`.
- `npx convex dev` must be running, or none of it exists on the backend. A
  whole screen was reported broken this session for exactly that reason, and no
  test can catch it — tests run against a simulated backend.
- The gate on this plan is a real agent, run from the button, calling a real
  tool, with the tool call visible in its waterfall. That single case is what
  the platform cannot do today.

---

## Blocked: Gemini 3 rejects the second turn of any tool call

**Found 2026-07-29, by running it.** With the engine, the tools and the Apify
credentials all in place, the Rightmove Agent asked to use Apify, was approved,
started the job — and the run then failed with:

> Function call is missing a thought_signature in functionCall parts.
> Additional data, function call `default_api:apify_actor_run`, position 2.

**Cause.** Gemini 3 attaches a `thoughtSignature` to each `functionCall` part
and requires it back when the conversation continues.
`buildToolInteractionTurns` in `agentRuntimeService.ts` rebuilds that turn from
`{ name, args }` alone, so the signature is dropped. It is never captured in the
first place: `vertexProviderService.ts` reads `chunk.functionCalls`, the SDK's
convenience accessor, which omits it — the signature lives on the raw
`parts[].thoughtSignature`.

**Scope.** Not Apify-specific. This breaks every tool on every Gemini 3 model,
which is why `agentToolCalls` is empty across the whole deployment.

**Fix.** Read the raw parts rather than the accessor, carry the signature on
`ExecutedAgentToolCall`, and emit it in `buildToolInteractionTurns`.

**It is bigger than it first looks, because of approvals.** A run that parks for
approval resumes in a later action, and `resumeApprovedToolCall` rebuilds the
model turn from the `agentToolCalls` rows — name and arguments read back out of
the database. Nothing in memory survives the park. So the signature has to be
*stored* on the tool call row when the call is first recorded, not merely passed
along in memory, or every approved call will keep failing exactly as it does
now while unapproved ones start working.

That makes it: a schema field, the writer that records a tool call, the provider
read, the in-memory path, and the resume path. Verify with a real approved tool
call reaching its second turn — a unit test on `buildToolInteractionTurns` alone
would pass while the thing a user does still fails.

## Also outstanding: an approved tool call records no outcome in the raw log

A tool call that stops for approval resumes through `resumeApprovedToolCall`,
which never writes an `agentLogs` entry. So the raw log shows "waiting for
approval" and then nothing, even when the run fails seconds later — breaking
that screen's own promise to show what came back. Ordinary tool calls were fixed
in the observability plan's Phase A; this path was missed.
