import { v } from "convex/values";

import { publicMutation } from "./tenantFunctions";
import { logAuthEvent } from "./authEvents";
import { isWithinRequestLimit, normaliseEmail, REQUEST_WINDOW_MS } from "./oneTimeCodeService";
import {
  SIGN_IN_MAX_REQUESTS_PER_HOUR,
  SIGN_IN_REQUEST_WINDOW_MS,
  isWithinHourlySignInLimit,
} from "./signInThrottleService";

/**
 * The record behind sign-in codes: who asked, how often, and whether they got
 * in.
 *
 * Nobody is signed in when any of this happens, so the throttle counts by
 * address. Without it the sign-in form is a way to post mail at someone
 * repeatedly, and the person on the other end has not consented to any of it.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const REQUEST_SCAN_LIMIT = 50;

/**
 * Records a request, and says whether the code should actually be sent.
 *
 * Returns `false` rather than throwing when the address has asked too often.
 * A refusal that reaches the screen would tell an unauthenticated caller
 * something about the address, and the throttle is there to protect the person
 * receiving the mail rather than to inform the person sending it.
 */
export const requestCode = publicMutation({
  reason: "Called before sign-in, which by definition happens before anyone is authenticated. Records the request and refuses when an address has asked too often.",
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const email = normaliseEmail(args.email);
    const now = Date.now();

    if (!email) return false;

    /*
     * Two limits, not one. The short window stops a burst — five codes in a
     * quarter of an hour is already more than anyone signing in needs — and the
     * hourly cap stops a patient run that stays under it all afternoon. Read
     * over the hour once, because the shorter window is a slice of the longer.
     */
    const recentRequests = await ctx.db
      .query("authEvents")
      .withIndex("by_email", (q) =>
        q.eq("email", email).gt("timestamp", now - SIGN_IN_REQUEST_WINDOW_MS)
      )
      .order("desc")
      .filter((q) => q.eq(q.field("eventType"), "ONE_TIME_CODE_REQUESTED"))
      .take(SIGN_IN_MAX_REQUESTS_PER_HOUR);

    const requestTimes = recentRequests.map((event) => event.timestamp);

    if (!isWithinRequestLimit(requestTimes, now) || !isWithinHourlySignInLimit(requestTimes, now)) {
      await logAuthEvent(ctx, {
        email,
        eventType: "ONE_TIME_CODE_THROTTLED",
        timestamp: now,
        provider: "one-time-code",
        reasonCode: "too_many_requests",
      });
      return false;
    }

    await logAuthEvent(ctx, {
      email,
      eventType: "ONE_TIME_CODE_REQUESTED",
      timestamp: now,
      provider: "one-time-code",
      reasonCode: "public_login_attempt",
    });

    return true;
  },
});

/**
 * A code that did not work.
 *
 * Only successful sign-ins reached the audit trail, and only for administrators
 * — so a run of attempts against an account, which is the first thing anybody
 * reviewing a platform asks to see, left nothing behind at all.
 *
 * Recorded for every address, whether or not an account exists behind it. An
 * attempt against an account that does not exist is a fact worth having; it is
 * what a search for one looks like.
 *
 * Two things this deliberately does not do. It does not say whether the address
 * exists — the caller is not signed in, and an answer either way is a way to
 * find out who has an account here. And past the throttle it stops writing to
 * the audit trail while carrying on writing to the auth trail: this mutation is
 * reachable by anybody, and an unauthenticated caller who can write unbounded
 * rows into the audit trail can bury everything else in it.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
export const recordFailed = publicMutation({
  reason:
    "Called from the sign-in screen when a code is refused, which by definition happens before anyone is authenticated. Records the attempt and never reveals whether the address exists.",
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = normaliseEmail(args.email);
    if (!email) return;

    const now = Date.now();

    const recent = await ctx.db
      .query("authEvents")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(REQUEST_SCAN_LIMIT);

    const failureTimes = recent
      .filter((event) => event.eventType === "ONE_TIME_CODE_FAILED")
      .filter((event) => event.timestamp > now - REQUEST_WINDOW_MS)
      .map((event) => event.timestamp);

    await logAuthEvent(ctx, {
      email,
      eventType: "ONE_TIME_CODE_FAILED",
      timestamp: now,
      provider: "one-time-code",
      reasonCode: "code_refused",
    });

    if (!isWithinRequestLimit(failureTimes, now)) return;

    await ctx.db.insert("auditLogs", {
      // No actor: nobody is signed in, and naming the account holder as the
      // person who did this would accuse them of an attempt that may well have
      // been made against them.
      actionType: "SIGN_IN_FAILED",
      entityType: "users",
      entityId: "SIGN_IN_ATTEMPT",
      timestamp: now,
      metadata: JSON.stringify({ attemptedEmail: email, method: "one-time code" }),
    });
  },
});

/** A code that worked. The other half of the story the trail should tell. */
export const recordVerified = publicMutation({
  reason: "Records that a code worked, which happens as the session is being established rather than after.",
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = normaliseEmail(args.email);
    if (!email) return;

    await logAuthEvent(ctx, {
      email,
      eventType: "ONE_TIME_CODE_VERIFIED",
      timestamp: Date.now(),
      provider: "one-time-code",
      reasonCode: "code_accepted",
    });
  },
});
