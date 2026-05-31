type DashboardTimeframe =
  | "today"
  | "yesterday"
  | "7d"
  | "14d"
  | "30d"
  | "60d"
  | "90d"
  | "180d"
  | "365d"
  | "ytd"
  | "custom";

export type AnalyticsAggregation = "day" | "week" | "month";

const dayMs = 24 * 60 * 60 * 1000;

export function resolveTimestampRange(args: {
  timeframe: DashboardTimeframe;
  customStart?: number;
  customEnd?: number;
}) {
  const now = Date.now();
  let start = 0;

  if (args.timeframe === "today") start = new Date().setHours(0, 0, 0, 0);
  else if (args.timeframe === "yesterday") start = new Date(now).setHours(0, 0, 0, 0) - dayMs;
  else if (args.timeframe === "7d") start = now - 7 * dayMs;
  else if (args.timeframe === "14d") start = now - 14 * dayMs;
  else if (args.timeframe === "30d") start = now - 30 * dayMs;
  else if (args.timeframe === "60d") start = now - 60 * dayMs;
  else if (args.timeframe === "90d") start = now - 90 * dayMs;
  else if (args.timeframe === "180d") start = now - 180 * dayMs;
  else if (args.timeframe === "365d") start = now - 365 * dayMs;
  else if (args.timeframe === "ytd") start = new Date(new Date().getFullYear(), 0, 1).getTime();
  else if (args.timeframe === "custom" && args.customStart) start = args.customStart;

  const end = args.timeframe === "custom" && args.customEnd ? args.customEnd : now;
  return { start, end };
}

export function resolveDateRange(args: {
  timeframe: DashboardTimeframe;
  customStart?: number;
  customEnd?: number;
}) {
  const now = new Date();
  let start = new Date();
  const end = new Date();

  if (args.timeframe === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (args.timeframe === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (args.timeframe === "7d") start.setDate(now.getDate() - 7);
  else if (args.timeframe === "14d") start.setDate(now.getDate() - 14);
  else if (args.timeframe === "30d") start.setDate(now.getDate() - 30);
  else if (args.timeframe === "60d") start.setDate(now.getDate() - 60);
  else if (args.timeframe === "90d") start.setDate(now.getDate() - 90);
  else if (args.timeframe === "180d") start.setDate(now.getDate() - 180);
  else if (args.timeframe === "365d") start.setDate(now.getDate() - 365);
  else if (args.timeframe === "ytd") start = new Date(now.getFullYear(), 0, 1);
  else if (args.timeframe === "custom" && args.customStart) start = new Date(args.customStart);

  if (args.timeframe === "custom" && args.customEnd) {
    end.setTime(args.customEnd);
  }

  return { now, start, end };
}

export function getAggregationType(start: number, end: number): AnalyticsAggregation {
  const durationDays = (end - start) / dayMs;
  return durationDays > 180 ? "month" : durationDays > 60 ? "week" : "day";
}

export function formatAnalyticsDateGroup(
  date: Date,
  aggregationType: AnalyticsAggregation,
  options: { includeWeekYear?: boolean } = {}
) {
  if (aggregationType === "month") {
    return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }

  if (aggregationType === "week") {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    return `Wk ${weekNum}${options.includeWeekYear ? `, ${date.getFullYear()}` : ""}`;
  }

  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function createTimelineMap<T>(
  start: Date,
  end: Date,
  aggregationType: AnalyticsAggregation,
  createValue: () => T,
  options: { includeWeekYear?: boolean } = {}
) {
  const timelineMap: Record<string, T> = {};
  const currentDate = new Date(start.getTime());

  while (currentDate.getTime() <= end.getTime()) {
    const dateGroup = formatAnalyticsDateGroup(currentDate, aggregationType, options);
    if (!timelineMap[dateGroup]) timelineMap[dateGroup] = createValue();
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return timelineMap;
}
