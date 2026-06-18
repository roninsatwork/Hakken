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
