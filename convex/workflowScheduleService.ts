import { isRecord } from "./utils/lang";
type LegacyScheduleMode = "interval" | "daily" | "weekly" | "monthly";

type LegacyScheduleConfig = {
  mode?: LegacyScheduleMode;
  intervalUnit?: string;
  intervalVal?: number;
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

export type ScheduleConfigV2 =
  | {
      version: 2;
      kind: "recurring";
      cadence: "hourly";
      everyHours: number;
      startTimeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "recurring";
      cadence: "daily";
      timeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "recurring";
      cadence: "weekly";
      dayOfWeek: number;
      timeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "recurring";
      cadence: "monthly";
      dayOfMonth: number;
      timeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "targetedTimes";
      timesLocal: string[];
      timezone: string;
    };

type ScheduleConfig = LegacyScheduleConfig | ScheduleConfigV2;
type LocalDateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const LEGACY_SCHEDULE_MODES = new Set<LegacyScheduleMode>(["interval", "daily", "weekly", "monthly"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = "UTC";


function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isSafeTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function isLegacyScheduleConfig(value: unknown): value is LegacyScheduleConfig {
  if (!isRecord(value)) return false;
  if (typeof value.mode !== "string" || !LEGACY_SCHEDULE_MODES.has(value.mode as LegacyScheduleMode)) {
    return false;
  }
  if (typeof value.intervalUnit !== "undefined" && typeof value.intervalUnit !== "string") return false;
  if (typeof value.intervalVal !== "undefined" && typeof value.intervalVal !== "number") return false;
  if (typeof value.time !== "undefined" && typeof value.time !== "string") return false;
  if (typeof value.dayOfWeek !== "undefined" && typeof value.dayOfWeek !== "number") return false;
  if (typeof value.dayOfMonth !== "undefined" && typeof value.dayOfMonth !== "number") return false;
  return true;
}

function isScheduleConfigV2(value: unknown): value is ScheduleConfigV2 {
  if (!isRecord(value) || value.version !== 2) return false;
  if (!isSafeTimezone(value.timezone)) return false;

  if (value.kind === "targetedTimes") {
    return Array.isArray(value.timesLocal) &&
      value.timesLocal.length > 0 &&
      value.timesLocal.length <= 24 &&
      value.timesLocal.every(isValidTime);
  }

  if (value.kind !== "recurring" || typeof value.cadence !== "string") return false;

  if (value.cadence === "hourly") {
    return typeof value.everyHours === "number" &&
      Number.isInteger(value.everyHours) &&
      value.everyHours >= 1 &&
      value.everyHours <= 24 &&
      isValidTime(value.startTimeLocal);
  }

  if (value.cadence === "daily") return isValidTime(value.timeLocal);

  if (value.cadence === "weekly") {
    return typeof value.dayOfWeek === "number" &&
      Number.isInteger(value.dayOfWeek) &&
      value.dayOfWeek >= 0 &&
      value.dayOfWeek <= 6 &&
      isValidTime(value.timeLocal);
  }

  if (value.cadence === "monthly") {
    return typeof value.dayOfMonth === "number" &&
      Number.isInteger(value.dayOfMonth) &&
      value.dayOfMonth >= 1 &&
      value.dayOfMonth <= 31 &&
      isValidTime(value.timeLocal);
  }

  return false;
}

function intervalToMs(unit: string, value: number) {
  if (unit.startsWith("minute")) return value * 60 * 1000;
  if (unit.startsWith("hour")) return value * 60 * 60 * 1000;
  if (unit.startsWith("day")) return value * DAY_MS;
  return 0;
}

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function getTimeZoneParts(date: Date, timezone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const rawHour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  const localAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtcMs - date.getTime();
}

function localDateTimeToUtcMs(args: {
  day: number;
  hour: number;
  minute: number;
  month: number;
  timezone: string;
  year: number;
}) {
  const localAsUtcMs = Date.UTC(args.year, args.month - 1, args.day, args.hour, args.minute, 0, 0);
  let utcMs = localAsUtcMs - getTimeZoneOffsetMs(new Date(localAsUtcMs), args.timezone);

  for (let i = 0; i < 3; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), args.timezone);
    const nextUtcMs = localAsUtcMs - offsetMs;
    if (Math.abs(nextUtcMs - utcMs) < 1000) return nextUtcMs;
    utcMs = nextUtcMs;
  }

  return utcMs;
}

function addDaysToLocalDate(parts: LocalDateParts, offsetDays: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getLocalDayOfWeek(args: { day: number; month: number; year: number }) {
  return new Date(Date.UTC(args.year, args.month - 1, args.day)).getUTCDay();
}

function getCandidateTimesForLocalDate(config: ScheduleConfigV2, date: { day: number; month: number; year: number }) {
  if (config.kind === "targetedTimes") {
    return [...new Set(config.timesLocal)].sort();
  }

  if (config.cadence === "hourly") {
    const { hour, minute } = parseTime(config.startTimeLocal);
    const times = [];
    for (let currentHour = hour; currentHour < 24; currentHour += config.everyHours) {
      times.push(`${String(currentHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
    return times;
  }

  if (config.cadence === "daily") return [config.timeLocal];
  if (config.cadence === "weekly" && getLocalDayOfWeek(date) === config.dayOfWeek) return [config.timeLocal];
  if (config.cadence === "monthly" && date.day === config.dayOfMonth) return [config.timeLocal];
  return [];
}

function getNextV2RunAt(config: ScheduleConfigV2, now: Date) {
  const nowMs = now.getTime();
  const localToday = getTimeZoneParts(now, config.timezone || DEFAULT_TIMEZONE);

  for (let offset = 0; offset <= 370; offset += 1) {
    const localDate = addDaysToLocalDate(localToday, offset);
    const candidateTimes = getCandidateTimesForLocalDate(config, localDate);
    for (const time of candidateTimes) {
      const { hour, minute } = parseTime(time);
      const candidateMs = localDateTimeToUtcMs({ ...localDate, hour, minute, timezone: config.timezone });
      if (candidateMs > nowMs) return candidateMs;
    }
  }

  return undefined;
}

function getMostRecentV2RunAt(config: ScheduleConfigV2, now: Date) {
  const nowMs = now.getTime();
  const localToday = getTimeZoneParts(now, config.timezone || DEFAULT_TIMEZONE);

  for (let offset = 0; offset <= 370; offset += 1) {
    const localDate = addDaysToLocalDate(localToday, -offset);
    const candidateTimes = getCandidateTimesForLocalDate(config, localDate).reverse();
    for (const time of candidateTimes) {
      const { hour, minute } = parseTime(time);
      const candidateMs = localDateTimeToUtcMs({ ...localDate, hour, minute, timezone: config.timezone });
      if (candidateMs <= nowMs) return candidateMs;
    }
  }

  return undefined;
}

export function parseScheduleConfig(intervalStr: string): ScheduleConfig | null {
  try {
    const parsed = JSON.parse(intervalStr) as unknown;
    if (isScheduleConfigV2(parsed)) return parsed;
    return isLegacyScheduleConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getLegacyScheduleIntervalMs(intervalStr: string) {
  const normalized = intervalStr.trim().toLowerCase();
  const everyHoursMatch = normalized.match(/^every\s+(\d+)\s+hours?/);
  if (everyHoursMatch?.[1]) return intervalToMs("hours", Number(everyHoursMatch[1]));

  const parts = normalized.split(" ");
  if (parts.length === 2) {
    const value = parseInt(parts[0]);
    const unit = parts[1].toLowerCase();
    return intervalToMs(unit, value);
  }

  if (normalized.startsWith("daily")) return DAY_MS;
  if (normalized === "hourly") return 60 * 60 * 1000;
  if (normalized.startsWith("weekly") || normalized.startsWith("every ")) return 7 * DAY_MS;
  if (normalized.startsWith("monthly") || normalized.startsWith("on day")) return 30 * DAY_MS;

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

  if (config && "version" in config && config.version === 2) {
    const latestRunAt = getMostRecentV2RunAt(config, args.now);
    return typeof latestRunAt === "number" && latestRunAt <= nowMs && latestRunAt > lastRunTs;
  }

  if (config && "mode" in config && config.mode) {
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

  if (config && "version" in config && config.version === 2) {
    return getNextV2RunAt(config, args.now);
  }

  if (config && "mode" in config && config.mode) {
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
