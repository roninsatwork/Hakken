# Tasks And Notifications

Tasks and notifications are implemented by `/app/tasks`, `convex/tasks.ts`,
`convex/notifications.ts`, `src/lib/taskGrouping.ts`,
`src/ui/components/layout/NotificationBell.tsx`, and sidebar/header badge
wiring. They give Hakken a tenant-scoped work queue and a per-user in-app signal
without turning tasks into approvals.

Read this before changing task schema, task creation, assignment, state changes,
notification writes, notification read state, agent/workflow task tools, phone
or Gmail follow-up task creation, or photo-action confirmation.

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
  and marks all visible unread notifications read.

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
- `countOpenTasks`: tenant query for the sidebar badge, capped at 100 rows.
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
- Gmail watcher fallback for mail that needs a human
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
- feature-specific tests for phone, Gmail, workflows, and photo actions when
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
