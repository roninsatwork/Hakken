/**
 * The four status tones the app renders constantly, as theme-token classes.
 *
 * Before this existed, eighteen separate `getStatusColor`-style helpers across
 * fifteen files re-derived the same mapping with hardcoded palette classes —
 * splitting the same FAILED state between `red` and `rose` depending on the
 * file, and leaving the Success/Error pickers on the Aesthetics screen with
 * nothing to control. Every class here goes through `@theme` tokens
 * (globals.css), so the Aesthetics screen's Status Colours actually work.
 */

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** The standard pill recipe per tone: text + tinted background + border. */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  success: "text-success bg-success/10 border-success/20",
  warning: "text-warning bg-warning/10 border-warning/20",
  danger: "text-destructive bg-destructive/10 border-destructive/20",
  info: "text-info bg-info/10 border-info/20",
  neutral: "text-secondary bg-foreground/5 border-border-dim",
};

/** Text-only variant, for inline status words that are not pills. */
export const STATUS_TONE_TEXT_CLASSES: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  neutral: "text-secondary",
};

const TONE_BY_STATUS: Record<string, StatusTone> = {
  // Finished well
  SUCCESS: "success",
  COMPLETED: "success",
  PASSED: "success",
  PASS: "success",
  APPROVED: "success",
  APPLIED: "success",
  ACTIVE: "success",
  READY: "success",
  HEALTHY: "success",
  CONNECTED: "success",
  LOW: "success",
  DONE: "success",
  // Finished badly
  FAILED: "danger",
  FAIL: "danger",
  ERROR: "danger",
  REJECTED: "danger",
  EXPIRED: "danger",
  BLOCKED: "danger",
  HIGH: "danger",
  CRITICAL: "danger",
  // Waiting on something or worth a look
  PENDING: "warning",
  PROCESSING: "warning",
  PENDING_APPROVAL: "warning",
  AWAITING_APPROVAL: "warning",
  PROPOSED: "warning",
  REVIEW: "warning",
  PAUSED: "warning",
  STALE: "warning",
  DEGRADED: "warning",
  MEDIUM: "warning",
  // A collection stopped at a limit: it kept what it had, and wants a look.
  CAPPED_PLAN: "warning",
  CAPPED_SPEND: "warning",
  // In motion
  RUNNING: "info",
  IN_PROGRESS: "info",
  QUEUED: "info",
  STREAMING: "info",
  // A collection on its way: its list being written, sent, or awaiting answers.
  EXPANDING: "info",
  SENDING: "info",
  COLLECTING: "info",
  // Stopped without verdict
  CANCELLED: "neutral",
  SKIPPED: "neutral",
  DISABLED: "neutral",
  ARCHIVED: "neutral",
  DISMISSED: "neutral",
};

/**
 * The tone for a status string, case-insensitive. Unknown statuses are
 * neutral: an unstyled state must never masquerade as good or bad news.
 */
export function toneForStatus(status: string | undefined | null): StatusTone {
  if (!status) return "neutral";
  return TONE_BY_STATUS[status.trim().toUpperCase()] ?? "neutral";
}
