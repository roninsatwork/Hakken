import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();


// Run hourly dispatcher to evaluate auto-purge schedule
crons.hourly(
  "audit-log-purge-dispatcher",
  { minuteUTC: 0 },
  internal.auditLogs.dispatcher,
  {}
);

// Wipe expired ephemeral Vector docs attached to Threads
crons.hourly(
  "vector-garbage-collection",
  { minuteUTC: 30 },
  internal.knowledge.garbageCollectThreadVectors,
  {}
);

export default crons;
