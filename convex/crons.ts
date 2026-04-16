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

export default crons;
