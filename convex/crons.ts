import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Optional Stripe recovery; the mutation is inert while billing is disabled.
crons.interval(
  "stripe-billing-reconciliation",
  { minutes: 5 },
  internal.jobLedger.runJob,
  { job: "stripe-billing-reconciliation" }
);


// Run workflow schedule dispatcher every minute
crons.interval(
  "workflow-schedule-dispatcher",
  { minutes: 1 },
  internal.jobLedger.runJob,
  { job: "workflow-schedule-dispatcher" }
);

// The mailbox that answers itself: poll every connected Gmail mailbox for
// new mail, answer what company knowledge can answer, and turn the rest
// into tasks with a holding reply. Idempotent per message id, so an
// overlapping poll can never answer twice.
crons.interval(
  "gmail-mailbox-watcher",
  { minutes: 1 },
  internal.jobLedger.runJob,
  { job: "gmail-mailbox-watcher" }
);

// Keep connector OAuth tokens alive: refresh anything dying within the next
// two hours, so a long-idle connection works the moment it is needed and a
// revoked one is discovered within the hour rather than at demo time.
crons.interval(
  "connector-oauth-token-refresh",
  { hours: 1 },
  internal.jobLedger.runJob,
  { job: "connector-oauth-token-refresh" }
);

// Ask each connection whether it actually works (seven-gaps plan, phase 2):
// the inbox is asked for its inbox, the model providers for their model
// lists, the phone line about its account. Configuration checks contact
// nothing by design; this one contacts everything, once an hour, so a
// mailbox that stopped answering is discovered here rather than by a
// customer whose email went unanswered.
crons.interval(
  "connection-probes",
  { hours: 1 },
  internal.jobLedger.runJob,
  { job: "connection-probes" }
);

// Revive agent runs whose action died without reaching a terminal state, and
// fail the ones that cannot be revived. Without this a killed action leaves a
// run marked RUNNING and a reply marked as streaming for ever.
crons.interval(
  "agent-run-stall-recovery",
  { minutes: 2 },
  internal.jobLedger.runJob,
  { job: "agent-run-stall-recovery" }
);

// Give up on approvals nobody answered, so a parked run does not hold its
// checkpoint and its place in every count for ever. The window is measured in
// hours, so this only needs to run often enough that the number is roughly true.
crons.interval(
  "agent-approval-expiry",
  { minutes: 15 },
  internal.jobLedger.runJob,
  { job: "agent-approval-expiry" }
);

// The same window, for the other approval mechanism. A workflow halted on a
// Human Approval node kept its execution RUNNING for ever; nothing but the
// 30-day retention purge ever touched it, and that deleted it rather than
// finishing it.
crons.interval(
  "workflow-approval-expiry",
  { minutes: 15 },
  internal.jobLedger.runJob,
  { job: "workflow-approval-expiry" }
);

// Recompute the Skill Center counts. They used to be totalled on every page
// load by walking every skill and all of its agent bindings; counting cannot be
// indexed away, so it happens here instead. Ten minutes keeps the panel close
// enough to live while leaving the read path a single document lookup, and the
// screen shows how old the numbers are either way.
// Recompute the governance day buckets and estate snapshot. The overview used
// to count the whole estate on every visit — up to ~34,500 rows, capped and
// therefore already inexact — and recomputed reactively whenever any agent did
// anything. Counting cannot be indexed away, so it happens here instead, and
// the screens read a handful of rows. Same trade, same cadence, as the skills
// rollup below; each tick recomputes only the last two days, so the work stays
// constant however much history accumulates.
crons.interval(
  "governance-rollup-rebuild",
  { minutes: 10 },
  internal.jobLedger.runJob,
  { job: "governance-rollup-rebuild" }
);

crons.interval(
  "agent-skill-rollup-rebuild",
  { minutes: 10 },
  internal.jobLedger.runJob,
  { job: "agent-skill-rollup-rebuild" }
);

// Read what customers actually asked and propose durable notes for review.
// Six hours rather than continuously: a memory worth keeping is still worth
// keeping later, and every sweep costs a model call per company. The sweep
// only reads messages that arrived since it last looked, so a quiet company
// costs nothing, and it stops proposing once a company's queue is backed up.
crons.interval(
  "company-memory-suggestion-sweep",
  { hours: 6 },
  internal.jobLedger.runJob,
  { job: "company-memory-suggestion-sweep" }
);

// The personal layer's sweep (personal-layer-and-goals-plan.md, part 2):
// each person's own recent conversations, read for durable notes about the
// person. Spends nothing while the autonomousMemory switch is off, and a
// full note is never read at all.
crons.interval(
  "user-memory-suggestion-sweep",
  { hours: 6 },
  internal.jobLedger.runJob,
  { job: "user-memory-suggestion-sweep" }
);

// The wiki's nightly gardener (wiki plan, phase 4): mechanical link repair
// costs nothing, and at most a few overgrown pages per company see a model.
// A company with no wiki pages is never even visited.
crons.interval(
  "wiki-tending-sweep",
  { hours: 24 },
  internal.jobLedger.runJob,
  { job: "wiki-tending-sweep" }
);

// The wiki's catch-up reader (wiki-replaces-knowledge plan, stage one):
// documents imported before the wiki existed — or whose on-ready hook died —
// get read a few at a time until nothing is left behind. A company with
// nothing unread is never visited, and each visit claims before it spends.
crons.interval(
  "wiki-distill-sweep",
  { minutes: 15 },
  internal.jobLedger.runJob,
  { job: "wiki-distill-sweep" }
);

// The Contradiction Finder's round (wiki-agents plan, phase 1): related
// pages read together nightly, disagreements raised as open questions for
// a person — never settled by the machine. Three bounded model calls per
// company per night at most; a stood-down finder spends nothing.
crons.interval(
  "wiki-contradiction-sweep",
  { hours: 24 },
  internal.jobLedger.runJob,
  { job: "wiki-contradiction-sweep" }
);

// The Freshness Checker's round (wiki-agents plan, phase 2): aging pages
// re-checked against their kept sources, three per company per night at
// most — pages younger than three weeks are never even considered, so a
// fresh wiki costs nothing. Failures become open questions, not rewrites.
crons.interval(
  "wiki-freshness-sweep",
  { hours: 24 },
  internal.jobLedger.runJob,
  { job: "wiki-freshness-sweep" }
);

// Fold new answer ratings into per-chunk knowledge evidence. Hourly and
// watermarked: rating a message stays O(1), the aggregation happens here,
// and a quiet hour costs one indexed read. No model call is involved.
crons.interval(
  "knowledge-evidence-sweep",
  { hours: 1 },
  internal.jobLedger.runJob,
  { job: "knowledge-evidence-sweep" }
);

// Run hourly dispatcher to evaluate unified scheduled data purges
crons.hourly(
  "unified-data-purge-dispatcher",
  { minuteUTC: 15 },
  internal.jobLedger.runJob,
  { job: "unified-data-purge-dispatcher" }
);

// A purge batch that dies at commit time cannot mark itself FAILED — the
// patch rolls back with the transaction — so the history row sticks RUNNING
// forever and blocks the retention screen. Same failure mode agent runs
// already have a sweeper for; this is the purge system's.
crons.interval(
  "purge-stall-reaper",
  { minutes: 10 },
  internal.jobLedger.runJob,
  { job: "purge-stall-reaper" }
);

// Drop tool idempotency records past their window, so the table that makes
// retried writes safe does not grow without bound.
crons.hourly(
  "tool-idempotency-purge",
  { minuteUTC: 45 },
  internal.jobLedger.runJob,
  { job: "tool-idempotency-purge" }
);

// Wipe expired ephemeral Vector docs attached to Threads
crons.hourly(
  "vector-garbage-collection",
  { minuteUTC: 30 },
  internal.jobLedger.runJob,
  { job: "vector-garbage-collection" }
);

// Monthly Subscription Quota Reset
crons.monthly(
  "reset-billing-cycles",
  { day: 1, hourUTC: 0, minuteUTC: 0 },
  internal.jobLedger.runJob,
  { job: "reset-billing-cycles" }
);

// Daily Analytics Snapshot Generator
crons.daily(
  "generate-daily-analytics-snapshots",
  { hourUTC: 0, minuteUTC: 5 },
  internal.jobLedger.runJob,
  { job: "generate-daily-analytics-snapshots" }
);

// Recompute the rolling 30-day login count behind the admin user directory.
// A rolling window decays with the calendar, so this has to run even on a night
// when nobody logged in — otherwise a dormant account keeps yesterday's number.
// Just before the platform alerts, so the directory and the alert agree.
crons.daily(
  "user-login-count-rollup",
  { hourUTC: 0, minuteUTC: 10 },
  internal.jobLedger.runJob,
  { job: "user-login-count-rollup" }
);

// Daily Platform Alerts
crons.daily(
  "dispatch-platform-alerts",
  { hourUTC: 0, minuteUTC: 25 },
  internal.jobLedger.runJob,
  { job: "dispatch-platform-alerts" }
);

// One plain digest per company per week (closing-the-loop plan, phase 3):
// what the wiki learned, what it couldn't answer, what the staff did, and
// what waits on a person. Mechanical, and silent when there's nothing to say.
crons.weekly(
  "wiki-weekly-report",
  { dayOfWeek: "monday", hourUTC: 7, minuteUTC: 0 },
  internal.jobLedger.runJob,
  { job: "wiki-weekly-report" }
);

// The Examiner's month (closing-the-loop plan, phase 4): real questions
// become drafted exam cases, waiting for a person on the Evals screen.
crons.monthly(
  "wiki-exam-growth",
  { day: 1, hourUTC: 8, minuteUTC: 0 },
  internal.jobLedger.runJob,
  { job: "wiki-exam-growth" }
);

export default crons;
