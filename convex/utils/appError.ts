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
 * Only the central auth layer uses this so far; the remaining ~780 plain
 * throws in convex/ convert opportunistically as files are touched.
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
