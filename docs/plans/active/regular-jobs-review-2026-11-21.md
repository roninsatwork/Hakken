# Regular jobs review, 21 November 2026

Anthony asked which tasks run on their own, like the Gmail inbox checker did ("some of the coded tasks seem excessive"), then asked to keep this "as we are going to tackle a lot of those". This is the record of what runs, what each one measured on dev on 21 November 2026 and what was recommended. Nothing here has been changed yet: each change waits for his go.

The Gmail inbox checker is already gone. It checked every connected Gmail inbox every minute and was the platform's largest use of compute. It was removed on 9 October 2026 ("can we disable gmail this app will never use it").

## Two kinds of job

1. **Agent schedules.** Rows in the `schedules` table, shown on the Schedules screen, where anyone with access can switch one on or off. No code change needed.
2. **Coded timers.** Written in `convex/crons.ts`. Each runs through `internal.jobLedger.runJob`, which records its last run in the `jobRuns` table. They have no on/off switch: changing one means a code change.

## 1. Agent schedules on dev

| Schedule | Agent | How often | State |
|---|---|---|---|
| Google Analytics: Data Collection Scheduler | Google Analytics: Collector Agent | daily | on |
| Search Console: Data Collection Schedular | Search Console: Collector Agent | daily | on |
| Microsoft Clarity: each morning | Microsoft Clarity: Collector Agent | daily | on |
| Data for SEO: Queue Planner | Data for SEO Queue Planner | daily | on |
| Data for SEO: Queue Collector | DataForSEO Agent Collector | daily | on |
| Insights: the team's run | Insights: Head of Strategy | daily | on |
| SEO data, one per company (Conterra Ops, Hurtwood House, Korda, National Extension College, Period House Group, Ronins Agency) | none | monthly | on |
| Outbox: send what is waiting | Outbox Queue Processing Agent | hourly | **off** |

The Outbox schedule being off is why 42 emails have waited in the Outbox since 10 October 2026. The agent itself is on.

## 2. Coded timers, measured on dev

"Last run" is one run's time from `jobRuns.lastDurationMs` on 21 November 2026, so treat it as a rough size: run times vary, and an action's time includes waiting on other services. "A day" is runs a day times that run's time. All 36 timers together came to about 10 minutes a day, in about 5,000 small calls. Every one's last run succeeded.

| Timer | How often | Runs a day | Last run | A day | What it does |
|---|---|---|---|---|---|
| wiki-distill-sweep | 15 min | 96 | 2,121 ms | 3.4 min | Reads documents imported before the wiki, a few at a time. Makes sure the wiki staff agents exist on every run, which is most of its 2 seconds. |
| connection-probes | hourly | 24 | 2,942 ms | 1.2 min | Asks every connection whether it works: each AI provider for its model list, the phone line, the inbox. |
| hakken-task-watch | 15 min | 96 | 509 ms | 0.8 min | Hakken tasks' alerts whose time has come ("9am arrives by 9:15"). |
| workflow-schedule-dispatcher | 1 min | 1,440 | 32 ms | 0.8 min | Starts the agent schedules above when they're due. |
| hakken-task-reports | 15 min | 96 | 372 ms | 0.6 min | Hakken tasks' reports due on their owner's day and time. |
| governance-rollup-rebuild | 10 min | 144 | 185 ms | 0.4 min | Recounts the governance admin screen's figures. |
| seo-collection-sweep | hourly | 24 | 633 ms | 0.3 min | Catches a DataForSEO collection step that died. |
| auto-setup-watch | 10 min | 144 | 99 ms | 0.2 min | Carries on an Auto Setup run whose step was lost. Never starts one. |
| purge-stall-reaper | 10 min | 144 | 93 ms | 0.2 min | Marks a data purge that died as failed. |
| auto-classify-watch | 10 min | 144 | 81 ms | 0.2 min | Carries on an Auto Classify run whose step was lost. |
| agent-skill-rollup-rebuild | 10 min | 144 | 74 ms | 0.2 min | Recounts the Skill Center admin screen's figures. |
| company-memory-suggestion-sweep | 6 hours | 4 | 2,653 ms | 0.2 min | Reads new chats and suggests notes about a company. One AI call per company with new chats. |
| user-memory-suggestion-sweep | 6 hours | 4 | 2,613 ms | 0.2 min | The same for each person. Spends nothing while the autonomousMemory switch is off. |
| upload-garbage-collection | 5 min | 288 | 31 ms | 0.1 min | Clears up abandoned uploads. |
| collection-step-watch | 2 min | 720 | 12 ms | 0.1 min | Carries on a website's collection step the platform stopped. |
| agent-run-stall-recovery | 2 min | 720 | 11 ms | 0.1 min | Revives or fails agent runs whose action died. |
| tool-idempotency-purge | hourly | 24 | 323 ms | 0.1 min | Drops old records that make retried writes safe. |
| stripe-billing-reconciliation | 5 min | 288 | 23 ms | 0.1 min | Billing check with Stripe. Does nothing while billing is off. |
| agent-approval-expiry | 15 min | 96 | 50 ms | 0.1 min | Gives up on agent approvals nobody answered. |
| outbox-watch | hourly | 24 | 137 ms | 0.1 min | Keeps the Outbox agent there and tells super admins about stuck emails. |
| dispatch-platform-alerts | daily 00:25 | 1 | 3,101 ms | under 0.1 min | Platform alerts. |
| wiki-tending-sweep | daily | 1 | 2,104 ms | under 0.1 min | Repairs wiki links; a model sees a few overgrown pages. |
| wiki-freshness-sweep | daily | 1 | 2,075 ms | under 0.1 min | Re-checks aging wiki pages against their sources. |
| wiki-contradiction-sweep | daily | 1 | 1,934 ms | under 0.1 min | Reads related wiki pages together for disagreements. |
| generate-daily-analytics-snapshots | daily 00:05 | 1 | 1,438 ms | under 0.1 min | Daily analytics snapshot. |
| workflow-approval-expiry | 15 min | 96 | 14 ms | under 0.1 min | Gives up on workflow approvals nobody answered. |
| unified-data-purge-dispatcher | hourly | 24 | 56 ms | under 0.1 min | Runs scheduled data purges. |
| knowledge-evidence-sweep | hourly | 24 | 46 ms | under 0.1 min | Folds answer ratings into knowledge evidence. |
| vector-garbage-collection | hourly | 24 | 39 ms | under 0.1 min | Wipes expired chat-thread search entries. |
| connector-oauth-token-refresh | hourly | 24 | 39 ms | under 0.1 min | Refreshes connected accounts' sign-in keys before they expire. |
| sites-list-copy-refresh | daily 03:30 | 1 | 727 ms | under 0.1 min | Rebuilds any Sites list copy out of date with its data. |
| credit-ledger-sweep | hourly | 24 | 25 ms | under 0.1 min | Ends credit batches whose time is up. |
| user-login-count-rollup | daily 00:10 | 1 | 214 ms | under 0.1 min | The admin directory's 30-day login counts. |
| google-updates-feed | daily 06:15 | 1 | 184 ms | under 0.1 min | Reads Google's Search Status page for the Reading room and chart markers. |
| search-console-weekly-rebuild | daily 05:00 | 1 | 180 ms | under 0.1 min | Adds up Search Console figures a week old. |
| hakken-task-care | daily 05:30 | 1 | 98 ms | under 0.1 min | Pauses Hakken tasks that can no longer work. |
| wiki-weekly-report | Mondays 07:00 | | 410 ms | | One digest per company per week. |
| wiki-exam-growth | 1st of the month | | 374 ms | | Drafts exam cases from real questions. |
| reset-billing-cycles | 1st of the month | | | | Monthly subscription quota reset. |

What the framework's features held on dev the same day: 0 memory suggestions (company or person), 0 agent approvals, 0 connected accounts, 0 phone lines, 0 Hakken tasks, 0 workflows, 2 wiki pages.

`jobRuns` still holds rows for three timers that no longer exist: `gmail-mailbox-watcher`, `clarity-morning` and `search-console-daily`. They're harmless, but the jobs screen may still list them.

## Recommended, 21 November 2026

Seven changes. Together they save about 6 of the 10 minutes a day and about 1,500 calls a day. That is tidier and means fewer calls to outside services, but it saves very little money: the real Convex costs are the data collections (see the website running costs memory).

| Timer | Now | Recommended | Why |
|---|---|---|---|
| wiki-distill-sweep | 15 min | daily | A third of all timer time, catching up on old documents; 2 wiki pages on dev. |
| connection-probes | hourly | daily | Calls each AI provider's model list 24 times a day. Daily still catches a broken key the same day. |
| company-memory-suggestion-sweep and user-memory-suggestion-sweep | 6 hours | off | Never made a suggestion on dev; costs an AI call per company with new chats. |
| stripe-billing-reconciliation | 5 min | off until charging starts | Billing isn't live, so it does nothing. |
| agent-approval-expiry and workflow-approval-expiry | 15 min | hourly | No approvals exist on dev, and Hakken never asks the client to approve. |
| governance-rollup-rebuild and agent-skill-rollup-rebuild | 10 min | hourly | Admin screen figures only; the screens say how old they are. |

Kept as they are: the schedule starter (every minute, so the collectors start on time), the two stall watchers (every 2 minutes, so collections finish without anyone pressing a button), Hakken tasks' alerts and reports (every 15 minutes, a promise made in a menu feature), everything nightly and the upload, purge and Outbox watchers.

## How to change a coded timer

- Change its line in `convex/crons.ts`.
- Change its entry in `EXPECTED_EVERY_MINUTES` in `convex/jobLedger.ts` in the same change, or the jobs screen calls it overdue.
- To switch one off, take it out of both `crons.ts` and `JOBS` / `EXPECTED_EVERY_MINUTES` in `jobLedger.ts`, and say where it went in a comment in `crons.ts`, as the Gmail checker's removal does.
- `convex/cronsWiring.test.ts` and `convex/jobLedger.test.ts` hold the timers to the ledger: run them.
- To measure again: `npx convex run --inline-query` over `jobRuns`, reading `lastDurationMs` and `lastRanAt` for each job.

## Done the same day

- The Outbox watcher (`tellIfStuckInternal`, `convex/outboxQueueAgent.ts`) no longer tells super admins about stuck emails while the Outbox agent is switched off or its schedule is stopped. It still tells them when both are on and emails wait over two hours. Live on dev, not committed. The 42 notices already in Anthony's bell were left as they were, waiting on his answer.

## Added the same day: the wiki timers and Sonae

Anthony pointed out that Sonae fixes the wiki as documents come in, not on a timer. Sonae reads a new document whole the moment it arrives, rewrites the pages a changed document taught and clears what a deleted one backed. It folded `wiki-distill-sweep`, `wiki-tending-sweep`, `wiki-contradiction-sweep` and `wiki-freshness-sweep` into one nightly `wiki-daily-checkup`. Contradiction and freshness checks are still nightly in Sonae.

So for Hakken the wiki reader's recommendation above becomes part of [bringing Hakken's wiki up to Sonae's](wiki-sonae-catch-up-plan-2026-11-21.md): `wiki-distill-sweep` goes daily once documents are learned on the way in (its phase 1), and all four wiki sweeps go once the nightly check-up replaces them (its phase 2).

Built later the same day, with Anthony's yes: the nightly check-up `wiki-daily-checkup` (02:00 UTC) replaced `wiki-distill-sweep`, `wiki-tending-sweep`, `wiki-contradiction-sweep` and `wiki-freshness-sweep` in `convex/crons.ts` and `convex/jobLedger.ts`. Uncommitted on `dev`. The old sweeps' functions stay for each wiki helper's Run button.

