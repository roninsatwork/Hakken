import { ConvexError } from "convex/values";

/**
 * Structured errors that survive to production.
 *
 * A plain `throw new Error("Unauthorized")` reaches the browser intact only in
 * development. Production Convex redacts it to a generic "Server Error", so
 * every message written for a person disappears exactly where a person is
 * reading. `ConvexError` is the escape hatch: its `data` payload crosses the
 * wire untouched in both environments. Anything a user should read must
 * therefore travel as `ConvexError` data, and this helper is the one way to
 * build it.
 *
 * The payload has two halves:
 *   - `code` is a stable machine-readable key. Clients branch on it, and
 *     localisation will later key translations off it — so once shipped, a
 *     code never changes meaning.
 *   - `message` is the English sentence, exactly as it would have been thrown
 *     before. `ConvexError` serialises the payload into `error.message`, so
 *     the original text remains a substring of the message — which is what
 *     keeps every `expect(...).rejects.toThrow("Unauthorized")` assertion
 *     green across the conversion.
 *
 * The request-path and admin tiers converted on 2026-08-21 (foundation-quality
 * plan, phase 2): ~340 call sites now, with ~450 plain throws left in the
 * internal/vertical tail. `src/app-error-conversion.test.ts` holds the line —
 * every file off its shrink-only NOT_YET_CONVERTED list must stay clean.
 */

/**
 * The codes in use. Grow this union as call sites convert — never rename or
 * repurpose an existing member.
 */
export const APP_ERROR_CODES = {
  /** No signed-in caller. */
  UNAUTHENTICATED: "UNAUTHENTICATED",
  /** Signed in, but the role or tenant scope refuses this operation. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** The record the operation needs does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** The operation needs an active company and the caller has none. */
  NO_ACTIVE_COMPANY: "NO_ACTIVE_COMPANY",
  /** The capability is switched off for the caller's workspace. */
  MODULE_DISABLED: "MODULE_DISABLED",
  /** The input is malformed, missing, or violates a stated limit. */
  INVALID_INPUT: "INVALID_INPUT",
  /** The model or provider behind this feature failed; the input was fine. */
  UPSTREAM_FAILURE: "UPSTREAM_FAILURE",
  /**
   * The deployment lacks the configuration this feature needs (an env var or
   * credential an operator must set) — distinct from MODULE_DISABLED, which
   * is a deliberate per-workspace switch.
   */
  NOT_CONFIGURED: "NOT_CONFIGURED",
  /**
   * The record exists and the caller may touch it, but its current state
   * refuses this operation — an approval already answered, a run already
   * finished, a request that expired while it waited. Distinct from
   * INVALID_INPUT, where the request itself was wrong: here the same request
   * would have worked a moment earlier.
   */
  CONFLICT: "CONFLICT",
} as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];

export type AppErrorData = {
  code: AppErrorCode;
  message: string;
};

/** Build the error; the caller throws it, keeping the throw visible at the site. */
export function appError(code: AppErrorCode, message: string): ConvexError<AppErrorData> {
  return new ConvexError({ code, message });
}

/**
 * The sentence inside a caught error, for storing or logging as text.
 *
 * A ConvexError's `.message` is the serialized `{code, message}` payload (plus
 * the server envelope when it crossed a runQuery/runAction boundary), so code
 * that persists `error.message` into a table writes a JSON blob a screen later
 * renders verbatim. This unwraps the payload's own sentence first and falls
 * back to `.message` for plain errors.
 */
export function appErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data = error.data as Partial<AppErrorData> | undefined;
    if (data && typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
