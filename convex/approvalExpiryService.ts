/**
 * How long a run may sit waiting for a person before the platform gives up.
 *
 * A parked approval used to wait indefinitely: the stalled-run sweeper
 * deliberately ignores `AWAITING_APPROVAL` (a run waiting on a person is not a run
 * that died) and nothing else ever looked at it. So a run held its checkpoint, its
 * `PENDING_APPROVAL` status and its place in every count for ever, having already
 * spent real tokens on work that would never finish.
 *
 * Twenty-four hours means an approval raised at the end of a working day survives
 * until the next morning. It only ever *cancels* — an unattended yes to a deletion
 * is the one outcome worse than a stuck run.
 */
import { appError } from "./utils/appError";

export const DEFAULT_APPROVAL_EXPIRY_HOURS = 24;

/**
 * The floor, so a mistyped window cannot make approvals unanswerable.
 *
 * Below an hour, a reviewer who steps away from their desk comes back to a
 * cancelled run, which teaches them the queue is not worth watching.
 */
export const MIN_APPROVAL_EXPIRY_HOURS = 1;

/** Above this there is no meaningful difference from waiting for ever. */
export const MAX_APPROVAL_EXPIRY_HOURS = 720;

export type ApprovalExpiryConfig = {
  expiryHours: number;
};

export const DEFAULT_APPROVAL_EXPIRY_CONFIG: ApprovalExpiryConfig = {
  expiryHours: DEFAULT_APPROVAL_EXPIRY_HOURS,
};

export const APPROVAL_EXPIRY_CONFIG_KEY = "APPROVAL_EXPIRY_CONFIG";

/** Anything unreadable falls back to the default rather than disabling expiry. */
export function parseApprovalExpiryConfig(value: string | undefined): ApprovalExpiryConfig {
  if (!value) return DEFAULT_APPROVAL_EXPIRY_CONFIG;

  try {
    const parsed = JSON.parse(value) as Partial<ApprovalExpiryConfig>;
    const hours = parsed?.expiryHours;
    if (typeof hours !== "number" || !Number.isFinite(hours) || hours < MIN_APPROVAL_EXPIRY_HOURS) {
      return DEFAULT_APPROVAL_EXPIRY_CONFIG;
    }
    return { expiryHours: Math.min(hours, MAX_APPROVAL_EXPIRY_HOURS) };
  } catch {
    return DEFAULT_APPROVAL_EXPIRY_CONFIG;
  }
}

/** Throws by name, the way the purge retention policy does, so the UI can say why. */
export function normalizeApprovalExpiryHoursForUpdate(expiryHours: number) {
  if (typeof expiryHours !== "number" || !Number.isFinite(expiryHours)) {
    throw appError("INVALID_INPUT", "Approval expiry must be a number of hours.");
  }
  if (expiryHours < MIN_APPROVAL_EXPIRY_HOURS) {
    throw appError("INVALID_INPUT", `Approval expiry must be at least ${MIN_APPROVAL_EXPIRY_HOURS} hour.`);
  }
  if (expiryHours > MAX_APPROVAL_EXPIRY_HOURS) {
    throw appError("INVALID_INPUT", `Approval expiry cannot exceed ${MAX_APPROVAL_EXPIRY_HOURS} hours.`);
  }
  return Math.floor(expiryHours);
}

/** A per-agent override, or undefined to follow the platform window. */
export function clampAgentApprovalExpiryHours(expiryHours: number | undefined) {
  if (typeof expiryHours !== "number" || !Number.isFinite(expiryHours) || expiryHours <= 0) {
    return undefined;
  }
  return Math.min(
    Math.max(Math.floor(expiryHours), MIN_APPROVAL_EXPIRY_HOURS),
    MAX_APPROVAL_EXPIRY_HOURS,
  );
}

/**
 * The window that applies to one approval.
 *
 * The agent's own setting wins where it has one: a daily reconciliation agent and
 * one that fires monthly do not deserve the same patience.
 */
export function resolveApprovalExpiryHours(args: {
  agentExpiryHours?: number;
  platformExpiryHours?: number;
}) {
  const agentWindow = clampAgentApprovalExpiryHours(args.agentExpiryHours);
  if (agentWindow !== undefined) return agentWindow;

  const platformWindow = args.platformExpiryHours;
  if (typeof platformWindow === "number" && Number.isFinite(platformWindow)
    && platformWindow >= MIN_APPROVAL_EXPIRY_HOURS) {
    return Math.min(Math.floor(platformWindow), MAX_APPROVAL_EXPIRY_HOURS);
  }

  return DEFAULT_APPROVAL_EXPIRY_HOURS;
}

export function isApprovalExpired(args: {
  requestedAt: number;
  now: number;
  expiryHours: number;
}) {
  return args.now - args.requestedAt >= args.expiryHours * 60 * 60 * 1000;
}

/** Said in the conversation, because unlike a rejection nobody chose this. */
export function getApprovalExpiredMessage(expiryHours: number) {
  const window = expiryHours === 1 ? "an hour" : `${expiryHours} hours`;
  return `This request waited ${window} without a decision, so the agent stopped. Nothing was sent or changed. Ask again if it is still needed.`;
}
