import type { Id } from "./_generated/dataModel";
import type { PiiConfig } from "./utils/pii";

export const SYSTEM_PROMPT_CONFIG_KEY = "SYSTEM_PROMPT";
export const GOOGLE_ANALYTICS_CONFIG_KEY = "GOOGLE_ANALYTICS_ID";
export const PII_REDACTION_CONFIG_KEY = "PII_REDACTION_CONFIG";

export const DEFAULT_SYSTEM_PII_CONFIG: PiiConfig = {
  enabled: false,
  maskEmails: true,
  maskCreditCards: true,
  maskPhones: false,
  maskNinos: true,
};

export function trimAnalyticsTrackingId(trackingId: string) {
  return trackingId.trim();
}

export function parseSystemPiiConfig(value: string | undefined) {
  if (!value) return DEFAULT_SYSTEM_PII_CONFIG;
  return JSON.parse(value) as PiiConfig;
}

export function buildSystemConfigWrite(args: {
  key: string;
  value: string;
  userId: Id<"users">;
  now?: number;
}) {
  return {
    key: args.key,
    value: args.value,
    updatedAt: args.now ?? Date.now(),
    updatedBy: args.userId,
  };
}

export function buildSystemConfigPatch(args: {
  value: string;
  userId: Id<"users">;
  now?: number;
}) {
  return {
    value: args.value,
    updatedAt: args.now ?? Date.now(),
    updatedBy: args.userId,
  };
}

export function buildSystemPromptAuditMetadata(prompt: string) {
  return JSON.stringify({ promptLength: prompt.length });
}

export function buildAnalyticsIdAuditMetadata(trackingId: string) {
  return JSON.stringify({ newTrackingId: trimAnalyticsTrackingId(trackingId) });
}
