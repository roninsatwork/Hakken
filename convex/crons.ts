import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();


// Run workflow schedule dispatcher every minute
crons.interval(
  "workflow-schedule-dispatcher",
  { minutes: 1 },
  internal.workflowEngine.scheduleDispatcher,
  {}
);

// Activate approved agent releases when their reviewed launch window opens.
crons.interval(
  "agent-release-activation-dispatcher",
  { minutes: 1 },
  internal.releases.activateDueReleaseCandidates,
  {}
);

// Revive agent runs whose action died without reaching a terminal state, and
// fail the ones that cannot be revived. Without this a killed action leaves a
// run marked RUNNING and a reply marked as streaming for ever.
crons.interval(
  "agent-run-stall-recovery",
  { minutes: 2 },
  internal.agentRunCheckpoints.recoverStalledRuns,
  {}
);

// Give up on approvals nobody answered, so a parked run does not hold its
// checkpoint and its place in every count for ever. The window is measured in
// hours, so this only needs to run often enough that the number is roughly true.
crons.interval(
  "agent-approval-expiry",
  { minutes: 15 },
  internal.agentRuns.expireStalePendingApprovals,
  {}
);

// The same window, for the other approval mechanism. A workflow halted on a
// Human Approval node kept its execution RUNNING for ever; nothing but the
// 30-day retention purge ever touched it, and that deleted it rather than
// finishing it.
crons.interval(
  "workflow-approval-expiry",
  { minutes: 15 },
  internal.workflowEngine.expireStaleWorkflowApprovals,
  {}
);

// Recompute the Skill Center counts. They used to be totalled on every page
// load by walking every skill and all of its agent bindings; counting cannot be
// indexed away, so it happens here instead. Ten minutes keeps the panel close
// enough to live while leaving the read path a single document lookup, and the
// screen shows how old the numbers are either way.
crons.interval(
  "agent-skill-rollup-rebuild",
  { minutes: 10 },
  internal.agentSkills.rebuildSkillCatalogRollupInternal,
  {}
);

// Read what customers actually asked and propose durable notes for review.
// Six hours rather than continuously: a memory worth keeping is still worth
// keeping later, and every sweep costs a model call per company. The sweep
// only reads messages that arrived since it last looked, so a quiet company
// costs nothing, and it stops proposing once a company's queue is backed up.
crons.interval(
  "company-memory-suggestion-sweep",
  { hours: 6 },
  internal.companyMemorySuggestionActions.sweepDispatcher,
  {}
);

// Run hourly dispatcher to evaluate auto-purge schedule
crons.hourly(
  "audit-log-purge-dispatcher",
  { minuteUTC: 0 },
  internal.auditLogs.dispatcher,
  {}
);

// Run hourly dispatcher to evaluate unified scheduled data purges
crons.hourly(
  "unified-data-purge-dispatcher",
  { minuteUTC: 15 },
  internal.purges.dispatcher,
  {}
);

// Drop tool idempotency records past their window, so the table that makes
// retried writes safe does not grow without bound.
crons.hourly(
  "tool-idempotency-purge",
  { minuteUTC: 45 },
  internal.aiToolWriteTools.purgeExpiredToolIdempotency,
  {}
);

// Wipe expired ephemeral Vector docs attached to Threads
crons.hourly(
  "vector-garbage-collection",
  { minuteUTC: 30 },
  internal.knowledge.garbageCollectThreadVectors,
  {}
);

// Monthly Subscription Quota Reset
crons.monthly(
  "reset-billing-cycles",
  { day: 1, hourUTC: 0, minuteUTC: 0 },
  internal.plans.resetBillingCycle,
  {}
);

// Daily Analytics Snapshot Generator
crons.daily(
  "generate-daily-analytics-snapshots",
  { hourUTC: 0, minuteUTC: 5 },
  internal.analyticsCron.generateDailySnapshots,
  {}
);

// Daily Platform Alerts
crons.daily(
  "dispatch-platform-alerts",
  { hourUTC: 0, minuteUTC: 25 },
  internal.analyticsCron.dispatchPlatformAlerts,
  { daysBack: 7 }
);

export default crons;
