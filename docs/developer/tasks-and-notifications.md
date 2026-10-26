---
product: Hakken
documentation_type: developer guide
feature_area: generic tasks and in-app notifications
audience: workspace users, company admins and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/tasks-and-notifications.md
last_reviewed: '2026-10-26T10:17:44+00:00'
reviewed_against: current implementation
status: Current
---
# Tasks And Notifications

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Generic tasks and in-app notifications
> **Reviewed:** 26 October 2026, 10:17:44 GMT (Europe/London)
> **Source path:** `docs/developer/tasks-and-notifications.md` · **Status:** Current

Tasks and notifications are implemented by `/app/tasks`, `convex/tasks.ts`,
`convex/notifications.ts`, `src/lib/taskGrouping.ts`,
`src/ui/components/layout/NotificationBell.tsx`, and sidebar/header badge
wiring. They give Hakken a tenant-scoped work queue and a per-user in-app signal
without turning tasks into approvals.

Read this before changing task schema, task creation, assignment, state changes,
notification writes, notification read state, agent/workflow task tools, phone
follow-up task creation and retired integration records, or photo-action confirmation.

## Product Surface

- `src/app/(dashboard)/app/tasks/page.tsx` is the workspace task list.
- `src/lib/taskGrouping.ts` groups tasks by overdue, today, this week, later,
  done, and cancelled.
- `src/ui/components/layout/SidebarNavTrees.tsx` links `/app/tasks` from the
  user navigation tree, when the company has the tasks module. The link carries
  no count; the two sidebar badges are for workflow runs and governance
  approvals.
- `src/ui/components/layout/Header.tsx` mounts the notification bell.
- `src/ui/components/layout/NotificationBell.tsx` lists recent notifications,
  shows the unread count, opens notification links, marks one notification read,
  and marks up to 200 owned unread notifications, including ones not yet loaded.

The UI supports all-workspace and mine-only task views, manual task creation,
assignment to a workspace member, due dates, completion, reopening, cancellation,
pagination, source links, and machine-source labels for agent/workflow tasks.

## Data Model

`tasks` stores:

- `companyId`
- `title`
- `detail`
- `assigneeUserId`
- `dueAt`
- `status`: `OPEN`, `DONE`, or `CANCELLED`
- `createdByUserId`
- `createdBySource`: `PERSON`, `AGENT`, or `WORKFLOW`
- `sourceRunId`
- `sourceUrl`
- `createdAt`
- `completedAt`
- `completedByUserId`

Indexes:

- `by_company_status` for workspace task lists.
- `by_assignee_status` for mine-only task lists.

`notifications` stores:

- `userId`
- `companyId`
- `kind`
- `title`
- `body`
- `href`
- `readAt`
- `createdAt`

Indexes:

- `by_user_created` for the notification list.
- `by_user_unread` for the unread bell count.

A notification belongs to exactly one user. There is no shared seen/read flag.

## Convex API

`convex/tasks.ts` exports:

- `listTasks`: tenant query with pagination, optional status, and mine-only
  filtering.
- `countOpenTasks`: module query returning up to 100 open rows; the current task sidebar does not display this count.
- `listAssignableMembers`: tenant query returning only member id, name, and
  email for the current workspace.
- `createTask`: tenant mutation for person-created tasks.
- `confirmPhotoAction`: public mutation that turns a stored photo-action
  proposal into one task after signed-in or widget-token thread access checks.
- `completeTask`, `reopenTask`, and `cancelTask`: tenant mutations that preserve
  task history and write audit rows.
- `createTaskFromAgent`: internal mutation used by the Hakken task tool. It
  resolves an assignee email within the acting tenant.
- `createTaskFromWorkflow`: internal mutation used by workflow task nodes. It
  resolves an assignee email within the workflow tenant.
- `createTaskInternal`: the single internal write door for agent/workflow
  machine-created tasks.

`convex/notifications.ts` exports:

- `listMine`: tenant query for a user's notification feed.
- `countMineUnread`: tenant query for the bell badge, capped by
  `UNREAD_COUNT_LIMIT`.
- `markRead`: tenant mutation that only marks the caller's notification.
- `markAllMineRead`: tenant mutation that marks up to 200 of the caller's unread
  notifications.
- `notifyUserInternal`: the only writer. It is internal and must be called by
  the thing that actually happened.

## Creation Paths

Task creation currently comes from several implemented areas:

- manual creation on `/app/tasks`
- agent tool execution through `task.create`
- workflow task nodes through `createTaskFromWorkflow`
- telephone after-call follow-up
- legacy retained integration records; Gmail watching is retired
- photo-action confirmation from Ask Hakken or the anonymous widget

Assigning a task to someone else triggers `notifyUserInternal` with kind
`TASK_ASSIGNED` and `href: "/app/tasks"`. Assigning a task to yourself does not
notify you.

## Authorization And Tenancy

Preserve these boundaries:

- Client task functions use tenant builders and the active workspace.
- A task cannot be assigned to somebody outside the task's workspace.
- Mine-only task queries use the assignee index, then reassert company scope on
  the returned page.
- Agent and workflow task creation resolve assignees by email inside the acting
  tenant; model-supplied or template-supplied identifiers must not cross tenant
  boundaries.
- Anonymous widget photo confirmation must pass the same widget token/thread
  access check as widget messages.
- Notifications are per-user, not per-company. A user can read only their own
  notifications.
- Browsers cannot call `notifyUserInternal`.

Tasks are deliberately not approvals. Do not make an agent run or workflow wait
for a task to be completed; use approval infrastructure for gates.

## Auditing And History

Task creation, completion, reopening, and cancellation write task audit rows.
Cancelled tasks remain visible as history instead of being deleted.

`sourceUrl` points back to the screen that produced the work when Hakken has a
useful internal route. The Tasks page renders only internal source links that
start with `/`.

## Tests

Focused coverage includes:

- `convex/tasks.test.ts` for tenant isolation, task state changes, audit rows,
  assignee notifications, agent/workflow task creation, and photo-action
  confirmation.
- `convex/notifications.test.ts` for per-user notification visibility, read
  state, unread counts, and mark-all behavior.
- `src/lib/taskGrouping.test.ts` where grouping behavior is changed or extended.
- header/sidebar route tests where notification or task badges change.
- feature-specific tests for phone, workflows, and photo actions when
  their task creation path changes.

For documentation-only changes, run `git diff --check` and the local Markdown
link/index checks used by the documentation upkeep loop.

## Maintenance Rules

- Keep tasks tenant-scoped by `companyId`.
- Keep notification read state owned by `userId`.
- Keep `notifyUserInternal` internal-only.
- Keep machine task creation behind internal functions that resolve tenant
  context before writing.
- Keep assignment notifications tied to actual task writes.
- Preserve cancelled and completed tasks as history.
- Use approvals, not tasks, for anything that must block an agent or workflow.

## Current Module Guards And Ownership

The task list, assignee picker, creation and state APIs use `moduleQuery`/`moduleMutation` for `CORE_MODULES.tasks`. The default guard is authenticated, not admin write. The handlers use the active `ctx.companyId`, return an empty list without a company, or reject creation with `NO_ACTIVE_COMPANY`. A task ID must match that company before a lifecycle write. There is no assignee-only restriction on complete/reopen/cancel, and no explicit oversight-role refusal in these declarations. Do not claim these endpoints inherit `adminMutation`'s write-role set. A product decision or separately authorized code change is required to reconcile this with universal read-only-role expectations.

`listTasks` reads `by_company_status` or `by_assignee_status` with optional status, ascending, then rechecks company on the returned page. The Mine index alone is not a tenant boundary; filtering can yield short pages with a live continuation cursor. The list return shape strips lifecycle internals through `toTaskListRow`. The UI requests thirty at a time and groups that loaded set; it is not whole-result sorting or an exact group count. `taskGrouping.ts` uses local midnight and a rolling seven-day window, preserves within-group incoming order, and assigns undated Open work to Later. The screen refreshes its clock once a minute.

`assertValidTaskFields` trims a nonempty title up to 200 characters and optional detail up to 2,000. `assertAssigneeInTenant` checks the assignee exists and resolves their impersonating company before durable company. The picker and machine email resolver read at most 200 durable-company members. `findMemberByEmail` trims/lowercases the requested email; failure to find a same-tenant member produces an unassigned task, not a cross-company lookup. Large-company or impersonation discrepancies need explicit support investigation.

`completeTask` writes DONE and completion attribution, even if the caller is not the assignee. `reopenTask` clears attribution; `cancelTask` patches CANCELLED without deleting history. These handlers audit each call and do not implement a global transition-idempotency key or validate every prior status. Client action deduplication limits overlapping clicks, not all repeated API calls. There is no generic task title/detail/due-date update API in the reviewed module.

## Creation, Notification And Duplicate Boundaries

`filePersonTask` and `createTaskInternal` share validation, company scope and audit behavior. The internal machine entry points trust their authenticated caller to establish the company before invocation. Workflow task creation uses the workflow creator's company in `workflowRuntime`, while the agent tool uses its run company. They store the source identity and `/app/tasks` route; sourceRunId is a string and can contain a workflow ID rather than a run ID. Do not infer a validated foreign-key relationship solely from that field's name.

Photo confirmation reads the proposal from an assistant message, checks thread access through `assertCanAccessThread`, and returns an existing `photoActionTaskId` on a second tap. Signed-in confirmation files as that person and assigns them; widget confirmation resolves the company call assignee. It does not accept browser replacement title/detail. This is per-message transactional deduplication, unlike a universal agent/workflow task idempotency guarantee. Its public wrapper serves anonymous widget sessions behind token/thread checks rather than making arbitrary task creation public.

`notifyAssignee` invokes the internal notification writer during task creation, unless unassigned or assigned by the actor to themselves. Machine writes have no person actor and therefore can notify their assignee. The notification kind is TASK_ASSIGNED with `/app/tasks`; changing task status is not documented as sending a new assignment notice. Existing call sites also produce notifications for collectors, recurring-task outputs, Wiki reporting and knowledge events. Their domain-specific trigger semantics remain in their own guides.

Notification reads use `userId`, not active company. `countMineUnread` takes 51 records, returns count capped at 50 plus `atLimit`, and `markAllMineRead` patches only the first 200 unread records. The bell opens a fifteen-row paged query and displays fifty-plus when atLimit. Its mark-one failure is intentionally swallowed; absence of a UI error is not proof that `readAt` persisted. Mark-all covers owned unread records beyond the visible page, contradicting the older visible-only description.

`notifyUserInternal` trims title/body and refuses an empty title, but accepts arbitrary internal kind/href and does not independently verify the underlying event or recipient existence. Internal callers own that contract. The bell renders provided href values rather than applying the task page's starts-with-slash check; do not generalize one surface's link filter to the other. No notification delivery acknowledgement, browser-push transport or universal expiry is implemented in this module.

## Retention And Evidence Limits

The task module retains settled rows and has no ordinary delete API. The personal-data erasure path separately deletes notifications and clears declared references on generic tasks, as described below. Optional notification company metadata does not itself prove company-deletion cascades or a universal arbitrary-text scrub.

Focused task and notification tests cover ownership, cross-company rejection, status attribution, assignment notices, per-message photo deduplication, unread limits and read state. They were inspected as source and not executed. This documentation refresh ran Markdown validation only and changed no API, schema, permission, task, notification or integration state. Personal recurring Hakken tasks use separate tables and must not be conflated with this generic workspace queue.

## Personal-Data Lifecycle Cross-Check

The personal-data manifest defines explicit lifecycle treatment in `convex/personalDataService.ts`: personal notifications are ERASE records, while generic tasks are DISSOCIATE records whose work remains after the declared creator/assignee references are cleared. It does not establish an arbitrary free-text scrub or a universal time-based task/notification purge. Read [Governance And Trust](./governance-and-trust.md) for subject-access scope, retained exceptions and the durable erasure worker.
