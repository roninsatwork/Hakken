type ScheduleConfig = {
  mode?: "interval" | "daily" | "weekly" | "monthly";
  intervalUnit?: string;
  intervalVal?: number;
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

function intervalToMs(unit: string, value: number) {
  if (unit.startsWith("minute")) return value * 60 * 1000;
  if (unit.startsWith("hour")) return value * 60 * 60 * 1000;
  if (unit.startsWith("day")) return value * 24 * 60 * 60 * 1000;
  return 0;
}

export function parseScheduleConfig(intervalStr: string): ScheduleConfig | null {
  try {
    return JSON.parse(intervalStr) as ScheduleConfig;
  } catch {
    return null;
  }
}

export function getLegacyScheduleIntervalMs(intervalStr: string) {
  const parts = intervalStr.split(" ");
  if (parts.length === 2) {
    const value = parseInt(parts[0]);
    const unit = parts[1].toLowerCase();
    return intervalToMs(unit, value);
  }

  if (intervalStr === "daily") return 24 * 60 * 60 * 1000;
  if (intervalStr === "hourly") return 60 * 60 * 1000;
  if (intervalStr === "weekly") return 7 * 24 * 60 * 60 * 1000;

  return 0;
}

export function shouldRunWorkflowSchedule(args: {
  intervalStr: string;
  lastRunTs?: number;
  now: Date;
}) {
  const nowMs = args.now.getTime();
  const lastRunTs = args.lastRunTs || 0;
  const config = parseScheduleConfig(args.intervalStr);

  if (config?.mode) {
    if (config.mode === "interval") {
      const ms = intervalToMs(config.intervalUnit || "minutes", config.intervalVal || 15);
      return ms > 0 && nowMs - lastRunTs >= ms;
    }

    const [targetH, targetM] = (config.time || "00:00").split(":").map(Number);
    const targetToday = new Date(args.now);
    targetToday.setUTCHours(targetH, targetM, 0, 0);
    const targetMs = targetToday.getTime();

    if (nowMs < targetMs || lastRunTs >= targetMs) return false;
    if (config.mode === "daily") return true;
    if (config.mode === "weekly") return args.now.getUTCDay() === (config.dayOfWeek || 0);
    if (config.mode === "monthly") return args.now.getUTCDate() === (config.dayOfMonth || 1);
    return false;
  }

  const legacyMs = getLegacyScheduleIntervalMs(args.intervalStr);
  return legacyMs > 0 && nowMs - lastRunTs >= legacyMs;
}
