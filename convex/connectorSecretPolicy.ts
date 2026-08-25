/**
 * What a connector is allowed to store in place of a credential.
 *
 * Connectors never hold secrets. They hold *references* — a pointer into a
 * vault — so that the platform's database is not a place where leaking one row
 * leaks a customer's Slack token. These guards are what keep that true, because
 * the natural mistake for an administrator in a hurry is to paste the token
 * itself into a field labelled "token reference".
 *
 * Kept out of `aiTools.ts` deliberately. The OAuth flow that used to call the
 * second of these is currently unavailable (see `isConnectorOAuthAvailable`),
 * and a security guard that only runs inside a disabled feature is a guard
 * nobody notices breaking. Here they can be tested directly and stay honest
 * until the flow returns.
 */

import { appError } from "./utils/appError";

/** Shapes that betray a real secret rather than a reference to one. */
const RAW_SECRET_PREFIXES = /^(sk-|xox[baprs]-|ghp_|ya29\.|-----BEGIN)/i;

const SECRET_REF_PATTERN = /^[A-Za-z0-9_.:/-]{2,128}$/;
const REFERENCE_VALUE_PATTERN = /^[A-Za-z0-9_.:/-]{2,160}$/;

export function assertSafeSecretRefs(secretRefs: string[]) {
  for (const secretRef of secretRefs) {
    if (!SECRET_REF_PATTERN.test(secretRef)) {
      throw appError("INVALID_INPUT", "Connector secret references must be opaque reference keys, not raw secret values.");
    }

    if (RAW_SECRET_PREFIXES.test(secretRef)) {
      throw appError("INVALID_INPUT", "Connector secret references must not contain raw secret values.");
    }
  }
}

export function assertSafeReferenceValue(value: string, label: string) {
  if (!REFERENCE_VALUE_PATTERN.test(value)) {
    throw appError("INVALID_INPUT", `${label} must be an opaque reference key.`);
  }

  if (RAW_SECRET_PREFIXES.test(value)) {
    throw appError("INVALID_INPUT", `${label} must not contain a raw secret value.`);
  }
}
