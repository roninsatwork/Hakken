export type PurgeScheduleInterval = "Hourly" | "Daily" | "Weekly" | "Monthly";
export type PurgePipelineKey =
  | "agentLogs"
  | "workflowLogs"
  | "userLogins"
  | "chatHistory"
  | "auditLogs"
  | "publicApiRequests"
  | "authEvents"
  | "aiActionRequests"
  | "analyticsSnapshots"
  | "webhookDeliveries"
  | "agentRunHistory"
  | "agentTransactions"
  | "phoneCalls"
  | "mailboxMessages"
  | "purgeHistory";

export interface PipelineConfig {
  enabled: boolean;
  retentionDays: number;
  interval: PurgeScheduleInterval;
  hourUtc: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  nextRunTimestamp: number;
}

const DAILY_2AM: Omit<PipelineConfig, "retentionDays"> = {
  enabled: true,
  interval: "Daily",
  hourUtc: 2,
  dayOfWeek: 0,
  dayOfMonth: 1,
  nextRunTimestamp: 0,
};

/**
 * Every pipeline ships ENABLED (owner decision, 2026-08-19, maintenance
 * plan M1.1). They used to ship disabled, which meant a fresh deployment
 * kept phone transcripts and mailbox records forever unless a human ticked
 * fourteen boxes — a privacy exposure, not just a cost. A deployment that
 * wants longer retention raises the days on the retention screen; turning a
 * pipeline off entirely is surfaced on the daily platform alert so the
 * decision stays visible. Deployments whose saved config predates the flip
 * keep their stored `enabled: false` — the merge honours it — which is
 * exactly what the alert exists to catch.
 *
 * Defaults encode what each table is for: operational logs 90 days,
 * person-linked records 180, finance/analytics history 400 so year-on-year
 * comparisons survive, rate-limit counters 30 because nothing reads them
 * past their window.
 */
export const DEFAULT_PURGE_CONFIGS: Record<PurgePipelineKey, PipelineConfig> = {
  agentLogs: { ...DAILY_2AM, retentionDays: 90 },
  workflowLogs: { ...DAILY_2AM, retentionDays: 90 },
  userLogins: { ...DAILY_2AM, retentionDays: 180 },
  chatHistory: { ...DAILY_2AM, retentionDays: 180 },
  auditLogs: { ...DAILY_2AM, retentionDays: 90 },
  publicApiRequests: { ...DAILY_2AM, retentionDays: 90 },
  authEvents: { ...DAILY_2AM, retentionDays: 180 },
  aiActionRequests: { ...DAILY_2AM, retentionDays: 30 },
  analyticsSnapshots: { ...DAILY_2AM, retentionDays: 400 },
  webhookDeliveries: { ...DAILY_2AM, retentionDays: 90 },
  agentRunHistory: { ...DAILY_2AM, retentionDays: 180 },
  agentTransactions: { ...DAILY_2AM, retentionDays: 400 },
  // Transcripts of calls from members of the public, holding their phone
  // numbers. Kept shorter than most: it is the most personal data on the
  // platform and the least useful once the follow-up task has been done.
  phoneCalls: { ...DAILY_2AM, retentionDays: 90 },
  // The mailbox watcher's ledger: sender addresses and subjects, so it gets
  // the same short window as the phone records it mirrors. The mail itself
  // lives in Gmail under Gmail's own retention, untouched by this.
  mailboxMessages: { ...DAILY_2AM, retentionDays: 90 },
  // Cleans only the purge system's own log, which the hourly dispatcher
  // grows even when everything else is off. The newest 200 entries are
  // always kept regardless of retention.
  purgeHistory: { ...DAILY_2AM, retentionDays: 365 },
};

export const PURGE_PIPELINE_KEYS = Object.keys(DEFAULT_PURGE_CONFIGS) as PurgePipelineKey[];
export const MIN_PURGE_RETENTION_DAYS = 30;

/**
 * The pipelines a stored config has switched off. Fed to the system health
 * report so a deployment that never prunes personal data says so on the
 * daily alert instead of staying silent (maintenance plan M1.1).
 */
export function listDisabledPurgePipelines(configStr: string | undefined): PurgePipelineKey[] {
  const configs = parsePurgePipelineConfig(configStr);
  return PURGE_PIPELINE_KEYS.filter((key) => !configs[key].enabled);
}

const VALID_INTERVALS: PurgeScheduleInterval[] = ["Hourly", "Daily", "Weekly", "Monthly"];

function isValidInterval(value: unknown): value is PurgeScheduleInterval {
  return typeof value === "string" && (VALID_INTERVALS as string[]).includes(value);
}

function isIntInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Merged DEEP per pipeline: a stored object that carries only some fields
 * keeps the defaults for the rest. The old shallow spread replaced the whole
 * pipeline object, so a partial row lost its `interval` — and a missing
 * interval used to fall through `calculateNextPurgeRun` into an
 * always-in-the-past timestamp, firing a full purge every hour while the
 * screen showed "Daily".
 */
export function parsePurgePipelineConfig(value: string | undefined) {
  if (!value) return DEFAULT_PURGE_CONFIGS;

  try {
    const parsed = JSON.parse(value) as Partial<Record<PurgePipelineKey, Partial<PipelineConfig>>>;
    const merged = {} as Record<PurgePipelineKey, PipelineConfig>;
    for (const key of PURGE_PIPELINE_KEYS) {
      merged[key] = { ...DEFAULT_PURGE_CONFIGS[key], ...(parsed[key] ?? {}) };
      if (!isValidInterval(merged[key].interval)) merged[key].interval = DEFAULT_PURGE_CONFIGS[key].interval;
      if (!isIntInRange(merged[key].hourUtc, 0, 23)) merged[key].hourUtc = DEFAULT_PURGE_CONFIGS[key].hourUtc;
    }
    return merged;
  } catch {
    return DEFAULT_PURGE_CONFIGS;
  }
}

export function normalizePurgePipelineConfigForUpdate(configStr: string) {
  let parsed: Partial<Record<PurgePipelineKey, PipelineConfig>>;
  try {
    parsed = JSON.parse(configStr) as Partial<Record<PurgePipelineKey, PipelineConfig>>;
  } catch {
    throw new Error("Invalid configuration JSON payload");
  }

  for (const key of PURGE_PIPELINE_KEYS) {
    const conf = parsed[key];
    if (!conf) continue;

    if (typeof conf.retentionDays !== "number" || conf.retentionDays < MIN_PURGE_RETENTION_DAYS) {
      throw new Error(`Retention policy for category '${key}' must be at least ${MIN_PURGE_RETENTION_DAYS} days.`);
    }
    // The scheduler trusts these; unvalidated they could produce an hourly
    // hot loop (bad interval) or a month-skipping run (dayOfMonth 29-31).
    // Missing fields fill from the defaults; PRESENT-but-invalid values are
    // refused — a typo must not become a schedule.
    if (conf.interval === undefined) {
      conf.interval = DEFAULT_PURGE_CONFIGS[key].interval;
    } else if (!isValidInterval(conf.interval)) {
      throw new Error(`Execution interval for category '${key}' must be one of ${VALID_INTERVALS.join(", ")}.`);
    }
    if (conf.hourUtc === undefined) {
      conf.hourUtc = DEFAULT_PURGE_CONFIGS[key].hourUtc;
    } else if (!isIntInRange(conf.hourUtc, 0, 23)) {
      throw new Error(`Execution hour for category '${key}' must be an integer between 0 and 23.`);
    }
    if (conf.dayOfWeek !== undefined && !isIntInRange(conf.dayOfWeek, 0, 6)) {
      throw new Error(`Execution day of week for category '${key}' must be an integer between 0 and 6.`);
    }
    if (conf.dayOfMonth !== undefined && !isIntInRange(conf.dayOfMonth, 1, 28)) {
      throw new Error(`Execution day of month for category '${key}' must be between the 1st and the 28th.`);
    }

    // The saved config carries its own next firing time: computed here for
    // an enabled pipeline, zeroed for a disabled one (the dispatcher also
    // initialises 0 on first pass, so both paths agree).
    conf.nextRunTimestamp = conf.enabled
      ? calculateNextPurgeRun(conf.interval, conf.hourUtc, conf.dayOfWeek, conf.dayOfMonth)
      : 0;
  }

  return parsed;
}

export function getPurgeRetentionDays(args: {
  configStr: string | undefined;
  pipelineKey: PurgePipelineKey;
  fallbackDays?: number;
}) {
  const configs = parsePurgePipelineConfig(args.configStr);
  const stored = configs[args.pipelineKey].retentionDays;
  if (typeof stored === "number" && stored > 0) return stored;
  return args.fallbackDays ?? DEFAULT_PURGE_CONFIGS[args.pipelineKey].retentionDays;
}

export function assertMinimumPurgeRetentionDays(retentionDays: number, context: string) {
  if (retentionDays < MIN_PURGE_RETENTION_DAYS) {
    throw new Error(
      `Refusing ${context}: retention of ${retentionDays} days is below the ${MIN_PURGE_RETENTION_DAYS}-day minimum.`,
    );
  }
}

export function calculatePurgeCutoffTimestamp(retentionDays: number, now = Date.now()) {
  return now - retentionDays * 24 * 60 * 60 * 1000;
}

/**
 * The next strictly-future run instant for a schedule. All UTC arithmetic —
 * no DST involvement. Unknown intervals fall back to "tomorrow at hourUtc"
 * rather than falling through: the old missing-default returned the top of
 * the current hour, which is always in the past, and a full purge fired
 * every hour forever.
 */
export function calculateNextPurgeRun(
  interval: PurgeScheduleInterval,
  hourUtc: number,
  dayOfWeek?: number,
  dayOfMonth?: number,
  now = new Date(),
): number {
  const hour = isIntInRange(hourUtc, 0, 23) ? hourUtc : 2;

  if (interval === "Hourly") {
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next.getTime();
  }

  if (interval === "Weekly") {
    const targetDay = isIntInRange(dayOfWeek, 0, 6) ? (dayOfWeek as number) : 0;
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(hour);
    let daysToAdd = (targetDay - next.getUTCDay() + 7) % 7;
    if (daysToAdd === 0 && next.getTime() <= now.getTime()) {
      daysToAdd = 7;
    }
    next.setUTCDate(next.getUTCDate() + daysToAdd);
    return next.getTime();
  }

  if (interval === "Monthly") {
    // Clamped to 1..28 so setUTCDate can never overflow into the following
    // month (day 31 in a 30-day month would otherwise skip a month).
    const targetDate = Math.min(Math.max(isIntInRange(dayOfMonth, 1, 31) ? (dayOfMonth as number) : 1, 1), 28);
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(hour);
    next.setUTCDate(targetDate);
    if (next.getTime() <= now.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(targetDate);
    }
    return next.getTime();
  }

  // Daily, and the fallback for anything unrecognised.
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hour);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime();
}
