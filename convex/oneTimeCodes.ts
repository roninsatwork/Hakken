import { v } from "convex/values";

import { publicMutation } from "./tenantFunctions";
import { logAuthEvent } from "./authEvents";
import {
  GLOBAL_REQUEST_WINDOW_MS,
  isWithinRequestLimit,
  MAX_GLOBAL_REQUESTS_PER_MINUTE,
  normaliseEmail,
} from "./oneTimeCodeService";
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

    // The per-address limits below do not help when an attacker invents a new
    // address on every call. This indexed global ceiling bounds both database
    // writes and mail-trigger attempts from this public surface.
    const recentGlobalRequests = await ctx.db
      .query("authEvents")
      .withIndex("by_type", (q) =>
        q.eq("eventType", "ONE_TIME_CODE_REQUESTED")
          .gt("timestamp", now - GLOBAL_REQUEST_WINDOW_MS)
      )
      .order("desc")
      .take(MAX_GLOBAL_REQUESTS_PER_MINUTE);
    if (recentGlobalRequests.length >= MAX_GLOBAL_REQUESTS_PER_MINUTE) return false;

    /*
     * Two limits, not one. The short window stops a burst — five codes in a
     * quarter of an hour is already more than anyone signing in needs — and the
     * hourly cap stops a patient run that stays under it all afternoon. Read
     * over the hour once, because the shorter window is a slice of the longer.
     */
    const recentRequests = await ctx.db
      .query("authEvents")
      .withIndex("by_email_type_timestamp", (q) =>
        q.eq("email", email).eq("eventType", "ONE_TIME_CODE_REQUESTED")
          .gt("timestamp", now - SIGN_IN_REQUEST_WINDOW_MS)
      )
      .order("desc")
      .take(SIGN_IN_MAX_REQUESTS_PER_HOUR);

    const requestTimes = recentRequests.map((event) => event.timestamp);

    if (!isWithinRequestLimit(requestTimes, now) || !isWithinHourlySignInLimit(requestTimes, now)) {
      const previousRefusal = await ctx.db
        .query("authEvents")
        .withIndex("by_email_type_timestamp", (q) =>
          q.eq("email", email).eq("eventType", "ONE_TIME_CODE_THROTTLED")
            .gt("timestamp", now - SIGN_IN_REQUEST_WINDOW_MS)
        )
        .first();
      if (!previousRefusal) {
        await logAuthEvent(ctx, {
          email,
          eventType: "ONE_TIME_CODE_THROTTLED",
          timestamp: now,
          provider: "one-time-code",
          reasonCode: "too_many_requests",
        });
      }
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
