import type { Doc } from "@/convex/_generated/dataModel";
import { PURGE_PIPELINE_KEYS, type PurgePipelineKey as BackendPurgePipelineKey } from "@/convex/purgeScheduleService";

export type PiiConfig = {
  enabled?: boolean;
  maskEmails?: boolean;
  maskCreditCards?: boolean;
  maskPhones?: boolean;
  maskNinos?: boolean;
};

export type SystemSettingsFormData = Partial<Doc<"systemSettings">> & {
  [key: string]: string | number | boolean | undefined;
};

/** The backend's own key type; a second copy here is how the list drifted. */
export type PurgePipelineKey = BackendPurgePipelineKey;

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

/**
 * The rows on the retention screen, in the backend's own order.
 *
 * This was a hand-copied list, and it drifted: the phone-call and mailbox
 * pipelines ran nightly at their default retention with no row here to see
 * or change them. One list, owned by the backend, is the fix; the screen's
 * only job is to give each key its words.
 */
export const purgePipelineKeys: PurgePipelineKey[] = [...PURGE_PIPELINE_KEYS];
