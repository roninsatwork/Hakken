/**
 * Every kind of thing that can happen on the way in, in the order the
 * diagnostics screen offers them.
 *
 * One list, because there were three: the schema's union, a type beside the
 * mutations, and a hand-kept copy in the diagnostics filter — which had already
 * drifted, missing every one of the typed-code events. A filter that cannot
 * name an event is a filter that hides it, which is the opposite of what a
 * sign-in trail is for.
 *
 * Kept free of imports so a client screen can read it without pulling the
 * server in behind it.
 */
export const AUTH_EVENT_TYPES = [
  "MAGIC_LINK_REQUESTED",
  "MAGIC_LINK_THROTTLED",
  "MAGIC_LINK_STARTED",
  "AUTH_EMAIL_SEND_RESERVED",
  "INVITE_FOUND",
  "INVITE_MISSING",
  "INVITE_EXPIRED",
  "INVITE_REVOKED",
  "INVITE_STALE_ACCEPTED_RECOVERED",
  "USER_FOUND",
  "EMAIL_DISPATCH_SIMULATED",
  "EMAIL_DISPATCH_STARTED",
  "EMAIL_DISPATCH_FAILED",
  "MAGIC_LINK_VERIFIED",
  "OAUTH_VERIFIED",
  "ONE_TIME_CODE_REQUESTED",
  "ONE_TIME_CODE_THROTTLED",
  "ONE_TIME_CODE_VERIFIED",
  "ONE_TIME_CODE_FAILED",
] as const;

export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];
