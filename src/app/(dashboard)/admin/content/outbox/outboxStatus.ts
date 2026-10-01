import type { OutboxStatus } from "@/convex/outboxSchema";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";

/** How each outbox status reads: sent is done, waiting and claimed are on their way, failed needs a look. */
export const OUTBOX_STATUS_TONES: Record<OutboxStatus, StatusTone> = {
  WAITING: "neutral",
  CLAIMED: "info",
  SENT: "success",
  FAILED: "danger",
  SKIPPED: "warning",
};
