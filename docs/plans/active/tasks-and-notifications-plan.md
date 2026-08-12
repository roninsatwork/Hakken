# Sonae Can Hand Someone A Job, And Tell Them About It

Status: Agreed with Anthony 2026-08-12. Not started.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Sonae can find things and cannot ask anyone to act on them. An agent finishes,
writes an answer into a conversation nobody returns to, and the finding dies
there. The opportunity report names prospects worth chasing and nobody knows a
month later whether a single one was contacted.

Two things are missing and they are missing together: a **task** — work the
platform holds for a named person — and a **notification** — the platform
reaching that person somewhere other than their inbox. A task nobody is told
about is a task nobody does, which is why this is one plan and not two.

Anthony's call, 2026-08-12, choosing these two ahead of payments and ahead of
finishing the connectors.

## What is actually true today (verified 2026-08-12)

**Neither table exists.** `convex/schema.ts` has no `tasks` and no
`notifications`. Searched; zero matches.

**The platform can only reach people by email.** `resendEmailService.ts` sends,
`emailLayoutService.ts` renders one shared shell, `platformAlertService.ts`
sends the daily health alert, and `aiToolNotificationService.ts` is the agent's
email tool — restricted to existing same-tenant accounts so an injected prompt
cannot phone a stranger. There is no in-app inbox for any of it.

**One in-app signal already exists and shows the shape to copy.**
`SidebarNavigation.tsx` renders an amber count badge for waiting approvals,
absent at zero on purpose ("a badge that is always there stops being read"),
with `aria-label={n waiting}`. That is the only place the app tells you
something is waiting, and it is hard-wired to approvals.

**Approvals are not tasks and must not be conflated.** `agentRunApprovals`
(`convex/schema.ts:928`) answers "may the agent do this, yes or no", halts a
run, and expires. A task is "here is work for you"; it does not gate anything
and nothing waits on it.

**The workflow node is blocked on exactly this.**
`docs/plans/active/OUTSTANDING-TASKS.md:105` — "A task connector for workflows
(`workflow.task.create`) … Cannot be built yet because Sonae has no concept of
a task — that data model and an admin screen for it have to exist first."
The nine live node types in `convex/workflowRuntime.ts` are agent, api, code,
logic, database, wait, approval, iterator, merge, email; a workflow can pause
for a human decision but cannot hand a human a job.

**The machinery a task tool needs is already there.** Tools are deny-by-default
records dispatched through `REGISTERED_TOOL_HANDLERS`
(`convex/aiToolExecutionService.ts:412`) with side-effect levels, schema
validation of arguments, and the acting tenant taken from the conversation
rather than from anything the model said. A WRITE tool requires human approval
unless that agent has autonomy switched on.

**Tenancy is a solved problem to inherit, not re-solve.**
`convex/tenantFunctions.ts` exposes `tenantQuery`, `tenantMutation`,
`adminQuery`, `adminMutation`; the enumeration test proves every
client-callable function uses one.

### Confirmed absent (searched, zero matches)

- No task, todo, assignment or reminder concept anywhere in `convex/`.
- No in-app notification, inbox, bell or unread count.
- No push or mobile delivery of any kind. Out of scope here.

## Design commitments (binding on every phase)

1. **A task is not an approval.** Nothing blocks on a task, nothing expires
   because of one, and no run waits for one. If a future feature wants a
   gate, that is an approval and it already exists.
2. **Every task belongs to a tenant and is written through a tenant builder.**
   No new client-callable function may take a raw `companyId` from its caller.
3. **An agent creating a task is a WRITE tool.** It goes through the
   allowlisted dispatcher with a validated schema, it is audited, and it needs
   approval unless the agent is explicitly autonomous. An agent must never be
   able to assign work to somebody outside its own tenant.
4. **Notifications are a record, not a side channel.** Creating one is an
   internal mutation called by the thing that happened; nothing may write a
   notification directly from the browser.
5. **No badge at zero.** The existing rule holds: absent, not a grey nought.
6. **Nothing here sends email.** Email already exists and has its own plan; a
   notification lands in the app. Whether some notifications should also email
   is a later decision, deliberately not taken now.
7. **Read state is per person.** A notification belongs to one user. Marking
   it read must never mark it read for a colleague.

## Phase 1 — Tasks exist

**Goal:** a person can be given a piece of work, see it, and tick it off.

### 1.1 Schema

`tasks` in `convex/schema.ts`: `companyId`, `title`, `detail?`,
`assigneeUserId?`, `dueAt?`, `status` (`OPEN` | `DONE` | `CANCELLED`),
`createdByUserId?`, `createdBySource` (`PERSON` | `AGENT` | `WORKFLOW`),
`sourceRunId?`, `sourceUrl?`, `createdAt`, `completedAt?`, `completedByUserId?`.

Indexes: `by_company_status` (`companyId`, `status`, `dueAt`) for the list,
`by_assignee_status` (`assigneeUserId`, `status`, `dueAt`) for "mine".
`sourceUrl` is how a task points back at the screen that produced it.

### 1.2 Functions — `convex/tasks.ts`

`listTasks` (tenantQuery, paginated, filter by status and assignee),
`createTask` (tenantMutation), `completeTask`, `reopenTask`, `cancelTask`
(tenantMutation, each audited), and `createTaskInternal` (internalMutation) —
the single door agents and workflows come through.

### 1.3 Tests (write first), `convex/tasks.test.ts`

- "a task belongs to its tenant and is invisible to another" — the BOLA shape
  already used in `convex/bola.test.ts`.
- "completing a task records who completed it and when"
- "a cancelled task stays visible in history rather than vanishing"
- "assigning to a user outside the tenant is refused"
- "the list pages, and filters to one assignee"

### 1.4 Screen

`/app/tasks`, with a sidebar entry carrying an open-count badge (absent at
zero). Grouped **Overdue / Today / This week / Later / Done**, reusing
`src/lib/threadGrouping.ts`'s shape where it fits. Rows show title, who it is
for, when it is due, and a link back to where it came from.

**Definition of done:** the five tests pass; a task can be created, assigned,
completed and reopened in a browser; the full gate is green.

## Phase 2 — Notifications exist

**Goal:** the platform can tell you something without emailing you.

### 2.1 Schema

`notifications`: `userId`, `companyId`, `kind`, `title`, `body?`, `href?`,
`readAt?`, `createdAt`. Index `by_user_created` (`userId`, `createdAt`) and
`by_user_unread` (`userId`, `readAt`).

### 2.2 Functions — `convex/notifications.ts`

`listMine` (tenantQuery, paginated), `countMineUnread` (tenantQuery),
`markRead`, `markAllRead` (tenantMutation), `notifyUserInternal`
(internalMutation) — the only writer.

### 2.3 Tests (write first)

- "a notification is visible only to the person it is for"
- "marking read is per person and does not touch a colleague's copy"
- "the unread count ignores read and other people's rows"
- "an unread badge is absent at zero"

### 2.4 The bell

In `Header.tsx`, beside the profile menu: a bell with an unread count, opening
a panel of recent items, each linking to its `href`. Marking all read is one
press. Keyboard reachable and screen-reader labelled — the existing modal has
neither, which is item 5 on Anthony's list and is not fixed here.

**Definition of done:** the four tests pass; a notification raised in the
database appears in the bell without a reload (Convex is reactive, so this is
a real assertion, not a hope); the full gate is green.

## Phase 3 — They meet, and the machines can use them

**Goal:** the things that already happen start producing tasks and telling
people about them.

- **Assigning a task notifies its assignee.** One call to
  `notifyUserInternal` from `createTask`, never from the browser.
- **`task.create` as an agent tool.** Registered in
  `REGISTERED_TOOL_HANDLERS`, side effect WRITE, arguments schema-validated,
  assignee resolved within the acting tenant only. Test: an agent asking to
  assign outside its tenant is refused and audited.
- **`taskNode` as a workflow node type.** The connector
  `OUTSTANDING-TASKS.md:105` records as blocked; unblocked once Phase 1 lands.
- **Two existing signals become notifications** rather than only badges: an
  approval waiting for you, and an agent run that failed. Both already know
  who cares.

**Definition of done:** an agent run can leave a task that appears in the
assignee's bell; a workflow can do the same; the tenant-boundary test for the
tool passes; the full gate is green.

## What this plan deliberately does not do

- **No email.** A notification lands in the app. Whether any of them should
  also email is a separate decision with its own existing plan.
- **No push or mobile.** Nothing about devices.
- **No task comments, attachments, sub-tasks, labels, or a board view.** A
  title, a person, a date and a state. If more is wanted it will be wanted
  for a reason, and that reason can be written down then.
- **No recurring tasks.** The scheduler exists and can create them; a second
  recurrence engine inside tasks would be a duplicate.
- **No change to approvals.** They stay exactly as they are.
- **No notification preferences screen.** Everyone gets everything in the bell
  until there is enough volume for that to be annoying.

## Noticed in passing, not changed

- The approvals badge in `SidebarNavigation.tsx` is hard-wired to approvals.
  Once notifications exist it is arguably the same idea twice; leaving both
  until the bell has proven itself is deliberate.
- The shared modal (`src/ui/components/feedback/SonaeModal.tsx`) has no
  focus trap, no Escape handler and no dialog role. The bell panel must not
  copy it. Fixing the modal is item 5 on Anthony's list, not this plan.

## Sequencing and dependencies

```
Phase 1 (tasks) ──► Phase 3 (agent tool, workflow node, wiring)
Phase 2 (bell)  ──►
```

Phases 1 and 2 are independent and each is releasable alone — tasks with no
bell still work, a bell with no tasks still carries approvals and run
failures. Phase 3 needs both.

## Work queue

- [ ] **1.1** `tasks` table and indexes
- [ ] **1.2** `convex/tasks.ts` with tenant builders
- [ ] **1.3** Five tenant and lifecycle tests
- [ ] **1.4** `/app/tasks` screen and sidebar badge
- [ ] **2.1** `notifications` table and indexes
- [ ] **2.2** `convex/notifications.ts` with tenant builders
- [ ] **2.3** Four per-person read-state tests
- [ ] **2.4** The bell in the header
- [ ] **3.1** Assigning notifies the assignee
- [ ] **3.2** `task.create` agent tool, with its tenant-boundary test
- [ ] **3.3** `taskNode` workflow node; close `OUTSTANDING-TASKS.md` item 6
- [ ] **3.4** Approvals and failed runs raise notifications

## Reading list before touching this area

- `convex/tenantFunctions.ts` — the tenancy contract every new function uses.
- `convex/aiToolExecutionService.ts` — how a tool is registered, validated and
  audited before Phase 3 adds one.
- `docs/plans/active/agent-autonomy-and-approvals-plan.md` — what an approval
  is, so a task does not quietly become one.
- `src/ui/components/layout/SidebarNavigation.tsx` — the badge rule.
