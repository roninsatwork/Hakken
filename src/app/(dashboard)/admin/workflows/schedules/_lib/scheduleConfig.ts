export type ScheduleTargetKind = "agent" | "workflow";
export type ScheduleBuilderMode = "recurring" | "targetedTimes";
export type ScheduleCadence = "hourly" | "daily" | "weekly" | "monthly";

export type ScheduleDraft = {
  mode: ScheduleBuilderMode;
  cadence: ScheduleCadence;
  everyHours: number;
  timeLocal: string;
  startTimeLocal: string;
  dayOfWeek: number;
  dayOfMonth: number;
  timesLocal: string[];
  timezone: string;
};

type ScheduleConfigV2 =
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

const DEFAULT_TIMEZONE = "UTC";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getSafeTimezone(timezone: unknown) {
  if (typeof timezone !== "string" || !timezone.trim()) return getBrowserTimezone();
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return getBrowserTimezone();
  }
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeTime(value: string) {
  return isValidTime(value) ? value : "09:00";
}

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
}

export function createDefaultScheduleDraft(): ScheduleDraft {
  return {
    mode: "recurring",
    cadence: "daily",
    everyHours: 4,
    timeLocal: "09:00",
    startTimeLocal: "09:00",
    dayOfWeek: 1,
    dayOfMonth: 1,
    timesLocal: [],
    timezone: getBrowserTimezone(),
  };
}

export function normalizeTimes(times: string[]) {
  return [...new Set(times.filter(isValidTime))].sort();
}

export function addTargetedTime(draft: ScheduleDraft, time: string) {
  return {
    ...draft,
    timesLocal: normalizeTimes([...draft.timesLocal, time]),
  };
}

export function removeTargetedTime(draft: ScheduleDraft, time: string) {
  return {
    ...draft,
    timesLocal: draft.timesLocal.filter((candidate) => candidate !== time),
  };
}

function hydrateLegacyJsonConfig(value: Record<string, unknown>): Partial<ScheduleDraft> | null {
  if (value.mode === "interval") {
    const intervalUnit = typeof value.intervalUnit === "string" ? value.intervalUnit : "hours";
    const intervalVal = typeof value.intervalVal === "number" ? value.intervalVal : 4;
    return {
      mode: "recurring",
      cadence: intervalUnit.startsWith("hour") ? "hourly" : "daily",
      everyHours: Math.min(Math.max(Math.floor(intervalVal), 1), 24),
      startTimeLocal: "09:00",
    };
  }

  if (value.mode === "daily") {
    return { mode: "recurring", cadence: "daily", timeLocal: normalizeTime(String(value.time ?? "09:00")) };
  }

  if (value.mode === "weekly") {
    return {
      mode: "recurring",
      cadence: "weekly",
      dayOfWeek: typeof value.dayOfWeek === "number" ? value.dayOfWeek : 1,
      timeLocal: normalizeTime(String(value.time ?? "09:00")),
    };
  }

  if (value.mode === "monthly") {
    return {
      mode: "recurring",
      cadence: "monthly",
      dayOfMonth: typeof value.dayOfMonth === "number" ? value.dayOfMonth : 1,
      timeLocal: normalizeTime(String(value.time ?? "09:00")),
    };
  }

  return null;
}

function hydrateConfigV2(value: Record<string, unknown>): Partial<ScheduleDraft> | null {
  const timezone = getSafeTimezone(value.timezone);

  if (value.kind === "targetedTimes" && Array.isArray(value.timesLocal)) {
    return {
      mode: "targetedTimes",
      timesLocal: normalizeTimes(value.timesLocal.filter((time): time is string => typeof time === "string")),
      timezone,
    };
  }

  if (value.kind !== "recurring") return null;

  if (value.cadence === "hourly") {
    return {
      mode: "recurring",
      cadence: "hourly",
      everyHours: typeof value.everyHours === "number" ? Math.min(Math.max(Math.floor(value.everyHours), 1), 24) : 4,
      startTimeLocal: normalizeTime(String(value.startTimeLocal ?? "09:00")),
      timezone,
    };
  }

  if (value.cadence === "daily") {
    return { mode: "recurring", cadence: "daily", timeLocal: normalizeTime(String(value.timeLocal ?? "09:00")), timezone };
  }

  if (value.cadence === "weekly") {
    return {
      mode: "recurring",
      cadence: "weekly",
      dayOfWeek: typeof value.dayOfWeek === "number" ? value.dayOfWeek : 1,
      timeLocal: normalizeTime(String(value.timeLocal ?? "09:00")),
      timezone,
    };
  }

  if (value.cadence === "monthly") {
    return {
      mode: "recurring",
      cadence: "monthly",
      dayOfMonth: typeof value.dayOfMonth === "number" ? value.dayOfMonth : 1,
      timeLocal: normalizeTime(String(value.timeLocal ?? "09:00")),
      timezone,
    };
  }

  return null;
}

function hydrateLegacyDisplayString(intervalStr: string): Partial<ScheduleDraft> {
  const normalized = intervalStr.toLowerCase();
  const everyHoursMatch = normalized.match(/every\s+(\d+)\s+hours?/);
  const timeMatch = intervalStr.match(/(\d{2}:\d{2})/);
  const dayMatch = DAY_NAMES.find((day) => normalized.includes(day.toLowerCase()));
  const monthDayMatch = normalized.match(/day\s+(\d+)/);

  if (everyHoursMatch?.[1]) {
    return {
      mode: "recurring",
      cadence: "hourly",
      everyHours: Number(everyHoursMatch[1]),
      startTimeLocal: timeMatch?.[1] ?? "09:00",
    };
  }

  if (normalized.includes("weekly") || dayMatch) {
    return {
      mode: "recurring",
      cadence: "weekly",
      dayOfWeek: dayMatch ? DAY_NAMES.indexOf(dayMatch) : 1,
      timeLocal: timeMatch?.[1] ?? "09:00",
    };
  }

  if (normalized.includes("monthly") || normalized.includes("on day")) {
    return {
      mode: "recurring",
      cadence: "monthly",
      dayOfMonth: monthDayMatch?.[1] ? Number(monthDayMatch[1]) : 1,
      timeLocal: timeMatch?.[1] ?? "09:00",
    };
  }

  if (normalized.includes("daily")) {
    return {
      mode: "recurring",
      cadence: "daily",
      timeLocal: timeMatch?.[1] ?? "09:00",
    };
  }

  if (normalized.includes("hourly")) {
    return {
      mode: "recurring",
      cadence: "hourly",
      everyHours: 1,
      startTimeLocal: "09:00",
    };
  }

  return {};
}

export function hydrateScheduleDraft(intervalStr?: string | null): ScheduleDraft {
  const fallback = createDefaultScheduleDraft();
  if (!intervalStr) return fallback;

  const parsed = parseJson(intervalStr);
  if (isRecord(parsed)) {
    const hydrated = parsed.version === 2 ? hydrateConfigV2(parsed) : hydrateLegacyJsonConfig(parsed);
    if (hydrated) return { ...fallback, ...hydrated };
  }

  return {
    ...fallback,
    ...hydrateLegacyDisplayString(intervalStr),
  };
}

export function buildScheduleConfig(draft: ScheduleDraft): ScheduleConfigV2 {
  const timezone = getSafeTimezone(draft.timezone);

  if (draft.mode === "targetedTimes") {
    return {
      version: 2,
      kind: "targetedTimes",
      timesLocal: normalizeTimes(draft.timesLocal),
      timezone,
    };
  }

  if (draft.cadence === "hourly") {
    return {
      version: 2,
      kind: "recurring",
      cadence: "hourly",
      everyHours: Math.min(Math.max(Math.floor(draft.everyHours), 1), 24),
      startTimeLocal: normalizeTime(draft.startTimeLocal),
      timezone,
    };
  }

  if (draft.cadence === "weekly") {
    return {
      version: 2,
      kind: "recurring",
      cadence: "weekly",
      dayOfWeek: Math.min(Math.max(Math.floor(draft.dayOfWeek), 0), 6),
      timeLocal: normalizeTime(draft.timeLocal),
      timezone,
    };
  }

  if (draft.cadence === "monthly") {
    return {
      version: 2,
      kind: "recurring",
      cadence: "monthly",
      dayOfMonth: Math.min(Math.max(Math.floor(draft.dayOfMonth), 1), 31),
      timeLocal: normalizeTime(draft.timeLocal),
      timezone,
    };
  }

  return {
    version: 2,
    kind: "recurring",
    cadence: "daily",
    timeLocal: normalizeTime(draft.timeLocal),
    timezone,
  };
}

export function serializeScheduleDraft(draft: ScheduleDraft) {
  return JSON.stringify(buildScheduleConfig(draft));
}

export function validateScheduleDraft(draft: ScheduleDraft) {
  if (draft.mode === "targetedTimes" && normalizeTimes(draft.timesLocal).length === 0) {
    return "missingTargetedTime";
  }
  return null;
}

export function formatUtcPreview(timeLocal: string) {
  const [hour, minute] = normalizeTime(timeLocal).split(":").map(Number);
  const previewDate = new Date();
  previewDate.setHours(hour, minute, 0, 0);
  return `${String(previewDate.getUTCHours()).padStart(2, "0")}:${String(previewDate.getUTCMinutes()).padStart(2, "0")}`;
}

export function getPrimaryScheduleTime(draft: ScheduleDraft) {
  return draft.cadence === "hourly" ? draft.startTimeLocal : draft.timeLocal;
}
