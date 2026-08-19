import { internalMutation } from "./_generated/server";

/**
 * seedSuperAdmins
 * Inserts or promotes the builder's Super Admin accounts, bypassing the
 * invite-only restriction by pre-populating the users table.
 *
 * Deliberate, owner decision 2026-08-19 (maintenance plan, phase 2): Anthony
 * keeps SUPER_ADMIN on deployments he operates. This file is the recorded
 * exemption in no-client-specific-fallbacks.test.ts — the emails live here
 * and nowhere else. A client's own first admin comes from
 * INITIAL_SUPER_ADMIN_EMAIL (see authUserProvisioning.ts), not from here.
 */
export const seedSuperAdmins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const usersToSeed = [
      {
        email: "anthony@ronins.co.uk",
        name: "Anthony",
        role: "SUPER_ADMIN" as const,
        createdAt: now,
      },
      {
        email: "allessandro.merola@ronins.co.uk",
        name: "Alessandro",
        role: "SUPER_ADMIN" as const,
        createdAt: now,
      },
    ];

    let seededCount = 0;
    let updatedCount = 0;

    for (const u of usersToSeed) {
      const existing = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", u.email))
        .first();

      if (existing) {
        // Already present (e.g. from a failed login attempt): promote, and
        // leave whatever company they already belong to alone.
        await ctx.db.patch(existing._id, { role: "SUPER_ADMIN" });
        updatedCount++;
      } else {
        // Super admins are platform-scoped; no company membership needed.
        await ctx.db.insert("users", u);
        seededCount++;
      }
    }

    return {
      status: "SUCCESS",
      message: `Seeded ${seededCount} new users and promoted ${updatedCount} existing users to SUPER_ADMIN.`,
    };
  },
});
