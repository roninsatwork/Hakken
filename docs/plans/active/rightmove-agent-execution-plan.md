# Rightmove Agent Execution Plan

**Created 2026-07-30. Status: partially implemented, still in progress.**

This plan makes the Rightmove Agent the single way property collection runs,
whether it is started by an admin from the agent screen or by a user from the
Properties Search screen.

The first execution-path problem has been fixed: the user-facing Properties
Search screen now queues the Rightmove Agent through
`propertyAgents.startRightmoveCollection` instead of calling Apify directly. The
remaining product problem is evidence linkage: the Apify collection run is still
reported through `apifyRuns`, and the plan still needs the visible connection
between the agent run, tool call, Properties Logs, and Scraped Data.

---

## Goal

Users should be able to start property collection from:

- the admin agent screen, by pressing **Run Agent**; and
- the user-facing Properties Search screen, by entering a Rightmove URL and a
  collection limit.

Both paths should create an agent run for the same Rightmove Agent. The Apify
collection it starts should be linked back to that agent run, so Activity,
Observability, Properties Logs, and Scraped Data all describe the same work.

---

## Current behaviour

- `/app/properties/search` calls `api.propertyAgents.startRightmoveCollection`.
- `startRightmoveCollection` validates the Rightmove search URL and limit,
  resolves the active Rightmove Agent, creates an `agentRuns` row, snapshots the
  agent version, and schedules `internal.agentRuntime.runTriggeredAgentObjective`.
- `startRightmoveScrape` still exists for direct Rightmove actor execution, and
  the agent/tool path still ultimately starts the known Rightmove Apify actor.
- `/app/properties/logs` reads `apifyRuns`, not `agentRuns`.
- The admin Rightmove Agent can be run from its own admin page, and the
  user-facing Search flow now starts the same agent-owned execution model.
- The remaining gap is that `apifyRuns` does not yet visibly link back to the
  `agentRuns` row or tool call that started collection.

---

## Product model

The Rightmove Agent owns the behaviour:

- collect Rightmove listings;
- use the configured collection tool;
- do not invent listings or counts;
- say plainly when the collection has only started;
- wait for Apify/webhook results to prove the final collection outcome; and
- stop retrying after the configured retry rule.

The user-facing Search screen supplies per-run inputs:

- Rightmove URL;
- collection limit; and
- later, any extra property filters the product explicitly supports.

The Search screen should remain a form, not become a chat box. The button can
still say **Gather Properties**, but behind it the product should start the
Rightmove Agent.

Respect the current UX and UI. This plan is about replacing the execution path,
not redesigning the Properties Search screen or turning it into a new agent
console.

---

## Phase 1 — Backend trigger for the user frontend

**Implemented.** `propertyAgents.startRightmoveCollection` now provides this
tenant-safe start path.

Add a tenant-safe backend function, for example
`propertyAgents.startRightmoveCollection`, callable by authenticated app users.

It should:

- require a signed-in user with an active company;
- validate that the URL is a safe Rightmove URL;
- clamp or validate the property limit;
- resolve the active Rightmove Agent for the user's company or the configured
  global Rightmove Agent;
- create an `agentRuns` row with a clear objective built from the URL and limit;
- schedule `internal.agentRuntime.runTriggeredAgentObjective`; and
- return `{ agentRunId, status }`.

Do not call the public API key path from the app frontend. The user is already
signed in, so this should use the tenant-authenticated backend path.

---

## Phase 2 — Search screen uses the agent

**Implemented for execution.** `/app/properties/search` now starts the Rightmove
Agent. The richer run-detail link from the success state is still part of the
remaining evidence-linking work.

Update `/app/properties/search` so submit starts the Rightmove Agent instead of
calling `api.apify.startRightmoveScrape` directly.

The UI should still feel like a property search workflow:

- URL input;
- global limit input;
- **Gather Properties** button;
- clear "agent started" success message;
- link to Properties Logs and, if available, the agent run detail; and
- clear error if the Rightmove Agent is not configured or inactive.

The screen should not expose the Apify actor id or Apify JSON settings.

---

## Phase 3 — Link Apify collection back to the agent run

When the Rightmove Agent calls the Apify tool, the Apify run must remember which
agent job asked for it.

Add optional fields to `apifyRuns`:

- `agentRunId: v.optional(v.id("agentRuns"))`
- `toolCallId: v.optional(v.id("agentToolCalls"))`

Add an index:

- `by_agentRun: ["agentRunId"]`

Thread those ids through:

- `apify.actor.run` in `convex/aiToolExecutionService.ts`;
- `startApifyActorInternal`;
- `startApifyActor`; and
- `recordRunStart`.

Direct Properties Search runs from older code and any non-agent Apify starts
must keep working with these fields absent.

---

## Phase 4 — Honest progress and outcome

Update the read side so the agent run can report the later Apify collection
result.

At minimum:

- `agentRuns.getRunDetail` should return a collection block for linked Apify
  runs;
- the job detail should say when Apify is still collecting;
- zero listings should be a warning, not a clean success;
- failed Apify collection should be visible on the agent run; and
- Properties Logs should make it clear which agent run started each collection
  when a link exists.

This overlaps with
`observability-collection-and-killswitch-handover.md`; that handover remains
the detailed checklist for honest collection reporting.

---

## Phase 5 — Keep standalone admin run working

The admin **Run Agent** path must continue to work.

Expected behaviour:

- no active run: the header button says **Run Agent**;
- active queued/running/pending-approval run: the same button says **Stop Agent**;
- stopping cancels the active agent run using `cancelRun`;
- once the run is terminal, the button returns to **Run Agent**; and
- runs started from admin and from the user frontend both appear in Activity.

If the admin run uses the saved standing job, that standing job should be plain
enough for a non-technical admin to understand.

---

## Phase 6 — Simplify the Instructions screen

After the execution path is right, make the Rightmove Agent instructions screen
less technical.

Do not make admins edit Apify JSON as the normal workflow.

Preferred UI:

- **What this agent does**
- **What the user provides**
- **Collection limit**
- **What it says when collection starts**
- **What it must never invent**
- **What to do if collection fails**
- **Advanced raw prompt** behind a collapsed control

The screen may still save `standingObjective` and `systemPrompt` at first. A
later iteration can introduce structured agent configuration if it removes real
complexity.

---

## Acceptance criteria

- Starting from admin creates an agent run.
- Starting from `/app/properties/search` creates an agent run for the same
  Rightmove Agent.
- The user-facing flow no longer calls Apify directly as its primary path.
- The agent-started Apify run links back to the agent run.
- Properties Logs and agent Observability agree on pending, completed, empty,
  and failed collection outcomes.
- The Search screen does not require the user to understand Apify.
- The Instructions screen no longer presents raw Apify actor JSON as the main
  editing experience.
- Tenant isolation holds: a user cannot trigger another company's agent or see
  another company's collection status.

---

## Verification plan

Before merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Focused verification during implementation:

- unit tests for the tenant-safe trigger;
- tests that URL and limit validation reject unsafe input;
- tests that Apify rows can store `agentRunId` and `toolCallId`;
- UI tests for Properties Search success/error states;
- browser verification that the Search screen starts the agent and links to
  status; and
- browser verification that admin standalone run still works.

Starting a real Rightmove collection can spend Apify money. Get explicit
approval before running a live collection.

---

## Out of scope

- A new chat-style UI for Properties Search.
- Per-run Apify spend ceilings. That needs a separate limit model.
- Replacing all generic Apify support. This plan only makes the Rightmove
  property workflow agent-owned.
- Pushing to `dev` without explicit approval.
