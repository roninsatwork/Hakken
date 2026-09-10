import type { Id } from "./_generated/dataModel";
import type { AuthEventType } from "./utils/authEventTypes";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getActiveCompanyId } from "./authz";
import * as governanceShapes from "./utils/governanceShapes";
import {
  SIGN_IN_MAX_REQUESTS_PER_HOUR,
  SIGN_IN_REQUEST_WINDOW_MS,
  isWithinHourlySignInLimit,
} from "./signInThrottleService";
import { adminQuery, publicMutation } from "./tenantFunctions";

const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

export type { AuthEventType } from "./utils/authEventTypes";

export type AuthEventInput = {
  email: string;
  eventType: AuthEventType;
  timestamp?: number;
  companyId?: Id<"companies">;
  userId?: Id<"users">;
  inviteId?: Id<"invitations">;
  provider?: string;
  reasonCode?: string;
};

type AuthEventCtx = Pick<MutationCtx, "db">;

export async function logAuthEvent(ctx: AuthEventCtx, event: AuthEventInput) {
  return await ctx.db.insert("authEvents", {
    email: event.email.trim().toLowerCase(),
    eventType: event.eventType,
    timestamp: event.timestamp ?? Date.now(),
    ...(event.companyId !== undefined && { companyId: event.companyId }),
    ...(event.userId !== undefined && { userId: event.userId }),
    ...(event.inviteId !== undefined && { inviteId: event.inviteId }),
    ...(event.provider !== undefined && { provider: event.provider }),
    ...(event.reasonCode !== undefined && { reasonCode: event.reasonCode }),
  });
}

export const getRecentAuthEvents = adminQuery({
  args: {},
  returns: governanceShapes.authEventListShape,
  handler: async (ctx) => {
    const { user } = ctx;
    const activeCompanyId = getActiveCompanyId(user);

    const events =
      user.role === "SUPER_ADMIN"
        ? await ctx.db.query("authEvents").withIndex("by_timestamp").order("desc").take(500)
        : activeCompanyId
          ? await ctx.db
              .query("authEvents")
              .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
              .order("desc")
              .take(500)
          : [];

    return await Promise.all(
      events.map(async (event) => {
        const company = event.companyId ? await ctx.db.get(event.companyId) : null;

        return {
          ...event,
          companyName: company?.name ?? null,
        };
      })
    );
  },
});

export const recordMagicLinkRequestAttempt = publicMutation({
  reason: "Called before sign-in, which by definition happens before anyone is authenticated. Records the request and refuses when an address has asked too often.",
  args: {
    email: v.string(),
    provider: v.optional(v.string()),
  },
  returns: v.object({ logged: v.boolean(), allowed: v.boolean() }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const now = Date.now();

    if (!email) return { logged: true, allowed: true };

    /*
     * The refusal has to happen here, before the sign-in screen calls the
     * framework, because the provider that sends the mail is Auth.js's own hook
     * and has no database to count against. Worth stating plainly rather than
     * implying otherwise: this stops the sign-in form being used to post mail at
     * someone, which is what it is for; it is not a defence against a caller
     * driving the auth endpoint directly.
     *
     * Bounded on purpose — the take stops at the limit, so an address under a
     * sustained run is not re-counted from the beginning every time.
     */
    const recentRequests = await ctx.db
      .query("authEvents")
      .withIndex("by_email_type_timestamp", (q) =>
        q.eq("email", email).eq("eventType", "MAGIC_LINK_REQUESTED")
          .gt("timestamp", now - SIGN_IN_REQUEST_WINDOW_MS)
      )
      .order("desc")
      .take(SIGN_IN_MAX_REQUESTS_PER_HOUR);

    if (!isWithinHourlySignInLimit(recentRequests.map((event) => event.timestamp), now)) {
      // Keep evidence of the refusal without writing a row for every retry.
      // The indexed read and insert share this mutation's transaction.
      const previousRefusal = await ctx.db
        .query("authEvents")
        .withIndex("by_email_type_timestamp", (q) =>
          q.eq("email", email).eq("eventType", "MAGIC_LINK_THROTTLED")
            .gt("timestamp", now - SIGN_IN_REQUEST_WINDOW_MS)
        )
        .first();
      if (!previousRefusal) {
        await logAuthEvent(ctx, {
          email,
          eventType: "MAGIC_LINK_THROTTLED",
          timestamp: now,
          provider: args.provider,
          reasonCode: "too_many_requests",
        });
      }

      return { logged: !previousRefusal, allowed: false };
    }

    await logAuthEvent(ctx, {
      email,
      eventType: "MAGIC_LINK_REQUESTED",
      timestamp: now,
      provider: args.provider,
      reasonCode: "public_login_attempt",
    });

    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (existingUser) {
      await logAuthEvent(ctx, {
        email,
        eventType: "USER_FOUND",
        timestamp: now,
        companyId: existingUser.companyId,
        userId: existingUser._id,
        provider: args.provider,
        reasonCode: "existing_user",
      });

      return { logged: true, allowed: true };
    }

    const invite = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!invite) {
      await logAuthEvent(ctx, {
        email,
        eventType: "INVITE_MISSING",
        timestamp: now,
        provider: args.provider,
        reasonCode: "no_invite_or_user",
      });

      return { logged: true, allowed: true };
    }

    await logAuthEvent(ctx, {
      email,
      eventType: "INVITE_FOUND",
      timestamp: now,
      companyId: invite.companyId,
      inviteId: invite._id,
      provider: args.provider,
      reasonCode: invite.status.toLowerCase(),
    });

    if (invite.status === "REVOKED") {
      await logAuthEvent(ctx, {
        email,
        eventType: "INVITE_REVOKED",
        timestamp: now,
        companyId: invite.companyId,
        inviteId: invite._id,
        provider: args.provider,
        reasonCode: "invite_revoked",
      });
    } else if (invite.status === "PENDING" && now - invite.invitedAt > INVITE_EXPIRATION_MS) {
      await logAuthEvent(ctx, {
        email,
        eventType: "INVITE_EXPIRED",
        timestamp: now,
        companyId: invite.companyId,
        inviteId: invite._id,
        provider: args.provider,
        reasonCode: "invite_expired",
      });
    } else if (invite.status === "ACCEPTED") {
      await logAuthEvent(ctx, {
        email,
        eventType: "INVITE_STALE_ACCEPTED_RECOVERED",
        timestamp: now,
        companyId: invite.companyId,
        inviteId: invite._id,
        provider: args.provider,
        reasonCode: "accepted_invite_missing_user",
      });
    }

    return { logged: true, allowed: true };
  },
});
