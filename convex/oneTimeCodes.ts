import { v } from "convex/values";

import { publicMutation } from "./tenantFunctions";
import { logAuthEvent } from "./authEvents";
import { isWithinRequestLimit, normaliseEmail, REQUEST_WINDOW_MS } from "./oneTimeCodeService";

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
  handler: async (ctx, args): Promise<boolean> => {
    const email = normaliseEmail(args.email);
    const now = Date.now();

    if (!email) return false;

    const recent = await ctx.db
      .query("authEvents")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(REQUEST_SCAN_LIMIT);

    const requestTimes = recent
      .filter((event) => event.eventType === "ONE_TIME_CODE_REQUESTED")
      .filter((event) => event.timestamp > now - REQUEST_WINDOW_MS)
      .map((event) => event.timestamp);

    if (!isWithinRequestLimit(requestTimes, now)) {
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

/** A code that worked. The other half of the story the trail should tell. */
export const recordVerified = publicMutation({
  reason: "Records that a code worked, which happens as the session is being established rather than after.",
  args: { email: v.string() },
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
