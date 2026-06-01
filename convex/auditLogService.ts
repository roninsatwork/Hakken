import type { Doc } from "./_generated/dataModel";

export interface AuditPurgeConfig {
  enabled: boolean;
  retentionDays: number;
  dayOfMonth: number;
  hourOfDay: number;
  nextRunTimestamp: number;
}

export type AuditPurgeConfigUpdate = Omit<AuditPurgeConfig, "nextRunTimestamp"> & {
  nextRunTimestamp?: number;
};

export const DEFAULT_AUDIT_PURGE_CONFIG: AuditPurgeConfig = {
  enabled: false,
  retentionDays: 30,
  dayOfMonth: 1,
  hourOfDay: 2,
  nextRunTimestamp: 0,
};

export function parseAuditPurgeConfig(value: string | undefined) {
  if (!value) return DEFAULT_AUDIT_PURGE_CONFIG;
  return JSON.parse(value) as AuditPurgeConfig;
}

export function calculateNextAuditPurgeRun(dayOfMonth: number, hourOfDay: number, now = new Date()) {
  const nextRun = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth, hourOfDay, 0, 0, 0)
  );

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
  }

  return nextRun.getTime();
}

export function calculateFollowingMonthlyAuditPurgeRun(dayOfMonth: number, hourOfDay: number, now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dayOfMonth, hourOfDay, 0, 0, 0);
}

export function buildAuditPurgeConfigPayload(args: AuditPurgeConfigUpdate, now = new Date()) {
  return {
    ...args,
    nextRunTimestamp: calculateNextAuditPurgeRun(args.dayOfMonth, args.hourOfDay, now),
  };
}

export function calculateAuditPurgeCutoff(retentionDays: number, now = Date.now()) {
  return now - retentionDays * 24 * 60 * 60 * 1000;
}

export function serializeAuditPurgeConfig(config: AuditPurgeConfig) {
  return JSON.stringify(config);
}

export function withAuditLogActorName(log: Doc<"auditLogs">, actor: Doc<"users"> | null) {
  return {
    ...log,
    actorName: actor?.name || actor?.email || "Unknown Admin",
  };
}
