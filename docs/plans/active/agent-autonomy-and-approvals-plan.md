# Agent autonomy and the approvals queue — make the brake optional, and make it visible

**Started 2026-07-26.** The approvals queue at `/admin/agents/approvals` has never
held a single row. Not "none today" — the only non-test code path that can insert
into `agentRunApprovals` is `insertApprovalInternal` (`convex/agentRuns.ts:1707`),
reachable solely from the live runtime, and no seed, script or demo has ever
reached it. Git shows two commits on the page: the one that created it and one
refactor.

That emptiness is not because the gate is off. It is because the gate has never
been tripped by real traffic — and when it is, the run will park silently and
nothing anywhere will say so.

Every part of human approval on this platform is either missing, mis-wired or
unreachable, and this plan closes all of it. Agents that should run unattended
cannot. Agents that stop have no way of telling anyone. A turn that needs two
approvals silently loses one. An approval nobody answers waits for ever. A
rejection kills the run instead of teaching the agent. And there is a **second,
entirely separate approval system** for workflows that has no UI, no timeout, no
tests and an authorization hole.

Nothing is deferred out of this plan. Where an earlier draft parked something,
that item is now a phase.

**Phase 0 is a live security fix and should ship on its own, ahead of everything
else.** `resumeApprovalStep` (`convex/workflowRuntime.ts:353`) is a public action
declared with `tenantAction`, whose guard is `guardedActionCtx("authenticated")`
(`convex/tenantFunctions.ts:141-153`) — **any signed-in user of any role**. It
never checks the caller's company against `execution.companyId`, and never checks
that its `workflowId` argument matches `execution.workflowId`. Every other
workflow function on the platform requires super-admin (`convex/workflows.ts`,
`convex/scheduler.ts`). No test covers it.

A `USER`-role account holding an execution id and a node id can approve or reject
any other tenant's workflow step. That is a cross-tenant authorization failure on
a write path, and it does not wait for the rest of this plan.

---

## What is actually wrong

### The gate can only tighten, never loosen

`getToolConfirmationRequired` (`convex/agentRuntime.ts:95-102`):

```ts
if (agentRequiresApproval === true) return true;
return sideEffectLevel === "READ" ? (configured ?? false) : true;
```

Any tool that is not a plain read returns `true` unconditionally. There is no
field, flag, template or mutation argument that can make a write, a send or an
external call run without a human. `agents.humanApprovalRequired` only escalates:
`true` pulls reads into the gate as well, `false` leaves the write gate exactly
where it was.

So an agent with a single write tool cannot complete a run unattended, by any
route. That is the requirement being added.

**The polarity trap.** `humanApprovalRequired` cannot be reused for this.
`convex/agentService.ts:29` writes `args.humanApprovalRequired ?? false` on
creation, so effectively every agent in existence carries `false`. If `false`
were redefined to mean autonomous, every agent on the platform would lose its
brake in one deploy, silently. A new field is not tidiness here, it is the only
safe shape.

### A turn that needs two approvals loses one, and corrupts the transcript

A single model turn can request several tools at once. The loop iterates them at
`convex/agentRuntime.ts:1224`. When one needs approval, the block at `:1279-1414`
queues that one row and then **`return`s out of the whole action** at `:1413`,
with the checkpoint saved at `loopIndex + 1` — the next model turn. Every call
after the gated one in that batch is discarded. The model has to notice and
re-request them.

That is the fault recorded as deliberately deferred at
`docs/plans/active/platform-hardening-plan.md:665-668`. It is real but it is not
the worst of it.

**The transcript already does not match what the model sent.** A model turn
declaring three tool calls must be answered by one function-response turn
containing three results — that is the provider contract. Today, on a mixed
batch:

- the calls that ran before the gated one are pushed as their own turn at
  `:1397-1399` before parking,
- then `resumeApprovedToolCall` pushes a *second* turn containing just the
  approved call (`agentRuntime.ts:2148-2152`).

So one assistant turn requesting three tools gets answered by two separate
response turns covering two of them. That is a latent transcript-fidelity fault
that exists right now, at every mixed batch, independent of batching support.
Fixing the batch and fixing this are the same change, which is the argument for
doing it now rather than deferring it again.

There is no way to tell which tool calls belonged to which model turn.
`agentToolCalls` (`convex/schema.ts:702-739`) carries `runId` and `startedAt` but
nothing identifying the turn, so the batch cannot currently be reassembled even
if we wanted to.

### An approval nobody answers waits for ever

`recoverStalledRuns` (`convex/agentRunCheckpoints.ts:162-167`) filters on
`status === "ACTIVE"` and deliberately leaves `AWAITING_APPROVAL` alone — a run
waiting on a person is not a run that died. Correct, but nothing else picks it
up either: `convex/crons.ts` has no approvals job of any kind.

So a parked run holds its checkpoint, its `PENDING_APPROVAL` status and its place
in every count indefinitely. The `agentRunApprovals` row never leaves PENDING.
The tokens already spent were billed at `:1351-1359` and the work is never
finished. Six months later it is still there, still counted.

### A rejection kills the run instead of telling the agent

`decideApproval` on REJECTED (`convex/agentRuns.ts:1263-1306`) writes a `FINAL`
step and sets the run `FAILED`. The model is never told. From the agent's side the
conversation simply stops mid-thought.

So a reviewer who thinks "not that way, but do carry on" has no button for it.
Their only options end the run, and the objective — which may have been most of
the way done — is thrown away along with everything already paid for.

It also makes two of the three buttons on the screen redundant. Reject sets
`FAILED`, Cancel sets `CANCELLED`, and both stop the run dead. A reviewer cannot
tell from the screen why there are two.

### The expiry window would be unreachable, like every other threshold

Worth recording because it shaped the design: **no operational threshold on this
platform is configurable by an admin.** `PENDING_APPROVAL_THRESHOLD_MINUTES`,
`STALE_RUNNING_THRESHOLD_MINUTES`, `HIGH_COST_AGENT_THRESHOLD_GBP`,
`BUDGET_WARNING_PERCENT` and `REPEATED_PROVIDER_FAILURE_THRESHOLD` are all module
constants in `convex/analyticsCron.ts:78` and following. The system health screen
displays them as text and has no inputs.

The one exception is the purge retention policy, which is a proper configurable
operational limit: a `systemConfig` row under `"PURGE_PIPELINES_CONFIG"`, a
super-admin getter and setter that enforces a hard minimum
(`convex/purges.ts:19-73`, `convex/purgeScheduleService.ts:63-100`), and a section
on the settings screen. That is the pattern to copy, and it is the reason the
expiry window can be made configurable without inventing anything.

### The only brake that survives autonomy is also unreachable

This is the one that makes the budget fields part of this plan rather than a
neighbouring chore.

Turn the Phase 1 toggle off and an agent runs writes, sends and deletions with no
human anywhere in the loop. What stops it running away is then no longer approval —
it is the budgets: how many steps it may take, how many tools it may call, how long
it may run, and how much it may spend. Those four are the safety story for an
autonomous agent.

All four are write-dead. `maxSteps`, `maxToolCalls`, `maxRuntimeMs` and `maxCostGBP`
exist on the agents table (`convex/schema.ts:1654-1662`) and are honoured by
`resolveAgentObjectiveLimits` (`convex/agentRuntimeService.ts:111-135`, clamped via
`clampLimit` at `:73-78` against `AGENT_OBJECTIVE_LIMIT_CEILINGS` at `:45-53`), and
they appear in the arguments of neither `createAgent` (`convex/agents.ts:827-833`)
nor `updateAgent` (`:927-952`). Grep finds the four names nowhere in `src/` beyond
two descriptive strings on the system health screen
(`admin/settings/system-health/page.tsx:194,399`).

So every agent on the platform runs on `DEFAULT_AGENT_OBJECTIVE_LIMITS`
(`agentRuntimeService.ts:10-17`) — 10 steps, 8 tool calls, 5 minutes, £1 — and no
route exists to change any of it. Shipping autonomy while the only remaining limits
cannot be set would be handing someone the keys and telling them the brakes are
adjustable when they are welded shut.

`maxInputTokens` and `maxOutputTokens` are a deliberate exception:
`resolveAgentObjectiveLimits` (`:130-131`) always takes them from the default
constant, and that stays as it is.

### There is a whole second approval system, and it cannot be used at all

Workflows have their own human-approval mechanism, unrelated to agent runs, with
no shared code, no shared table and no shared screen.

**Building one works.** `WorkflowSidebar.tsx:22` offers a draggable "Human
Approval" node. `ConfigDrawer.tsx:896-935` configures its message and a preview
template. The builder registers it (`admin/workflows/[id]/page.tsx:87`). Save it,
run it, and `executeApprovalNode`
(`convex/workflowRuntimeService.ts:552-561`) returns a `_system.halt` payload
which `processNodeFinalization` (`convex/workflowEngine.ts:425-448`) turns into a
step marked `PENDING_APPROVAL` with no downstream steps created.

**Deciding it is impossible.** `resumeApprovalStep` has no caller anywhere in
`src/`. The screens that called it —
`admin/workflows/logs/page.tsx` and `admin/workflows/logs/[id]/page.tsx` — were
deleted in commit `cc5bc9558` ("Update agent admin workflows", 2026-07-02), and
the approval node was left in the builder. No query lists steps awaiting
approval; every step-reading function in `convex/workflowExecutions.ts` is
internal, and the two public ones in `convex/scheduler.ts:250,274` have no caller
either. There is no admin screen showing workflow executions at all — the
workflows list shows definitions, the builder shows the graph, and after you press
run there is nowhere to see what happened.

**And the platform still tells people to use it.** The in-app hint at
`ConfigDrawer.tsx:899` says approval happens "from the execution logs".
`docs/developer/workflow-automation.md:107`,
`docs/developer/workflow-runtime-internals.md:118`, `WORKFLOWS.md:68` and
`docs/end-user/workflow-automation.md:121` all say the same. One of those files
contradicts itself twelve lines apart (`workflow-automation.md:67` vs `:107`).

Four more faults in the same mechanism, all untested:

- **Approving destroys the approval payload.** `resumeNodeStep`
  (`workflowEngine.ts:604-607`) re-finalizes the node with
  `{_system:{approved:true,fromHalt:true}}`, overwriting the step's stored
  `message` and `previewData` and publishing that placeholder into
  `execution.state`. Any downstream template reading
  `{{nodes.<approvalNode>.output.previewData}}` resolves to nothing after
  approval — so the config drawer's preview feature breaks the moment it is used.
- **Rejecting fails the entire execution**, not the branch. `failNodeStep`
  (`workflowEngine.ts:630-636`) patches the parent `workflowExecutions` row to
  `FAILED` while its own error text reads "Branch terminated."
- **The reject path passes no `stepId`**, so `failNodeStep` falls back to
  `getLatestExecutionStep` — the latest step for that node in any status — and can
  mark the wrong one on a fanned-out iterator node.
- **`upsertStep`'s status validator omits `PENDING_APPROVAL`**
  (`convex/workflowExecutions.ts:47`), so one write path cannot represent a state
  the engine produces.

**Nothing ever clears one.** No cron, no health signal, and no index that could
find them — every `workflowExecutionSteps` index is prefixed by `executionId`
(`convex/schema.ts:2014-2018`), so "all steps awaiting approval" is not an
answerable question today. The completeness check counts `PENDING_APPROVAL` as
incomplete (`workflowEngine.ts:561`), so the parent execution stays `RUNNING` for
ever. The only thing that eventually touches it is the retention purge
(`convex/purges.ts:241-260`), minimum 30 days, which deletes the execution
outright — never completed, never failed, never reported.

### There is a control on the agents screen that does nothing

The agent builder's "Approval Policy" step offers `template` / `always` /
`read-only` (`src/app/(dashboard)/admin/agents/page.tsx:455-469`). The value goes
into `builderIntent` (`:146-149`), which is passed to the create mutation and
ends up serialised into audit-log metadata by
`normalizeBuilderIntentAuditMetadata` (`convex/agentService.ts:94-107`). It is
never read again and it patches nothing.

Choosing "always require approval" has never made an agent require approval. The
runtime comment at `agentRuntime.ts:91-93` makes the principle explicit about the
previous version of this same fault: a control that appears to restrict an agent
and does not is worse than no control. It is still true, one screen along.

`AgentEditorModal` has the matching problem in the other direction: it holds
`humanApprovalRequired` in form state (`:25`, `:98`, `:130`) and posts it on save
(`:233`) with no input rendered anywhere, so it round-trips whatever was loaded
and can never be changed.

### When an agent stops, nobody is told

- **No badge, no count, nowhere.** `SidebarNavigation.tsx:416` is a plain
  `SubNavItem` with a label. The file has no badge or count mechanism at all.
- **The only link into the queue in the whole application** is on the system
  health page (`admin/settings/system-health/page.tsx:476`). The health tile
  behind it (`convex/analyticsCron.ts:497-521`) only counts approvals already
  pending longer than 30 minutes (`PENDING_APPROVAL_THRESHOLD_MINUTES`, `:78`),
  so for the first half hour the platform's one signal reads zero.
- **The backend authorises a reviewer the product does not want.**
  `getPendingApprovals` (`convex/agentRuns.ts:1178-1219`) and `decideApproval`
  (`:1221`) are `adminQuery`/`adminMutation`, so a company ADMIN is authorised over
  the public API, with a company-scoped branch and a test covering it
  (`convex/agentRuns.test.ts:563`). The nav hides the page from them
  (`SidebarNavigation.tsx:399`), so today the permission is unreachable through the
  UI but live on the API.

  **Decided: approvals are super-admin only.** So the fix is to tighten the
  backend to match, not to open the nav. A reachable permission with no UI behind
  it is exactly the pattern that produced the workflow hole below.
- **Nothing expires.** `recoverStalledRuns` (`convex/agentRunCheckpoints.ts:162-167`)
  filters on `status === "ACTIVE"` and so never touches an `AWAITING_APPROVAL`
  checkpoint, by design. There is no approvals cron in `convex/crons.ts`. A
  pending approval waits indefinitely.

A run that parks with no notification, no reachable reviewer and no timeout is
indistinguishable from a hang.

### The screen itself is the last card grid in the admin area

`src/app/(dashboard)/admin/agents/approvals/page.tsx` is 177 lines and uses one
shared primitive, `AdminLoadMoreFooter` (`:163`) — rendered outside any container,
so its `border-t`/`bg-sidebar/40` styling floats detached instead of sitting
inside `AdminTableShell`'s rounded frame.

Everything else is hand-rolled:

- The `<header>` (`:54-68`) retypes `AdminPageHeader`'s markup class for class,
  and gets the description size wrong — `text-[14px]` against the shared
  component's `text-[13px]` (`AdminPageHeader.tsx:21-34`).
- Loading is three `h-[168px]` pulsing divs (`:72-74`), not `AdminTableLoadingRow`.
- The empty state (`:76-79`) hand-copies `AdminTableEmptyRow`'s classes
  (`AdminTable.tsx:94-106`).
- Rows are card `<div>`s (`:86-88`) with inline-styled `<button>`s (`:125-148`)
  rather than `AdminRowActions` / `AdminRowIconButton`.
- **Every string is hardcoded English.** No `useTranslations`, no `messages/en.json`
  entries. It is the only admin screen that will not switch to Italian.

Twenty-one other admin list pages use `AdminTableShell`. When
`admin/agents/skills/page.tsx:317-320` was migrated, its own justification
comment named "the model catalogue, API keys and approvals" as the standard it
was adopting. That was wrong: approvals is precisely the card grid that comment
argued against.

The drift guard that should have caught this
(`src/quality-drift.test.ts:355-373`) pins three pages by name. Approvals is not
one of them.

### Two smaller faults on the same screen

- `{approvals.length} pending` (`:66`) counts loaded rows, not total, so it
  under-reports as soon as there are more than fifteen.
- The row link checks `entry.run?._id` then navigates to
  `/admin/agents/${entry.run.agentId}` (`:116-120`). It is labelled "Open agent"
  so it is not lying, but the run timeline — the one page that shows what the
  agent was doing when it stopped, at `admin/agents/[id]/runs` — is not linked at
  all. The reviewer has no route to the context for the decision.

### None of the front end is tested

`coverage/coverage-summary.json` reports the approvals page at 0 of 33
statements. There is no `page.test.tsx`, and the e2e specs
(`e2e/admin/routes.spec.ts:13`, `e2e/admin-smoke.spec.ts:8`,
`e2e/security.spec.ts:7`) visit `/admin/agents` and stop.

The backend is the opposite — `convex/agentRuntime.test.ts:1145-1258` covers the
gate, the park, the resume and the reject, and `convex/agentRuns.test.ts:563`
covers tenant scoping. That work stands and is the reason this plan can change
the runtime rule with confidence.

---

## Decisions taken

**A new field, not a redefined one.** `agents.autonomousToolExecution`,
`v.optional(v.boolean())`. Absent or `false` means gated, so every existing agent
is unchanged with no migration and no bulk write. Only `true` is autopilot, and
only a deliberate flip on the settings screen writes it.

**Off means off, including destructive.** Autonomy is checked first and wins over
`humanApprovalRequired`, over the per-tool `confirmationRequired` flag, and over
the non-read rule. No carve-out for `DESTRUCTIVE`.

The temptation is to keep deletes gated even on autopilot. It is the wrong call
and it recreates the exact fault this plan is fixing: an agent someone has been
told runs unattended parks silently, and by the evidence above nobody is watching
the queue. Safety moves to two places a person can actually see — **which tools the
agent is given**, and **what it is allowed to spend doing it.** A carve-out can be
added later on evidence from a real client; it will not be guessed at now.

**The budget limits ship with autonomy, not after it.** They are the only brake
left once approval is switched off, and today they cannot be set at all. Doing them
separately would also mean opening `updateAgent`, the agent settings screen, the
version snapshot and the release restore twice — Phases 1, 4 and 5 already touch
every one of those four places, so this is one pass over six fields rather than two
passes over two and four.

**A batch is answered as a batch, in one turn, or not at all.** No tool-result
turn is written into the checkpoint when a run parks. Results live on the tool
call records, where they already do (`resultJson`, `convex/schema.ts:711`), and
the resume that settles the last outstanding approval assembles a single
function-response turn for the whole batch in original request order. This is
what makes the transcript match what the model sent, and it removes the existing
two-turn fault at the same time.

**Tool calls gain a turn index.** `agentToolCalls.turnIndex`, optional, set from
the loop's `loopIndex`. Without it the batch cannot be reassembled. Optional and
additive, so existing rows are simply unindexed and behave as they do now.

**A rejection is told to the agent, not used to kill it.** Rejecting a call writes
a refusal as that call's tool result. The batch settles, the run continues, and the
model finds out it was refused and can choose another way to the objective. This
replaces today's behaviour, where the run is set `FAILED` and the model is told
nothing.

**A refused call cannot be re-requested.** Otherwise a model that wants to send
that email will ask again, queue another approval, and loop — burning the reviewer's
attention rather than the token budget. The run remembers the tool and arguments it
was refused; an identical re-request is denied immediately with the same refusal,
without creating a new row.

**Cancel remains the way to stop a run.** With reject meaning "not this call",
the screen's three buttons finally mean three different things: approve this call,
refuse this call and let the agent continue, or stop the whole run. Today reject
and cancel both end the run and a reviewer cannot tell why there are two.

**A batch settles when every row in it is decided.** Approved calls run, refused
calls return a refusal, and the assembled turn carries whatever mix resulted. No
row cancels its siblings any more — that rule existed only to serve
rejection-ends-the-run, which is gone.

**A pending approval expires after 24 hours and the run is cancelled.** Never
auto-approved — an unattended yes to a delete is the one outcome worse than a
stuck run. Twenty-four hours means an approval raised at the end of a working day
survives until the next morning. Expiry cancels rather than refusing, because
nobody made a judgement and pretending one was made would be a lie in the
transcript.

**The window is configurable, following the purge-retention pattern.** A
`systemConfig` row (`convex/schema.ts:325-331`) under a new
`APPROVAL_EXPIRY_CONFIG_KEY`, with a super-admin getter that falls back to a
defaults constant and a setter that enforces a hard minimum, mirroring
`getPipelineConfig` / `updatePipelineConfig` (`convex/purges.ts:19-73`) and
`normalizePurgePipelineConfigForUpdate` (`convex/purgeScheduleService.ts:76-100`).
Surfaced as a `SettingBlock` on the settings screen beside the purge section.

`systemSettings` is explicitly the wrong home: its own schema note
(`convex/schema.ts:105-108`) records that it holds scalars for the branding form,
and the read-only/writable split on the settings shell is deliberate
(`docs/developer/platform-operations-settings.md:32`).

**An agent may override the window.** `agents.approvalExpiryHours`, optional,
clamped to the same minimum. A daily reconciliation agent and one that fires
monthly do not deserve the same patience, and this is the screen where someone is
already thinking about that agent's risk.

**Approvals are super-admin only, and the backend is tightened to say so.**
`getPendingApprovals` and `decideApproval` move from `adminQuery`/`adminMutation`
to their super-admin equivalents, and the company-scoped branch goes.

The consequence should be stated rather than discovered: a client's own admin can
never unstick their own agent. Approvals become an operation we run on their
behalf. That makes the nav badge and the expiry sweep more important, not less —
they are the only things standing between a client's stalled agent and nobody
noticing.

**The workflow approval mechanism is finished, not deleted.** A "Human Approval"
node that a customer can drag into a builder, configure, save and run has to work.
The alternative — removing the node — throws away a working halt-and-resume engine
because its screen was deleted by accident, and leaves anyone who already built a
workflow with it holding a broken definition.

**Workflow approvals get their own screen, not a shared queue.** They are a
different shape: a step in a graph, keyed by execution and node, with no
`agentRunApprovals` row, no tool call, no side-effect level and no tenant column on
the step. Forcing them into the agent queue would mean a union type at every point
and a table where half the columns are blank. The execution list and detail
screens deleted in `cc5bc9558` are what is actually missing, and they are the right
home for the decision.

**An expired approval gets its own status, not CANCELLED.** `"EXPIRED"` joins the
status union. Reusing CANCELLED would make "nobody answered" indistinguishable
from "someone decided against it", and those are different facts about your
platform. It is added to the stored union only — `decideApproval`'s arguments stay
as they are, so no person can mark something expired by hand.

**One toggle, and it governs whether the gate runs at all.** The control reads
"Require human approval" and is **on by default**. On leaves that agent behaving
exactly as it does today, whatever that is — writes and sends gate, reads gate
too if the agent or the tool was set that way. Off means no approval is ever
requested for that agent. The existing `humanApprovalRequired` keeps its current
meaning as the strictness *within* the gate; it is not replaced, and the two
agent templates that set it (`convex/agentTemplates.ts:67`, `:95`) keep working.

**The builder's Approval Policy step is deleted, not wired.** Its three values do
not map onto the new model — none of them is autopilot — and one screen owning
this decision is the point. A new agent gets the safe default and the choice is
made on settings, once, in the place that shows what the agent can actually do.

**The nav badge counts everything pending, not what is stale.** The 30-minute
health threshold is right for an alert digest and wrong for the thing telling you
a run is waiting.

**Company admins get the approvals link and nothing else.** The Agents nav item
also contains Manage Agents, Workflows and Schedules; those stay super-admin.
Only the approvals sub-item is exposed, matching what `getPendingApprovals`
already authorises.

**`decideApproval` starts writing an audit row.** It currently writes none —
`convex/agentRuns.test.ts:563` is titled "…and audited" and asserts the absence.
`cancelRun` (`convex/agentRuns.ts:1475-1486`) shows the shape to copy. Approving
a destructive tool call is exactly the event an audit log exists for.

---

## Phases

### Phase 0 — Close the workflow authorization hole — **DONE**

Shipped alone, ahead of everything else. Nothing here depended on the rest of the
plan.

1. `convex/workflowRuntime.ts` — `resumeApprovalStep` moved from `tenantAction` to
   `superAdminAction` (`convex/tenantFunctions.ts:155`), matching the rest of the
   workflow surface.
2. The `workflowId` argument was **removed** rather than validated. The plan said to
   assert `execution.workflowId === args.workflowId`; reading it from the execution
   is strictly better, because an id that cannot be supplied cannot disagree. The
   handler now loads the execution first, which also gives existence checking for
   free. Safe to change the signature because the function has no caller anywhere in
   the repo.
3. **No company assertion was added**, and the plan's step 3 was wrong to ask for
   one. Once the guard is super-admin only it would be dead code:
   `assertTenantAccess` returns early for `SUPER_ADMIN`
   (`convex/tenantFunctions.ts:99`), and super admins operate across companies by
   design. A check that can never fail reads as protection and provides none.

Tests added in `convex/workflowRuntime.test.ts` — the function previously had none:

- **a `USER`-role caller is refused**
- **a company ADMIN is refused, even in the owning company**
- an unauthenticated caller is refused
- a super-admin approve resumes the step and releases the downstream node
- a super-admin reject fails the execution
- an execution with no workflow is refused rather than resumed

All three guards proved by reverting: swapping `superAdminAction` back to
`tenantAction` fails the two role tests, and removing the missing-workflow throw
fails the sixth.

Verified: `verify:env`, `lint:all` (0 errors), `check` (429 files, 3173 tests),
`build`, `git diff --check` all clean. Not browser-verified, deliberately — the
function has no UI caller until Phase 10 builds one, so there is nothing a preview
could show.

### Phase 1 — The autonomy switch in the runtime — **DONE**

**The plan was incomplete, and the tests caught it.** Setting
`getToolConfirmationRequired` to return `false` was not enough to let an
autonomous agent run a write. `canExecuteTool` calls
`normalizeToolExecutionPolicy` (`convex/aiToolExecutionService.ts:246-257`), which
**recomputes** `confirmationRequired` from the side-effect level and discards the
value passed in — forcing `true` for anything that is not a plain read. So the
runtime's computed "no approval needed" was silently overruled and an autonomous
agent still parked on every write.

Found because the first version of the write-tool test asserted zero approvals and
got zero for the wrong reason: the fixture named its tool by display name, but
`buildProviderToolDeclaration` (`:198-204`) derives the function name from
`handlerMapping`, so the call resolved to no metadata and skipped the gate
entirely. Fixing the fixture surfaced the real fault.

The fix: `canExecuteTool` takes an explicit `autonomous` flag, checked **at the
confirmation branches only** — after the role and tenant checks, so autonomy
removes the human and not the permissions. `normalizeToolExecutionPolicy` is
untouched: "a non-read tool needs confirmation" is a true statement about the
tool, and autonomy is a property of the agent, so it could not be expressed by
passing a different `confirmationRequired`.

1. `convex/schema.ts`, agents table (beside `humanApprovalRequired` at `:1675`):
   add `autonomousToolExecution: v.optional(v.boolean())`.
2. `convex/agentRuntime.ts:95-102` — `getToolConfirmationRequired` takes a fourth
   argument and returns `false` first when it is `true`. Update the doc comment
   at `:83-94` to state the precedence and why autonomy wins.
3. `convex/agentRuntime.ts:284-295` — pass `agent.autonomousToolExecution`
   alongside the existing `agent.humanApprovalRequired`.
4. `convex/agents.ts:944` — add the field to the `updateAgent` args.
5. `convex/agentVersioningService.ts:168` and `convex/releases.ts:111`/`:306` —
   carry the field through the version snapshot and the release restore. A
   rollback that silently re-enables or disables autonomy would be a worse fault
   than the one being fixed. `releases.ts:369` gains the matching summary phrase.
6. `convex/agentImprovementSuggestions.ts:465` and `:528-532` — the
   `APPROVAL_POLICY_CHANGE` suggestion patches `humanApprovalRequired: true`.
   On an autonomous agent that is a silent no-op, so the same patch must clear
   `autonomousToolExecution`. `convex/agentMemoryCandidates.ts:279` describes the
   change to the reader and needs the same treatment.

7. `convex/aiToolExecutionService.ts` — the `autonomous` flag described above, and
   `convex/agentRuntime.ts` passes `agent.autonomousToolExecution === true` at the
   `canExecuteTool` call site.

Tests added in a new `describe("autonomous tool execution")` block in
`convex/agentRuntime.test.ts`, plus a case in `convex/aiToolExecutionService.test.ts`:

- **an autonomous agent completes a `WRITE` with no approval row and the run
  reaching `SUCCESS`** — the new behaviour
- **an agent with the field absent still gates that same `WRITE`** — the polarity
  guard
- an agent with the field explicitly `false` still gates it
- autonomy beats `humanApprovalRequired: true` on the same agent
- autonomy beats a `READ` tool carrying `confirmationRequired: true`
- at the service level: autonomy waives confirmation for both an admin in their own
  tenant and a super admin, but **a tenant boundary, a role requirement and an
  unauthenticated caller are all still refused**

Guards proved by reverting three separate ways: inverting the polarity at the
`canExecuteTool` call site fails the absent-field test; removing the `autonomous`
argument fails both autonomy tests; removing the service-level waiver fails those
two plus the service unit test.

Worth recording: inverting `getToolConfirmationRequired` itself does **not** fail
the absent-field test, because for non-read tools the load-bearing gate is
`normalizeToolExecutionPolicy` inside `canExecuteTool`, not the metadata. The
metadata value matters for reads. Two mechanisms, and the tests now pin both.

Verified: `verify:env`, `lint:all` (0 errors), `check` (429 files, 3179 tests),
`build`, `git diff --check` all clean. Not browser-verified — the toggle that makes
this reachable is Phase 5, so there is nothing on screen yet.

### Phase 2 — Queue the whole batch, resume once

The largest phase, and the one to build carefully. All of it is in
`convex/agentRuntime.ts`, `convex/agentRuns.ts` and the schema.

1. `convex/schema.ts:702-739` — add `turnIndex: v.optional(v.number())` to
   `agentToolCalls` and an index `by_run_turn` on `["runId", "turnIndex"]`.
2. `insertToolCallInternal` (`convex/agentRuns.ts`) takes and stores `turnIndex`.
   Every insert site in the loop passes the current `loopIndex`, both the gated
   path (`agentRuntime.ts:1299-1314`) and the normal execution path below it.
3. The batch loop (`agentRuntime.ts:1224`) stops returning early. When a call
   needs approval it creates the step, tool call and approval rows exactly as it
   does now, pushes the id onto a local `deferredApprovals` list, and
   **continues to the next call in the batch.** Calls that do not need approval
   keep executing as normal.
4. After the batch loop, if `deferredApprovals` is non-empty, park once: record
   usage, set the run `PENDING_APPROVAL`, close the streaming message, release the
   prompt cache and `saveCheckpoint("AWAITING_APPROVAL", loopIndex + 1)` — the
   same sequence as `:1345-1412`, lifted out of the per-call loop and run a single
   time.
5. **Do not push any tool-result turn into `conversationHistory` when parking.**
   Delete `:1397-1399`. The executed calls' results are already on their tool call
   records; the transcript stays as the assistant turn that requested them, and
   the batch is answered in one turn on resume.
6. `getApprovalResumeContextInternal` (`convex/agentRuns.ts:1715`) also returns the
   count of still-PENDING approvals for that run.
7. `resumeApprovedToolCall` (`agentRuntime.ts:2073`) executes its tool and stores
   the result on the tool call as now, then branches:
   - siblings still pending → stop there. The run stays `PENDING_APPROVAL` and the
     checkpoint stays `AWAITING_APPROVAL`. Nothing is appended.
   - none left → read every tool call for the run at that `turnIndex` ordered by
     `startedAt`, build **one** function-response turn from their `resultJson` via
     the existing `buildToolInteractionTurns` (which already takes an array), then
     continue through `continueRunAfterApprovalInternal` as now.
8. The settle-or-wait branch in step 7 is shared, not duplicated — Phase 3's
   rejection path and Phase 4's expiry both need exactly it.

Tests in `convex/agentRuntime.test.ts`:

- **a turn requesting two gated tools creates two approval rows** — the guard for
  the dropped call, and the one to prove by reverting
- approving the first leaves the run `PENDING_APPROVAL` and appends nothing
- approving the second resumes the run, and the transcript holds **one**
  function-response turn with both results in request order
- **a mixed batch — one read that runs, one write that gates — resumes with a
  single turn containing both results** — the guard for the transcript fault
- results come back in request order, not decision order, when the second row is
  approved first

### Phase 3 — A rejection tells the agent instead of killing the run

Built on Phase 2's settle-or-wait branch. It replaces a tested path, so the
existing reject tests change deliberately rather than incidentally.

1. `convex/schema.ts` — `agentRuns.refusedToolCallsJson`, optional string: the
   run's list of refused `{tool, argumentsHash}` pairs. On the run rather than in a
   new table because it is read and written only by that run's own loop and dies
   with it.
2. `decideApproval` on REJECTED (`convex/agentRuns.ts:1263-1306`) stops ending the
   run. It sets the approval `REJECTED`, sets the tool call `DENIED`, stores a
   refusal payload as that call's `resultJson`, appends the pair to
   `refusedToolCallsJson`, then takes Phase 2's settle-or-wait branch: siblings
   still pending → stop; none left → resume with the assembled turn.
3. The refusal payload comes from a new helper beside `getApprovalFinalOutput`
   (`convex/agentRuns.ts:100`) and says a person refused the call and the agent
   should find another route. It carries the reviewer's `decisionReason` where one
   was given — a reviewer explaining *why* is the most useful thing that can reach
   the model, and today it is stored and never read by anything.
4. `convex/agentRuntime.ts` — before queueing an approval, check the run's refused
   list. An identical tool and argument set is denied inline with the stored
   refusal and creates no new row.
5. `cancelRun` (`convex/agentRuns.ts:1405`) is untouched and becomes the only way
   to stop a run outright.

Tests in `convex/agentRuntime.test.ts` and `convex/agentRuns.test.ts`:

- **rejecting the only approval resumes the run with a refusal as the tool result,
  and the run ends in a state other than `FAILED`** — the behaviour change
- the reviewer's reason reaches the transcript
- **an agent re-requesting a refused call with identical arguments gets the refusal
  inline and creates no second approval row** — the guard against burning a
  reviewer's attention in a loop
- the same tool with *different* arguments does queue a new approval
- rejecting one of two rows leaves the other pending, and settling it resumes with
  one mixed result turn
- the existing reject-ends-the-run assertions at
  `convex/agentRuntime.test.ts:1238-1257` are rewritten, not deleted, so the new
  contract is pinned exactly where the old one was

### Phase 4 — Expire what nobody answers, on a window you can set

1. `convex/schema.ts:741-764` — add `v.literal("EXPIRED")` to the
   `agentRunApprovals` status union. `convex/schema.ts:1654-1662` — add
   `approvalExpiryHours: v.optional(v.number())` to the agents table.
2. New `convex/approvalExpiryService.ts` holding
   `DEFAULT_APPROVAL_EXPIRY_HOURS = 24`, `MIN_APPROVAL_EXPIRY_HOURS = 1`, a parser
   with defaults fallback and a normalizer that throws a named error below the
   minimum — the shape of `convex/purgeScheduleService.ts:63-100`.
3. `APPROVAL_EXPIRY_CONFIG_KEY` with `getApprovalExpiryConfig` (`superAdminQuery`)
   and `updateApprovalExpiryConfig` (`superAdminMutation`: upsert by key into
   `systemConfig`, audit row with `entityType: "systemConfig"`) — mirroring
   `convex/purges.ts:19-73`.
4. `updateAgent` (`convex/agents.ts:927-952`) accepts `approvalExpiryHours` through
   the same normalizer, carried through the version snapshot
   (`convex/agentVersioningService.ts:168`) and release restore
   (`convex/releases.ts:306`) alongside Phase 1's autonomy field.
5. New `expireStalePendingApprovals` internal mutation. It reads
   `by_status_requested` for PENDING rows, resolves the window per row — the
   agent's override, else the platform config, else the default — and for each row
   past it whose run is still `PENDING_APPROVAL`: sets the approval `EXPIRED` with
   a `decisionReason` and no `reviewedBy`, sets its tool call `CANCELLED`, expires
   the run's siblings too, inserts a `FINAL` step, sets the run `CANCELLED`, calls
   `updateMemoryUsageOutcomeForRun`, deletes the checkpoint, and writes an audit
   row.
6. Post a sentence to the chat thread where there is one. A reader deserves to know
   the agent gave up waiting, and unlike a rejection nobody chose this.
7. `convex/crons.ts` — a 15-minute interval. The window is measured in hours, so
   this only needs to be often enough that the number is roughly true.
8. `decideApproval`'s already-reviewed guard (`:1230-1231`) covers `EXPIRED`, so a
   stale browser tab cannot approve something the platform has closed.
9. A `SettingBlock` for the platform window on the settings screen beside the purge
   section (`admin/settings/page.tsx:355-432`), and on agent settings a hint naming
   the platform default when that agent has no override.

Tests in `convex/agentRuns.test.ts` plus a new service unit test:

- **a PENDING approval older than the window expires, and its run reaches
  `CANCELLED` with the checkpoint gone** — the guard
- one inside the window is untouched
- **an agent override shortens the window for its own approvals and leaves another
  agent's alone**
- the normalizer refuses a window below the minimum, by name
- expiring one row expires its siblings
- a row whose run already reached a terminal state is skipped, not expired
- `decideApproval` on an expired row throws

### Phase 5 — The controls on agent settings: the toggle, and the limits behind it — **DONE**

**A second latent bug, found the same way as Phase 1's.** `clampLimit` ran
`Math.floor` over every limit including `maxCostGBP`, so a budget of £0.50 became
**£0** — a budget no run can start under, because the first cost check has already
met it. Harmless while these fields were unreachable; a foot-gun the moment they
appear on a screen. Counts and milliseconds are still floored; money is not.

Deviations from the plan as written, all deliberate:

- **Runtime is entered in minutes, not milliseconds.** Asking an operator to type
  `300000` would be hostile. Converted on save and on load.
- **A cleared box sends `0`, not an omitted argument.** An omitted argument means
  "leave the stored value alone", so clearing a field could never have restored the
  platform default. The server turns anything unusable — `0`, negative, `NaN` —
  into `undefined`, which Convex patches as a removal.
- **The budget is clamped on write as well as on read.** Read-time clamping already
  protected the run, but a record holding `500` while the run used `24` would make
  the screen lie about what applies.
- **The budget went into the version snapshot's `policy` section** rather than a new
  section of its own, so it is covered by the existing `policyHash` without a new
  schema column. It belongs there in any case: once an agent is autonomous, these
  four are the only thing bounding it. Release restore runs them back through the
  same clamp, so a rollback to a snapshot taken before the ceilings tightened cannot
  reinstate a budget above them.
- **The screen's copies of the defaults and ceilings are pinned by a new drift
  guard** in `src/quality-drift.test.ts`. They have to be duplicated because the real
  ones live in a Convex module, and a screen quoting a stale ceiling is a screen
  lying about what it will accept.

Tests: six on the settings screen, one round-trip through `updateAgent`, and four on
the clamp. Guards proved by reverting four ways — flipping the screen's polarity,
removing the write-clamp, restoring the floor on cost, and drifting a ceiling — each
failing the test that covers it.

Verified: `lint:all` (0 errors), `check` (429 files, 3192 tests), `build`,
`git diff --check` clean. **Browser-verified** on the running dev server: the control
renders with "Require approval" selected by default, switching to autonomous turns it
amber and swaps the hint to the consequence, all four budget boxes carry the right
placeholder, ceiling and step (£ to two decimals), four columns on desktop, no
horizontal overflow at mobile width, console clean. Nothing was saved against live
data — the control was returned to its original state.

Noted, not fixed: at 375px the admin sidebar does not collapse, so every screen in
this area is squashed. Pre-existing and platform-wide, not introduced here.

**Original plan text follows.**

`src/app/(dashboard)/admin/agents/[id]/settings/page.tsx`, in the Engine section
(`:554`), following the two-button pattern already used by Internet Access
(`:627-644`) and Status (`:648-662`) rather than introducing a third idiom.

**The toggle.**

1. Label "Require human approval", on when `autonomousToolExecution !== true`.
2. Hint text that says what each side means in one sentence each, and names the
   consequence of off: the agent completes writes, sends and external calls
   without stopping.
3. `handleSave` posts `autonomousToolExecution` as the inverse of the toggle.

**The limits, which are what remains when the toggle is off.**

4. `convex/agents.ts:927-952` — `updateAgent` accepts `maxSteps`, `maxToolCalls`,
   `maxRuntimeMs` and `maxCostGBP`, each passed through the existing `clampLimit`
   (`convex/agentRuntimeService.ts:73-78`) against
   `AGENT_OBJECTIVE_LIMIT_CEILINGS` (`:45-53`) so an admin cannot raise an agent
   above the platform ceiling and a nonsensical value is ignored rather than
   stored.
5. Four numeric fields on the same screen, each showing the platform default it
   overrides — the pattern Phase 4 uses for the expiry window, and the pattern the
   model-defaults work established: name the inherited value rather than leaving a
   blank box.
6. Carried through the version snapshot (`convex/agentVersioningService.ts:168`)
   and release restore (`convex/releases.ts:306`) alongside
   `autonomousToolExecution` and `approvalExpiryHours` — one pass over those two
   files for all six new fields rather than three.
7. `maxInputTokens` and `maxOutputTokens` stay platform-only.
   `resolveAgentObjectiveLimits` (`:130-131`) deliberately always reads them from
   the default constant, and this plan does not change that.

Strings via `messages/en.json` and `messages/it.json` under
`admin.agents.details.settings.sections.engine`, matching the rest of this screen.

Tests, extending `.../agents/[id]/settings/page.test.tsx` and
`convex/agents.test.ts`:

- an agent with the field absent renders the toggle **on**
- **switching it off saves `autonomousToolExecution: true`**
- an agent already autonomous renders it off, and saving an unrelated field does
  not flip it back
- each limit renders the platform default when the agent has no override
- **an override above the platform ceiling is clamped to the ceiling, not stored as
  given** — the guard, and the one to prove by reverting
- an override of zero or a negative number is ignored and the default applies
- an agent with no overrides still resolves to the module defaults at runtime

### Phase 6 — Delete the control that lies

1. Remove the Approval Policy field from
   `src/app/(dashboard)/admin/agents/page.tsx:455-469`, the `approvalPolicy` key
   from `builderForm` (`:56`, `:66`) and from `builderIntent` (`:149`).
2. Remove `approvalPolicy` from `AgentBuilderIntentAuditMetadata` and
   `normalizeBuilderIntentAuditMetadata` (`convex/agentService.ts:86-107`).
   Existing audit rows keep their stored copy; nothing reads it.
3. Delete the `builder.approval.*` and `builder.approvalPolicy` strings from
   `messages/en.json` and `messages/it.json`.
4. `src/ui/components/workflows/AgentEditorModal.tsx` — remove
   `humanApprovalRequired` from form state (`:25`, `:98`, `:130`) and from the
   save payload (`:233`). A field that renders no input should not be posting a
   value. Settings owns this decision.

Test: `src/app/(dashboard)/admin/agents/page.test.tsx` asserts the policy step no
longer renders, and the create call carries no `approvalPolicy`.

### Phase 7 — Make a parked run visible, and lock it to super admin — **DONE**

Built as planned. Three things the build settled that the plan had left open:

- **The count stops at 99 and says so.** Counting cannot be indexed away in Convex,
  so the query `take`s a bounded page and returns `{ count, atLimit }`. The badge
  reads "99+" rather than claiming a precise number it did not finish counting. The
  repo already accepts this constraint elsewhere — the skill rollup moved to a cron
  for the same reason.
- **The badge is skipped, not just hidden, for a company admin.** The query is
  super-admin only, so asking anyway would throw on every admin page load. Passing
  `"skip"` is the fix, and there is a test asserting the query is never issued.
- **The approved tool now always executes as a super admin.**
  `resumeApprovedToolCall` runs the tool as `approval.reviewedBy`, and the reviewer
  can now only be a super admin, so `canExecuteTool` no longer applies a tenant
  boundary to an approved call. This is the intended effect of the decision — a
  super admin can reach every tenant by design — but it is a real widening and
  should not be discovered later. Two runtime tests were decided by the run's own
  company operator and are now decided by a separate seeded reviewer, which is also
  the more honest fixture.

Tests: the tenant-scoping assertions were rewritten as refusals — a company admin is
refused by `getPendingApprovals`, `getPendingApprovalCount` and `decideApproval` —
plus four sidebar tests covering the count, its absence at zero, the "99+" state, and
the skipped query.

Verified: `lint:all` (0 errors), `check` (429 files, 3196 tests), `build`,
`git diff --check` clean. Browser-checked on the running dev server: the nav link
renders with no badge against a deployment with nothing pending, which is the
absent-at-zero case. The non-zero states are covered by tests rather than by creating
approvals against live data.

**Original plan text follows.**

1. `getPendingApprovals` (`convex/agentRuns.ts:1178`) and `decideApproval` (`:1221`)
   move to `superAdminQuery` / `superAdminMutation`. The ADMIN branch reading
   `by_company_status_requested` goes, along with the `assertAdminCanAccessCompany`
   call per row (`:1204`) which no longer has anything to assert. The nav already
   hides the page from company admins; this makes the API agree with the product.
2. New `getPendingApprovalCount` (`superAdminQuery`) returning a number over
   `by_status_requested`. It counts every PENDING row, not only stale ones — the
   30-minute health threshold is right for an alert digest and wrong for the thing
   telling you a run is waiting.
3. `SidebarNavigation.tsx` — a `badge?: number` prop on `SubNavItem`, rendered only
   when above zero, wired on the approvals item (`:416`). The `isSuperAdmin` wrapper
   at `:399` stays exactly as it is.
4. The characterisation snapshot
   (`src/ui/components/layout/__snapshots__/SidebarNavigation.characterisation.test.tsx.snap:78`)
   is expected to change. Re-record deliberately and read the diff.

Tests:

- `convex/agentRuns.test.ts` — **a company ADMIN is refused by both
  `getPendingApprovals` and `decideApproval`**, replacing the tenant-scoping
  assertions at `:563-751` which encoded the old permission
- the count query is super-admin only and counts across companies
- `SidebarNavigation` — the badge is absent at zero and shows the number above it

### Phase 8 — Standardise the approvals screen — **DONE**

Rebuilt on the shared primitives, with server-side search, full i18n in both
locales, and the page added to the drift guard. The false claim in the skills page
comment (`admin/agents/skills/page.tsx:317-320`) is corrected rather than deleted,
so the record of what went wrong survives.

Decisions the build settled:

- **Search needed a schema change, as expected.** `searchText` on
  `agentRunApprovals` — agent name, tool name and handler mapping — populated in
  `insertApprovalInternal`, with `searchIndex("search_approval")` filtered on
  status. `getPendingApprovals` takes an optional term and switches index. Two
  guards prove it: neutering the term, and dropping the `searchText` write, each
  fail the search test.
- **The empty state tells "nothing waiting" from "no matches".** Reporting
  "nothing waiting" while a search is filtering the queue would be a lie.
- **Cancel came off the row.** The old screen had Approve, Reject and Cancel, and
  Reject and Cancel both ended the run — a reviewer could not tell why there were
  two. Reject stays, behind a confirmation. Cancel belongs to `cancelRun` on the run
  itself, and Phase 3 gives Reject a distinct meaning, at which point the three are
  genuinely three things.
- **One rotated chevron for the expander, not a directional pair.** The drift guard
  matches on text and treats `ChevronLeft`/`ChevronRight` as the signature of
  hand-rolled pagination, so it cannot tell an expander from a pager. Worth noting
  the guard first failed on a *comment* naming those icons, which is the guard
  behaving exactly as designed.

**Deferred within this phase, because their dependencies do not exist yet:** the
turn-grouping in step 9 needs Phase 2's `turnIndex`, and the `EXPIRED` rendering in
step 11 needs Phase 4's status. Both remain listed below.

Tests: ten new page tests, the screen's first ever — it was at 0% coverage — plus a
backend search test. Guards proved by reverting three ways: rejecting without the
confirmation, counting loaded rows instead of the total, and breaking either half of
the search path.

Verified: `lint:all` (0 errors), `check` (429 files, 3207 tests), `build`,
`git diff --check` clean. **Browser-verified** against the live dev server: renders
as a five-column table inside the rounded shell with the footer attached, no
horizontal overflow, console clean, and typing a term switched the empty state to
"no approvals match that search" — which also confirms the new search index deployed
and the query resolves. The search box was cleared afterwards.

**Original plan text follows.**

`src/app/(dashboard)/admin/agents/approvals/page.tsx`, rebuilt on the shared
primitives.

1. `AdminPageHeader` (with `divider`) replaces the hand-rolled `<header>`. The
   pending pill moves to the header's action slot and reads the Phase 6 count
   query, so it is correct past fifteen rows.
2. `AdminTableShell` with `AdminTableHeaderRow` / `AdminTableHeaderCell`,
   `AdminTableLoadingRow`, `AdminTableEmptyRow`, and `AdminLoadMoreFooter` nested
   inside the shell where it belongs.
3. **`AdminSearchBar`, searching server-side.** The rest of the standard set is a
   straight swap; search is not, because there is nothing on an `agentRunApprovals`
   row worth searching. What a reviewer would type is an agent name or a tool name,
   and both live on joined records.

   Client-side filtering of the loaded page is the wrong answer: it would filter 15
   of an unknown number of rows and read as "no matches" when there are matches on
   page two. So: add `searchText` to `agentRunApprovals`, populated at insert from
   the agent name and the normalized tool name, with a `searchIndex` alongside the
   existing indexes. `getPendingApprovals` takes an optional term and uses the
   search index when one is given, the `by_status_requested` index when it is not —
   the same shape as `getPaginatedAgents`. Denormalising is cheap here because the
   row is written once, by the runtime, and never updated.
4. Columns: Tool, Agent, Run, Requested, Actions. `sideEffectLevel` becomes a pill
   on the Tool cell — it is the single most important thing on the row, because it
   is the difference between a lookup and a deletion.
5. The raw `_id` in mono (`:101`) goes. It is an internal key on display.
6. Actions use `AdminRowActions` / `AdminRowIconButton`. Reject and Cancel go
   through `AdminConfirmationModal` — both end a run irreversibly and today are
   one unguarded click.
7. The `previewJson` block keeps its `<pre>`, moved into an expandable row so the
   table stays scannable. This is the payload the decision is actually made on;
   it does not get summarised away.
8. The Run cell links to `/admin/agents/{agentId}/runs` — the timeline, with the
   `linkedApprovals` chips (`admin/agents/[id]/runs/page.tsx:1177-1180`) and the
   approvals evidence section (`:1234-1256`) already built. Keep the agent link
   as a second, separately labelled link.
9. **Rows from the same turn are grouped and labelled.** After Phase 2 a single
   turn can produce several rows, and three separate rows that will all live or
   die together must not read as three independent decisions. Rows sharing a run
   and `turnIndex` sit together under one heading that states the rule plainly:
   the run continues only when all of them are approved, and rejecting any one
   ends it. `getPendingApprovals` returns `turnIndex` and the group's size for
   this.
10. A row remaining after its sibling was approved shows that it is the one being
   waited on. This is the state a reviewer will actually meet — approve the first
   of two, and the screen has to explain why nothing happened.
11. Add `EXPIRED` to wherever approval status is rendered on the run timeline
    (`admin/agents/[id]/runs/page.tsx:1234-1256`) with wording that says nobody
    answered in time, distinct from a rejection. Expired rows never appear in the
    queue itself, which only reads PENDING.
12. Full i18n through `messages/en.json` and `messages/it.json` under
    `admin.agents.approvals`.

Then close the hole that let this stand: add the page to the drift guard list at
`src/quality-drift.test.ts:355-373`, and correct the false claim in the skills
page comment at `admin/agents/skills/page.tsx:317-320`.

New `.../agents/approvals/page.test.tsx`:

- a pending row renders tool, agent, side-effect pill and the preview
- approve calls `decideApproval` with `APPROVED`
- **reject opens the confirmation modal and does not call the mutation until it
  is confirmed**
- **two rows from one turn render as one group, worded so it is clear the run waits
  for all of them**
- the empty state renders
- the header count comes from the count query, not the loaded rows

### Phase 9 — Audit the decision

`convex/agentRuns.ts:1221` — `decideApproval` inserts an `auditLogs` row on every
outcome, copying the shape at `:1475-1486`: actor, agent, company, tool name,
side-effect level, decision, reason. The expiry sweep from Phase 4 writes the same
row with no actor. Retitle and extend `convex/agentRuns.test.ts:563` so the
assertion matches the name it has always had.

### Phase 10 — Finish the workflow approval system

The second approval system, from a halt with nowhere to answer it to a working
screen. Largest phase after Phase 2, and independent of Phases 1-9 — it shares no
code with them.

**Fix the engine first.**

1. `convex/workflowEngine.ts:604-607` — `resumeNodeStep` stops overwriting the
   step's `output`. It finalizes with the node's **original** stored payload merged
   with the approval marker, so `message` and `previewData` survive into
   `execution.state` and downstream `{{nodes.<id>.output.previewData}}` templates
   keep resolving. This is what makes the config drawer's preview field work at all.
2. `convex/workflowRuntime.ts:361-368` — the reject path passes the resolved
   `PENDING_APPROVAL` step's `stepId` to `failNodeStep`, so it stops relying on
   `getLatestExecutionStep` and cannot mark the wrong step on a fanned-out iterator
   node.
3. `convex/workflowEngine.ts:611-638` — reconcile `failNodeStep`'s behaviour with
   its own error text. A rejected approval fails the **execution**, and the message
   says so. "Branch terminated" is removed rather than made true: partial-branch
   failure is a different feature and inventing it here would be scope creep.
4. `convex/workflowExecutions.ts:47` — add `PENDING_APPROVAL` to `upsertStep`'s
   status validator, so every write path can represent a state the engine produces.

**Then make it findable.**

5. `convex/schema.ts:2014-2018` — add `by_status_started` on
   `["status", "startedAt"]` to `workflowExecutionSteps`. Every existing index is
   prefixed by `executionId`, so "all steps awaiting approval" is not an answerable
   question today.
6. `workflowExecutionSteps` gains `companyId: v.optional(v.id("companies"))`,
   copied from the parent execution on insert. Tenant lives only on the parent
   today, which means a cross-execution query cannot filter by company without a
   lookup per row.
7. New `getPendingWorkflowApprovals` (`superAdminQuery`, paginated) over the new
   index, joined to execution and workflow for names.

**Then build the screens that were deleted.**

8. `admin/workflows/executions/page.tsx` — a paginated execution list on the shared
   admin table primitives: workflow name, trigger, status, started, and an approval
   pill where a step is waiting. This is also the screen that fixes a separate gap:
   after pressing "run" in the builder there is currently nowhere at all to see what
   happened.
9. `admin/workflows/executions/[id]/page.tsx` — the step timeline, with approve and
   reject on any `PENDING_APPROVAL` step, showing the node's `message` and resolved
   `previewData`. Reject goes through `AdminConfirmationModal`, because after step 3
   it fails the whole execution.
10. `SidebarNavigation.tsx` — an "Executions" sub-item under the existing
    super-admin Agents/Workflows group, with the same badge treatment as Phase 7.
11. Both screens fully i18n'd, on `AdminTableShell` and `AdminPageHeader`, and added
    to the drift guard alongside the approvals page.

**Then stop them accumulating.**

12. Extend Phase 4's cron: workflow steps `PENDING_APPROVAL` past the same window
    are expired — step `FAILED` with a reason saying nobody answered, execution
    `FAILED`, audit row. Today the only thing that ever touches one is the retention
    purge (`convex/purges.ts:241-260`), minimum 30 days, which deletes the execution
    without ever completing or failing it.
13. `convex/analyticsCron.ts:497-521` — the stale-approvals health signal counts
    workflow steps as well as `agentRunApprovals`. The workflow health checks at
    `:588-633` only look at `SCHEDULE`-triggered executions, so a manual or webhook
    run parked on an approval is invisible to every signal on the platform.

**Then correct what the platform tells people.**

14. `ConfigDrawer.tsx:899` — the in-app hint names the new screen.
15. `docs/developer/workflow-automation.md:67,107`,
    `docs/developer/workflow-runtime-internals.md:118`, `WORKFLOWS.md:68`,
    `docs/end-user/workflow-automation.md:63,121` — all corrected. One of those
    files contradicts itself twelve lines apart and both halves are now wrong.
16. Delete the empty directory `src/app/(dashboard)/admin/workflows/logs/[id]/` and
    the orphaned `scheduler:getWorkflowExecutions` mock at
    `src/e2e/convexReactMock.tsx:635`.

Tests — the whole mechanism has none beyond the halt itself:

- **approving preserves `message` and `previewData` in `execution.state`**, and a
  downstream template referencing `previewData` resolves — the guard for the
  payload destruction
- rejecting marks the `PENDING_APPROVAL` step, not merely the latest step, on an
  execution with several steps for one node
- `upsertStep` accepts `PENDING_APPROVAL`
- the pending-approvals query finds a halted step across executions and is
  super-admin only
- **a workflow step past the window expires and its execution reaches `FAILED`**
- page tests for both new screens, including reject requiring confirmation

---

## Risk

**Autonomy is a real loosening of a real safety control.** The mitigation is that
it is opt-in per agent, defaulted off, written only by an explicit toggle, and
carried through version snapshots so a rollback restores the intent. Everything
else in this plan exists to make the gated path visible enough that leaving the
toggle on is a comfortable choice rather than a trap.

**Restricting approvals to super admin removes a capability the API currently
grants.** Nobody is using it — the nav has always hidden the page from company
admins — but it is a permission narrowing and the tests encoding the old behaviour
are rewritten rather than deleted so the new contract is pinned in the same place.

The operational consequence matters more than the code: a client's own admin can
never unstick their own agent. Approvals are now a thing we do for them. If a
client's agent parks and nobody here notices, the client has no recourse but to
ask. That is precisely why Phase 7's badge and Phase 4's expiry are not optional
extras.

**The nav badge adds a query on every admin page load** for a number that will be
zero almost always. It is a count over the indexed `by_status_requested` and is
worth it: the alternative is the current state, where the number is knowable and
nobody is shown it.

**Deleting the builder's policy step removes a control someone may believe in.**
That is the point, and it should be said plainly in the commit body: the setting
never did anything, and the real one now lives on agent settings.

**Phase 2 is the dangerous one, and it is dangerous in a quiet way.** It rewrites
how the conversation sent to the model is assembled after a pause. Get it wrong
and the failure is not a crash — it is a provider rejecting a malformed transcript,
or worse, accepting one where a tool result does not line up with the call it
answers, and the agent confidently acting on the wrong answer. That is why the
mixed-batch transcript test is written as a guard on the shape of the transcript
and not merely on the run reaching a terminal state.

The mitigation beyond tests is sequencing: Phase 2 lands and is exercised against
real traffic before the UI work in Phase 8 depends on its grouping. And the
existing suite at `convex/agentRuntime.test.ts:1145-1258` already covers the
single-approval park, resume and reject, so a regression in the common case will
be caught by tests written before this plan existed.

**Phase 3 changes what a rejection means, and the old meaning is tested.** A run
that used to end now continues. If the refused-call guard in step 4 is wrong in the
permissive direction, a determined model re-asks and a reviewer faces the same
decision repeatedly — annoying, visible, not dangerous. Wrong in the strict
direction and a legitimately different call is refused without being seen, which is
worse and quieter. The test pairing identical arguments against different arguments
exists for exactly that asymmetry.

**Removing the park-time transcript push changes an existing code path.** Step 5
of Phase 2 deletes `agentRuntime.ts:1397-1399`, whose comment argues those results
must be kept so the resumed run does not repeat paid-for work. The reasoning is
sound and the results are still kept — they move from the transcript to the tool
call records, which is where they can be reassembled in the right order. The
commit body needs to say that plainly, because the diff on its own looks like a
regression being introduced.

**Expiry destroys work automatically.** A run that has spent real tokens is
cancelled by a cron with no human in the loop. Three things make that acceptable:
it only ever cancels, never approves; the run had already stopped and spent
everything it was going to spend; and after Phase 7 the badge means a day of
silence is a choice rather than an oversight. The audit row and the thread message
mean the cancellation is never invisible.

The number to watch after this ships is how many approvals expire. A handful is
the safety net working. A steady stream means the queue is not being watched and
the answer is autonomy or fewer gated tools, not a longer window.

**Phase 10 is a large surface with no existing test coverage to fall back on.**
Every fault in it is currently masked by the fact that nobody can reach the
feature, which cuts both ways: there is no live behaviour to regress, and no
existing test that will tell us if a fix is wrong. The engine fixes (steps 1-4)
land before the screens so the mechanism is right before anything drives it.

**Two of the Phase 10 engine fixes change behaviour that a customer's saved
workflow may depend on.** Nobody can currently approve a step, so no workflow has
ever got past one — meaning no saved definition can be relying on the current
post-approval state. That makes these fixes safe in a way they would not be if the
feature worked. Worth stating in the commit body so it does not read as a
casual change to graph semantics.

**Making the budget limits settable creates a new way to break an agent.** An admin
can now cap an agent's spend or step count below what its objective needs, and the
agent will stop mid-task reporting a budget stop rather than a failure. The ceilings
prevent someone raising a limit unsafely; nothing prevents someone lowering one
unhelpfully. Naming the platform default beside each field is the mitigation —
someone typing 2 into a box labelled "default 10" can see what they are doing.

**Nothing is deferred out of this plan.** Everything found during research is a
phase.

---

## Sequencing and size

Three deliverable bodies of work, in this order. The estimates are working days of
focused build including tests, and they assume the browser verification below rather
than treating it as extra.

**Ship now, on its own — Phase 0.** Half a day. A live cross-tenant authorization
hole on a write path does not wait behind a ten-phase plan, and nothing else here
depends on it.

**The agent side — Phases 1-9.** Around eight and a half days. Phase 2 is a third
of that on its own and Phase 8 another day and a half. This is the body of work that
answers the original request: agents that can run unattended, limits that hold them,
approvals that are visible, and a queue that looks like the rest of the platform.

The budget limits add about half a day here rather than the full day they would cost
standalone, because Phases 1, 4 and 5 already open every file they touch.

**The workflow side — Phase 10.** Around four days. Independent of everything
above, shares no code with it, and is the difference between a "Human Approval"
node customers can build with and one they cannot.

So roughly **thirteen days**, around three weeks, and it splits cleanly at three
points rather than being one long march. Phase 0 today, Phases 1-9 as the main body,
Phase 10 as its own piece of work whenever the workflow builder next matters.

If only part of this gets built, the order above is also the priority order. Phase 0
is not optional. Phases 1, 5 and 7 together are the smallest set that delivers
something defensible — autonomy, the toggle and the limits that back it, and a badge
so a parked run is visible — at about two and a half days.

Phase 5 is the one phase that must not be split from Phase 1. Autonomy without
settable budgets is a brake pedal connected to nothing.

---

## Verification

Per `AGENTS.md`: `npm run verify:env`, `npm run lint:all`, `npm run check`,
`npm run build`, `git diff --check`. Plus the new test files and the existing
`convex/agentRuntime.test.ts`, `convex/agentRuns.test.ts`,
`convex/aiToolExecutionService.test.ts`, `convex/workflows.test.ts`,
`convex/workflowRuntime.test.ts` and `src/quality-drift.test.ts` green.

The regression guards — the absent-field agent still gating a write, the two-row
batch, the mixed-batch transcript, the refused-call re-request, the clamped budget
override, the expiry window, the two Phase 0 authorization guards, the preserved
workflow approval payload, and reject requiring confirmation — each checked by
reverting the fix and confirming the test fails, not by assuming.

Driven in the browser before hand-back, and this matters more than usual because
the screen has never been seen with data in it:

- an agent given a write tool and run, so a real approval row appears
- the badge counted, and the page confirmed unreachable as a company admin
- the row approved, and the run observed resuming and finishing
- a second run **rejected with a reason, and the agent observed carrying on** and
  acknowledging the refusal rather than dying
- the same agent observed *not* re-queueing the identical call
- **an agent asked to do two gated things in one turn**, so two rows appear as one
  group; the first approved and the run observed *not* moving; the second approved
  and the run observed finishing with both results in the transcript
- an approval left to expire with the window temporarily shortened, and the run
  observed cancelling with a message in the thread
- the window changed on the settings screen and the change observed taking effect
- the same agent switched to autonomous and run again, confirming it completes with
  no row created at all
- **and then, with approval off, its cost limit dropped and the agent observed
  stopping on the budget** — the brake that is now the only one left, seen working

And for Phase 10, a workflow built with a Human Approval node and actually driven
end to end — run, halted, found on the executions screen, approved, and the
downstream node observed receiving the preview data the approval node carried. Then
a second one rejected, and a third left to expire. None of that has ever been done
on this platform, and until it is, the node in the builder is a promise nobody has
tested.
