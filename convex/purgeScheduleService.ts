export type PurgeScheduleInterval = "Hourly" | "Daily" | "Weekly" | "Monthly";
export type PurgePipelineKey = "agentLogs" | "workflowLogs" | "userLogins" | "chatHistory" | "auditLogs";

export interface PipelineConfig {
  enabled: boolean;
  retentionDays: number;
  interval: PurgeScheduleInterval;
  hourUtc: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  nextRunTimestamp: number;
}

export const DEFAULT_PURGE_CONFIGS: Record<PurgePipelineKey, PipelineConfig> = {
  agentLogs: {
    enabled: false,
    retentionDays: 90,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  workflowLogs: {
    enabled: false,
    retentionDays: 90,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  userLogins: {
    enabled: false,
    retentionDays: 180,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  chatHistory: {
    enabled: false,
    retentionDays: 180,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  auditLogs: {
    enabled: false,
    retentionDays: 90,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
};

export const PURGE_PIPELINE_KEYS = Object.keys(DEFAULT_PURGE_CONFIGS) as PurgePipelineKey[];
export const MIN_PURGE_RETENTION_DAYS = 30;

export function parsePurgePipelineConfig(value: string | undefined) {
  if (!value) return DEFAULT_PURGE_CONFIGS;

  try {
    const parsed = JSON.parse(value) as Partial<Record<PurgePipelineKey, PipelineConfig>>;
    return { ...DEFAULT_PURGE_CONFIGS, ...parsed };
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

    if (conf.enabled) {
      conf.nextRunTimestamp = calculateNextPurgeRun(conf.interval, conf.hourUtc, conf.dayOfWeek, conf.dayOfMonth);
    } else {
      conf.nextRunTimestamp = 0;
    }
  }

  return parsed;
}

export function getPurgeRetentionDays(args: {
  configStr: string | undefined;
  pipelineKey: PurgePipelineKey;
  fallbackDays?: number;
}) {
  const fallbackDays = args.fallbackDays ?? 90;
  const config = parsePurgePipelineConfig(args.configStr);
  return config[args.pipelineKey]?.retentionDays || fallbackDays;
}

export function assertMinimumPurgeRetentionDays(retentionDays: number, context = "manual purge") {
  if (retentionDays < MIN_PURGE_RETENTION_DAYS) {
    throw new Error(`Retention policy for ${context} must be at least ${MIN_PURGE_RETENTION_DAYS} days.`);
  }
}

export function calculatePurgeCutoffTimestamp(retentionDays: number, now = Date.now()) {
  return now - retentionDays * 24 * 60 * 60 * 1000;
}

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
