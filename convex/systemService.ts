import type { Id } from "./_generated/dataModel";
import { getAssistantSafetyWarnings } from "./aiSafetyPolicy";
import { appError } from "./utils/appError";
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

const PII_SWITCHES = [
  "enabled",
  "maskEmails",
  "maskCreditCards",
  "maskPhones",
  "maskNinos",
] as const satisfies ReadonlyArray<keyof PiiConfig>;

/**
 * The masking switches as they are read back, filling anything absent.
 *
 * A missing switch used to arrive as `undefined`, and `redactPII` reads each
 * one as a plain truthiness test — so a switch that had gone missing behaved
 * exactly like one somebody had turned off, and the screen drew it off, which
 * reads as a decision rather than a gap. Absent now means the default, and the
 * default for four of the five is on.
 *
 * The write below refuses an incomplete config outright. This is the other
 * half: settings stored before that refusal existed still have to resolve to
 * something, and silently-off is the one answer they must not resolve to.
 */
export function parseSystemPiiConfig(value: string | undefined): PiiConfig {
  if (!value) return { ...DEFAULT_SYSTEM_PII_CONFIG };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ...DEFAULT_SYSTEM_PII_CONFIG };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SYSTEM_PII_CONFIG };

  const stored = parsed as Partial<Record<keyof PiiConfig, unknown>>;
  const resolved = { ...DEFAULT_SYSTEM_PII_CONFIG };
  for (const key of PII_SWITCHES) {
    if (typeof stored[key] === "boolean") resolved[key] = stored[key];
  }
  return resolved;
}

/**
 * What is allowed to be written to the masking switches.
 *
 * Modelled on `normalizePurgePipelineConfigForUpdate`, which the retention
 * screen has always used: bad JSON is refused, a switch that is present but is
 * not a switch is refused, and anything the config does not recognise is
 * dropped rather than stored. What comes back is exactly five booleans, so what
 * is written down is always a complete answer.
 */
export function normalizeSystemPiiConfigForUpdate(configStr: string): PiiConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configStr);
  } catch {
    throw appError("INVALID_INPUT", "Masking settings must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw appError("INVALID_INPUT", "Masking settings must be an object of switches.");
  }

  const stored = parsed as Partial<Record<keyof PiiConfig, unknown>>;
  const resolved = { ...DEFAULT_SYSTEM_PII_CONFIG };
  for (const key of PII_SWITCHES) {
    const value = stored[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      throw appError("INVALID_INPUT", `Masking switch '${key}' must be on or off.`);
    }
    resolved[key] = value;
  }
  return resolved;
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
  const safetyWarnings = getAssistantSafetyWarnings(prompt).map((warning) => warning.category);

  return JSON.stringify({
    promptLength: prompt.length,
    ...(safetyWarnings.length > 0 ? { safetyWarnings } : {}),
  });
}

export function buildAnalyticsIdAuditMetadata(trackingId: string) {
  return JSON.stringify({ newTrackingId: trimAnalyticsTrackingId(trackingId) });
}
