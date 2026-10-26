---
product: Hakken
documentation_type: developer guide
feature_area: Hakken tasks
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/hakken-tasks.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# Hakken Tasks

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** Hakken tasks
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/developer/hakken-tasks.md` · **Status:** Current


## Distinguish the two task systems

Hakken tasks are implemented at `/app/hakken-tasks` using
`convex/hakkenTasks.ts`, `hakkenTaskSchema.ts`, `hakkenWatcher.ts`,
`hakkenWatcherActions.ts`, `hakkenStatReporter.ts`, `hakkenCaretaker.ts`,
`hakkenTaskFigures.ts`, `hakkenWatchFigures.ts` and `hakkenTaskCredits.ts`.
The company-admin oversight route is
`/admin/companies/[id]/hakken-tasks`, protected as platform oversight.

The older `tasks` table and `/app/tasks` represent human follow-up work and
are covered in [Tasks And Notifications](./tasks-and-notifications.md).
Do not merge their states, permissions or deletion semantics. A human task
being DONE is different from a recurring Hakken task being PAUSED.
The [user guide](../end-user/hakken-tasks.md) makes that distinction visible.

The client route mounts shared `HakkenTasksScreen` with `listMine`,
`pauseMine`, `resumeMine` and `deleteMine`. Its Add action routes to Ask Hakken
rather than a direct record-creation form. Other screens and Telegram can
surface the same stored proposals without becoming independent task writers.

## Owner/company authorization

`listMine` uses a tenant query and `requireTenant`; it reads tasks by owner
and active company. `ownTask` requires the task's owner and company to match
and rejects deleted records. This means colleagues do not automatically
read or edit each other's Hakken tasks. Company-scoped oversight functions
use `superAdminQuery` and `superAdminMutation` and are separate from ordinary
company-admin rights.

`tasksAllowed` resolves `hakkenTasksPerPerson` from effective company limits.
Creation and resume call the shared capacity check. Paused/deleted records
can remain stored without consuming the same On capacity. The source uses a
bounded listing of 300 records; do not label the result an unlimited audit
history or equate a list bound with a retention policy.

The Assistant tool receives the conversation's company/user, not a company
chosen in model arguments. Related `assistantTaskHandlers.ts` paths resolve
the target through authorized held websites. Preserve company and person
ownership in any new task kind or read tool, including internal channel
callbacks.

## Proposal confirmation is the write boundary

`answerProposal` calls `answerProposalAs` with the authenticated user.
The internal variant used by Telegram passes the linked user after its own
channel verification. The helper loads the message proposal and thread,
requires thread ownership and a company, then checks whether the proposal
is still PENDING. A repeated response returns its existing DONE or DECLINED
state rather than rerunning the accepted work.

A negative response records DECLINED only. RESEARCH schedules
`hakkenResearch.researchInternal` into the conversation and charges the
accepted request through `chargeTaskWork`. CREATE validates the target,
watch/report definition and channels, optionally adds a newly proposed
tracked question/search through the canonical website writer, and inserts
an ALERT or REPORT. The addition must respect existing private-list limits;
it is a real side effect, not merely descriptive proposal text.

PAUSE, RESUME and DELETE proposals load the owner's actual task before
changing state. The message records the answered time and resulting task ID
where one exists. A missing or foreign message/task cannot be confirmed by
editing a browser ID. These semantics are product/approval contracts and
must not change incidentally while updating documentation.

## State, timing and dependencies

`hakkenTaskSchema.ts` defines ON, PAUSED, NEEDS_YOU and DELETED.
`pauseMine` clears `nextCheckAt` and records pause time. Resume checks
`problemOf` for a NEEDS_YOU task before restoring ON and computing
`nextRunOf`. It also checks active capacity. Deletion is a soft state with
`deletedAt`, updated time and no next check; records remain for cost/history
rather than being physically removed by that mutation.

`utils/hakkenTaskTiming.ts` validates wall-clock time and time zone. Defaults
are 09:00 and Europe/London. It computes an instant from the owner's local
zone, including clock changes, rather than storing a permanently guessed UTC
offset. Browser confirmation can supply the zone; the server validates it
instead of accepting an arbitrary string as a working runtime zone.

Numeric alerts watch visitors/impressions from Search Console and a condition
below/above a count or drop/rise by a share for consecutive days. REPORT
stores its supported pages-change specification and weekday. AI-answer
watches store a tracked prompt, engine and condition; ranking watches store
a tracked search and threshold direction. A schema kind named RESEARCH does
not mean every accepted research action creates a long-lived recurring row.
Read the confirmation branch, not just the validator.

## Worker roles and source/delivery flow

`hakkenWatcher.ts` maintains the Watcher system agent and database side of
checks. `hakkenWatcherActions.ts` performs a round, reads the target's source
figures and generates an alert where the rule warrants it. The check record
and delivery evidence are separate. Do not send merely because a scheduled
check happened; alerts need the implemented threshold/change condition.

`hakkenStatReporter.ts` reads the source's page list for the completed week,
picks the requested gained/lost pages and sends on the owner's report
schedule. The cron entry `hakken-task-reports` dispatches through the job
ledger. Use the shared calendar-period and task-time helpers rather than
another local definition of the previous week or user's morning.

Answer and ranking monitors depend on the existing tracked question/search
being collected. A new personal monitor is not a second independent supplier
poller. `hakkenWatchFigures.ts` resolves the tracked inputs; results arriving
from the data pipeline feed those watch conditions. Keep source ownership,
collection cadence and personal task timing distinct in support guidance.

`hakkenCaretaker.problemOf` checks dependencies and returns actionable
problems, including missing websites, disconnected/silent Search Console,
unavailable page history and removed tracking. The Caretaker can put a task
into NEEDS_YOU. Resume must leave the reason visible until the condition is
fixed rather than unconditionally flipping the switch back on.

## Channels, credits and stored data

Channel fields distinguish bell, email and Telegram. Watcher/report paths
use the existing notification/outbox/channel services. Task email rendering
checks current reader preferences and suppression; switching HAKKEN_TASKS
email off updates applicable task email-channel choices. A worker completing
its condition does not prove provider delivery or receipt. See
[Email System](./email-system.md) for the queue boundary.

`hakkenTaskCredits.chargeTaskWork` resolves price/work classification through
credit helpers. Accepted research and particular task deliveries can create
credit records; these are different from supplier-cost measurements and
monthly chat counters. Do not infer universal free work or a complete refund
policy from a single price constant. Broader credit reporting remains a
separate review area.

`hakkenTasks` uses `by_owner`, `by_company` and `by_kind_state_next` for owner
lists, oversight and due work. `hakkenTaskChecks` uses `by_task_day` and
`by_day` for daily evidence. Proposal state sits on the conversation message.
Retained DELETED rows, checks and financial records must not be described as
permanently purged simply because the normal list hides them.

## Verification and operational limits

Relevant tests include `hakkenTasks.test.ts`, `hakkenTaskProposals.test.ts`,
`hakkenWatcher.test.ts`, `hakkenWatches.test.ts`,
`hakkenStatReporter.test.ts`, `hakkenTaskCredits.test.ts` and timing/rule tests
under `convex/utils/`. Future verification should assert confirmation
idempotency, owner/company refusal, limits on resume, dependency failures,
correct local timing and no duplicate delivery for a repeated check.

This review inspected selected state, confirmation, scheduling and source
paths. It ran no task checks, models, notifications, credits, live provider
requests or application tests. It did not establish a universal expiry or
permanent-deletion policy for every retained task/check record. For recovery,
identify the task, owner, company, source freshness and chosen channel before
proposing a change. A source dependency needing repair is different from a
healthy task whose condition has not yet become true.

The admin company task view reuses the shared task screen with separate
super-admin endpoints. This keeps presentation consistent without changing
ownership: reusing a component does not grant the normal owner query
permission to inspect other users' tasks.

## Recovery diagnosis

For a task that appears late, distinguish the next scheduled evaluation from the condition's observed truth and the notification's delivery state. Record the task's timezone and source freshness before concluding the schedule is broken. Reconfirming or recreating the task can change its confirmation identity and is not a substitute for inspecting the existing check. The normal owner endpoints and platform oversight endpoints deliberately remain separate even when they render the same table.
