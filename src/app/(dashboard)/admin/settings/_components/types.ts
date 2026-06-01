import type { Doc, Id } from "@/convex/_generated/dataModel";

export type SettingsTab = "identity" | "appearance" | "security" | "audit" | "options" | "purges";

export type PiiConfig = {
  enabled?: boolean;
  maskEmails?: boolean;
  maskCreditCards?: boolean;
  maskPhones?: boolean;
  maskNinos?: boolean;
};

export type AuditConfig = {
  enabled: boolean;
  retentionDays: number;
  dayOfMonth: number;
  hourOfDay: number;
  nextRunTimestamp?: number;
};

export type SystemSettingsFormData = Partial<Doc<"systemSettings">> & {
  [key: string]: string | number | boolean | undefined;
};

export type PurgePipelineKey = "agentLogs" | "workflowLogs" | "userLogins" | "chatHistory" | "auditLogs";

export type PurgePipelineConfig = {
  enabled?: boolean;
  retentionDays?: number;
  interval?: "Hourly" | "Daily" | "Weekly" | "Monthly";
  hourUtc?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  nextRunTimestamp?: number;
  isCustom?: boolean;
};

export type PurgeConfigMap = Record<PurgePipelineKey, PurgePipelineConfig>;

export type PurgeHistoryRow = Doc<"purgeHistory"> & {
  actorName?: string;
};

export type AuditLogRow = {
  _id: string | Id<"auditLogs">;
  actionType: string;
  actorName?: string;
  entityId?: string;
  entityType?: string;
  actorId?: Id<"users">;
  timestamp: number;
  metadata?: string;
};

export const purgePipelineKeys: PurgePipelineKey[] = ["agentLogs", "workflowLogs", "userLogins", "chatHistory", "auditLogs"];
