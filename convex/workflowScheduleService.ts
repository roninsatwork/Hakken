type ScheduleMode = "interval" | "daily" | "weekly" | "monthly";

type ScheduleConfig = {
  mode?: ScheduleMode;
  intervalUnit?: string;
  intervalVal?: number;
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

const SCHEDULE_MODES = new Set<ScheduleMode>(["interval", "daily", "weekly", "monthly"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isScheduleConfig(value: unknown): value is ScheduleConfig {
  if (!isRecord(value)) return false;
  if (typeof value.mode !== "undefined" && (typeof value.mode !== "string" || !SCHEDULE_MODES.has(value.mode as ScheduleMode))) {
    return false;
  }
  if (typeof value.intervalUnit !== "undefined" && typeof value.intervalUnit !== "string") return false;
  if (typeof value.intervalVal !== "undefined" && typeof value.intervalVal !== "number") return false;
  if (typeof value.time !== "undefined" && typeof value.time !== "string") return false;
  if (typeof value.dayOfWeek !== "undefined" && typeof value.dayOfWeek !== "number") return false;
  if (typeof value.dayOfMonth !== "undefined" && typeof value.dayOfMonth !== "number") return false;
  return true;
}

function intervalToMs(unit: string, value: number) {
  if (unit.startsWith("minute")) return value * 60 * 1000;
  if (unit.startsWith("hour")) return value * 60 * 60 * 1000;
  if (unit.startsWith("day")) return value * 24 * 60 * 60 * 1000;
  return 0;
}

export function parseScheduleConfig(intervalStr: string): ScheduleConfig | null {
  try {
    const parsed = JSON.parse(intervalStr) as unknown;
    return isScheduleConfig(parsed) ? parsed : null;
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
  if (intervalStr === "monthly") return 30 * 24 * 60 * 60 * 1000;

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

export function getNextWorkflowScheduleRunAt(args: {
  intervalStr: string;
  lastRunTs?: number;
  now: Date;
}) {
  const nowMs = args.now.getTime();
  const config = parseScheduleConfig(args.intervalStr);

  if (config?.mode) {
    if (config.mode === "interval") {
      const ms = intervalToMs(config.intervalUnit || "minutes", config.intervalVal || 15);
      if (ms <= 0) return undefined;
      const base = args.lastRunTs && args.lastRunTs > nowMs ? args.lastRunTs : nowMs;
      return base + ms;
    }

    const [targetH, targetM] = (config.time || "00:00").split(":").map(Number);
    const safeHour = Number.isFinite(targetH) ? targetH : 0;
    const safeMinute = Number.isFinite(targetM) ? targetM : 0;
    const targetDayOfWeek = config.dayOfWeek ?? 0;
    const targetDayOfMonth = config.dayOfMonth ?? 1;

    for (let offset = 0; offset <= 370; offset += 1) {
      const candidate = new Date(args.now);
      candidate.setUTCDate(candidate.getUTCDate() + offset);
      candidate.setUTCHours(safeHour, safeMinute, 0, 0);
      if (candidate.getTime() <= nowMs) continue;
      if (config.mode === "daily") return candidate.getTime();
      if (config.mode === "weekly" && candidate.getUTCDay() === targetDayOfWeek) return candidate.getTime();
      if (config.mode === "monthly" && candidate.getUTCDate() === targetDayOfMonth) return candidate.getTime();
    }

    return undefined;
  }

  const legacyMs = getLegacyScheduleIntervalMs(args.intervalStr);
  if (legacyMs <= 0) return undefined;
  const base = args.lastRunTs && args.lastRunTs > nowMs ? args.lastRunTs : nowMs;
  return base + legacyMs;
}
