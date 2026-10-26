---
product: Hakken
documentation_type: end-user guide
feature_area: Hakken tasks
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/hakken-tasks.md
last_reviewed: '2026-10-26T09:16:33+00:00'
reviewed_against: current implementation
status: Current
---
# Hakken Tasks

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Hakken tasks
> **Reviewed:** 26 October 2026, 09:16:33 GMT (Europe/London)
> **Source path:** `docs/end-user/hakken-tasks.md` · **Status:** Current

## Work you ask Hakken to keep doing

Hakken tasks are personal instructions for Hakken to monitor something or
send a recurring report. You create them through a conversation with
[Ask Hakken](./assistant-chat.md) and review them at `/app/hakken-tasks`.
Examples include watching a site's Google clicks, warning about a tracked
ranking, or sending a weekly list of pages that gained or lost activity.
The task identifies what to watch, when to check and how you want to hear.

This is separate from the workspace follow-up list at `/app/tasks`, described
in [Tasks And Notifications](./tasks-and-notifications.md). A follow-up item
can be assigned, completed or cancelled by people. A Hakken task has states
such as On, Paused and Needs you because it is recurring work for the system.
Creating a follow-up item does not automatically establish a recurring alert.

This guide describes local implementation reviewed on the date above. It
confirms no live schedule, provider connection or delivered alert. The
existence of monitoring and reports does not establish the entire business
improvement loop promised by [PRODUCT.md](../../PRODUCT.md).

## Personal ownership and platform oversight

Your Hakken tasks belong to you within the company in which they were
created. Another person in the same company does not automatically see them
in the normal app. A platform super administrator can inspect and manage a
company's Hakken tasks under Admin → Companies → the company → Hakken tasks.
That operational oversight is different from a shared team task board.

The company and website context matter. A task proposed in a conversation
uses that conversation's company. It cannot legitimately monitor another
company's private tracking list merely because you type the other company's
name. Before confirming, check the website and question/search, especially
when the account can work with several client contexts.

The platform limits how many of your tasks can be On at once. Paused and
deleted records are different from active capacity. If a task cannot be
created or resumed because the allowance is full, pause an unneeded active
task or ask the administrator to review the actual configured limit. Repeated
confirmation should not be used to try to exceed it.

## Create a task from a proposal

Use **Add a task** on the Hakken tasks page to open Ask Hakken, or ask in an
existing conversation. State the website, thing to monitor, condition,
timing and preferred channel. For example, specify whether a change means
below an absolute count or down by a percentage, and whether it must persist
for several days. A vague “watch this” does not establish a useful rule.

The Assistant returns a proposal for you to accept or decline. Inspect its
wording, source and expected result before saying yes. The stored proposal
has a pending/done/declined state; answering it twice should not create two
copies of the same work. Declining leaves the proposed action unperformed.
The conversation owner is the person authorized to answer that proposal.

Some proposals also add an untracked search or question to the website's
private tracking list. That is an extra data effect visible in the proposal
and subject to the website's tracking limits. Confirming a task is therefore
not always just saving a private note. Read whether new tracking is included
before accepting it.

A proposal to find something out in the background is a different branch
from creating an ongoing monitor. It can start research and return a write-up
to the conversation, with its own credit charge. Do not assume every
accepted proposal produces an On row in the recurring-task list.

## Understand the monitored source

A numerical alert can watch Search Console clicks, presented as visitors
from Google, or impressions for an owned website or a page. Those are not
Analytics sessions or conversions. If you need a different measurement,
check that the proposed rule actually supports it instead of interpreting
one source's count as another's.

A condition can mean below or above a count, or a percentage drop or rise
from usual, lasting a specified number of days. The observed day is the
source's reporting day, not necessarily an immediate live visit. A new
calendar day does not mean Google has finalized that day's figures. Review
the source's freshness when judging why a task has not fired.

Other alerts can watch an AI engine's answer to a tracked question or a
tracked Google search's ranking threshold. These are checked when the
underlying question/search is collected again. Creating an alert is not
an independent promise to buy fresh results every minute. It also does not
establish a statistically representative AI panel or guarantee what the
assistant will answer in the future.

## Weekly reports and delivery

A supported report selects a small list of pages that gained or lost the
most of the chosen Search Console measure over the preceding complete week,
compared with the week before. The configured number of pages and weekday
are part of the task. It is a recurring report about that measurement,
not a general automated audit of every commercial outcome.

Timing uses the owner's configured local time and time zone. When confirmed
through the browser, the current browser zone can be saved. The backend
normalizes invalid values to its defaults. Check timing when you travel,
change device or expect a report around a clock change; do not assume that
an old task automatically follows every later browser-zone change.

Channels can include the in-app bell, email and a linked Telegram account
where supported. Email passes through the Outbox and follows your Hakken
tasks communication choice. A check firing and an email arriving are
separate events. Read [Emails From Hakken](./emails.md) for hourly queueing,
opt-out and suppression. An unlinked Telegram account cannot receive a task
message simply because Telegram was mentioned in a prompt.

## Pause, resume or delete

Use the task row controls to pause work you no longer want checked, then
resume it later if it remains valid and within the active-task allowance.
A paused task is kept for later use; it is not secretly continuing to send
normal recurring alerts. You can also ask the Assistant for a change and
review its proposal before confirming.

Delete removes the task from normal screens and clears future checking.
The backend marks it Deleted rather than physically erasing every record,
because cost/history evidence is retained. It is not a formal permanent-data
purge or deletion of the underlying tracked keyword/question. If you want
tracking removed too, treat that as a separate requested change.

A task can be paused by Hakken as **Needs you** when its dependencies no
longer support it. Examples include a removed website, a disconnected or
silent Search Console connection, an unavailable page or tracking target,
or duplicated work. Read its note, fix the named issue and then resume.
If the problem remains, the backend refuses resume rather than pretending
the task is healthy.

## Costs, evidence and troubleshooting

Hakken tasks use credit hooks for specific work, including accepted research
and delivered task work. A product credit, supplier cost and a monthly plan
message allowance are distinct. This guide does not promise that every
kind of task or channel is free, or that a subscription includes unlimited
background research. Inspect the current pricing/usage surface and ask the
operator about an unexpected charge using the task and run identifiers.

When an alert arrives, follow its source link and check the period, value
and rule. A triggered threshold says the implemented condition was met;
it does not independently prove why the business changed or that a suggested
fix will work. Use the underlying source to decide what action is justified.

For a missing notification, first establish whether the task is On, whether
new source data exists, whether its condition was met, and whether the
selected channel is available. A successful check with no threshold crossing
may correctly send nothing. A delivery failure should not lead you to create
several identical tasks.

Report the company, task title, website, state, source freshness, expected
time/zone and chosen channel. Never include provider tokens or another
person's private task conversation. The [developer guide](../developer/hakken-tasks.md)
explains ownership, proposal confirmation, worker roles and retained states.
No task was created, resumed, checked or deleted during this documentation
review.
