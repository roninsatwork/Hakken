import { v } from "convex/values";

import { internalMutation, type QueryCtx } from "./_generated/server";

/**
 * Addresses that bounced or whose reader marked an email as spam (docs/plans/
 * active/knowledge-news-and-digest-plan.md, phase 8), recorded from Resend's
 * webhook (`emailHttp.ts`). The Email Sender skips them from then on: sending
 * on to them harms every other email's chance of arriving.
 */

const suppressionReason = v.union(v.literal("BOUNCED"), v.literal("COMPLAINED"));

export function normaliseAddress(email: string): string {
  return email.trim().toLowerCase();
}

export const recordSuppression = internalMutation({
  args: { emails: v.array(v.string()), reason: suppressionReason, resendEmailId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const raw of args.emails.slice(0, 50)) {
      const email = normaliseAddress(raw);
      if (!email) continue;
      const held = await ctx.db.query("emailSuppressions").withIndex("by_email", (q) => q.eq("email", email)).first();
      if (held) continue;
      await ctx.db.insert("emailSuppressions", {
        email,
        reason: args.reason,
        ...(args.resendEmailId ? { resendEmailId: args.resendEmailId } : {}),
        at: now,
      });
    }
    return null;
  },
});

/** Why an address is not sent to any more, or null. */
export async function suppressionOf(ctx: QueryCtx, email: string): Promise<"BOUNCED" | "COMPLAINED" | null> {
  const held = await ctx.db.query("emailSuppressions").withIndex("by_email", (q) => q.eq("email", normaliseAddress(email))).first();
  return held?.reason ?? null;
}
