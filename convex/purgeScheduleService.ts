export type PurgeScheduleInterval = "Hourly" | "Daily" | "Weekly" | "Monthly";

export function calculateNextPurgeRun(
  interval: PurgeScheduleInterval,
  hourUtc: number,
  dayOfWeek?: number,
  dayOfMonth?: number,
  now = new Date()
): number {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0,
      0,
      0
    )
  );

  if (interval === "Hourly") {
    next.setUTCHours(next.getUTCHours() + 1);
  } else if (interval === "Daily") {
    next.setUTCHours(hourUtc);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  } else if (interval === "Weekly") {
    next.setUTCHours(hourUtc);
    const targetDay = dayOfWeek !== undefined ? dayOfWeek : 0;
    const currentDay = next.getUTCDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) {
      daysToAdd += 7;
    } else if (daysToAdd === 0 && next.getTime() <= now.getTime()) {
      daysToAdd = 7;
    }
    next.setUTCDate(next.getUTCDate() + daysToAdd);
  } else if (interval === "Monthly") {
    next.setUTCHours(hourUtc);
    const targetDate = dayOfMonth !== undefined ? dayOfMonth : 1;
    next.setUTCDate(targetDate);
    if (next.getTime() <= now.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(targetDate);
    }
  }

  return next.getTime();
}
