import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getActiveCompanyId, requireAdmin } from "./authz";
import { adminQuery, publicMutation } from "./tenantFunctions";

const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthEventType =
  | "MAGIC_LINK_REQUESTED"
  | "MAGIC_LINK_STARTED"
  | "INVITE_FOUND"
  | "INVITE_MISSING"
  | "INVITE_EXPIRED"
  | "INVITE_REVOKED"
  | "INVITE_STALE_ACCEPTED_RECOVERED"
  | "USER_FOUND"
  | "EMAIL_DISPATCH_SIMULATED"
  | "EMAIL_DISPATCH_STARTED"
  | "EMAIL_DISPATCH_FAILED"
  | "MAGIC_LINK_VERIFIED";

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
  reason: "Records a sign-in attempt, which by definition happens before anyone is authenticated.",
  args: {
    email: v.string(),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const now = Date.now();

    if (!email) return { logged: true };

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

      return { logged: true };
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

      return { logged: true };
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

    return { logged: true };
  },
});
