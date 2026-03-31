import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run at exactly midnight UTC to compile preceding day's metrics
crons.daily(
  "aggregate-nightly-metrics",
  { hourUTC: 0, minuteUTC: 0 },
  internal.analytics.aggregateNightlyMetrics,
  {}
);

export default crons;
