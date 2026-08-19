/**
 * What a run's status permits, and how the Runs screen writes its numbers.
 *
 * These rules used to live at the top of the Runs page itself, which meant the
 * row menu, the detail modal and the eval panel each trusted a function nothing
 * tested. They are pure — a status in, a tone or a yes/no out — so they belong
 * where a test can reach them without rendering a page.
 *
 * The formatters here are the *delta* family: a replay compared against its
 * source run reads as "+1.2s" or "not available", never as a bare number whose
 * sign the reader has to infer. `formatRunDuration` deliberately differs from
 * `formatDuration` in observabilityFormat.ts — a run that has not finished has
 * no duration worth a dash, so it reads "0s", and a delta never grows into
 * minutes.
 */

import type { Doc } from "@/convex/_generated/dataModel";
import type { StatusTone } from "@/src/ui/atoms/statusTone";
import { formatMoney } from "./observabilityFormat";

export type RunStatus = Doc<"agentRuns">["status"];

/** How a replay is queued: against today's configuration, or as it was. */
export type ReplayMode = "CURRENT_ACTIVE" | "SAME_VERSION";

export function formatRunDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatSignedDurationDelta(ms: number | undefined) {
  if (ms === undefined) return "not available";
  const prefix = ms > 0 ? "+" : "";
  return `${prefix}${formatRunDuration(ms)}`;
}

export function formatSignedNumberDelta(value: number | undefined) {
  if (value === undefined) return "not available";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString()}`;
}

export function formatSignedCurrencyDelta(value: number | undefined) {
  if (value === undefined) return "not available";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value)}`;
}

export function getStatusTone(status: RunStatus, continued = false): StatusTone {
  if (status === "SUCCESS") return "success";
  // A handover wears a working colour, not a failure's: the queue moved on to
  // the next run by design.
  if (status === "FAILED" && continued) return "info";
  if (status === "FAILED") return "danger";
  if (status === "CANCELLED") return "warning";
  if (status === "PENDING_APPROVAL") return "info";
  return "info";
}

export function canReplay(status: RunStatus) {
  return status === "FAILED" || status === "CANCELLED";
}

export function canCancel(status: RunStatus) {
  return status === "QUEUED" || status === "RUNNING" || status === "PENDING_APPROVAL";
}

export function canLearnFrom(status: RunStatus) {
  return status === "SUCCESS" || status === "FAILED" || status === "CANCELLED";
}

export function getSmokeEvalTone(status: RunStatus): StatusTone {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  if (status === "CANCELLED") return "warning";
  return "info";
}

export function getSmokeEvalModeLabel(mode: string) {
  return mode === "MODEL_GRADED" ? "Model graded" : "Contract";
}

export function getStepTone(status: string): StatusTone {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  if (status === "SKIPPED") return "warning";
  return "info";
}

export function getStepDiffTone(changeType: string): StatusTone {
  if (changeType === "ADDED") return "success";
  if (changeType === "REMOVED") return "danger";
  if (changeType === "CHANGED") return "warning";
  return "neutral";
}
