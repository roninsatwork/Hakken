import { internalMutation, mutation, query } from "./_generated/server";

/**
 * seedSuperAdmins
 * Manually inserts or updates the critical Super Admin accounts.
 * This bypasses the "invite-only" restriction by pre-populating the users table.
 */
export const seedSuperAdmins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    // Attempt to find the ACME Inc company created by the migration
    const acme = await ctx.db
      .query("companies")
      .withIndex("by_name", (q) => q.eq("name", "ACME Inc"))
      .first();
    
    const companyId = acme?._id;

    const usersToSeed = [
      {
        email: "anthony@ronins.co.uk",
        name: "Anthony",
        role: "SUPER_ADMIN" as const,
        companyId,
        createdAt: now,
      },
      {
        email: "allessandro.merola@ronins.co.uk",
        name: "Alessandro",
        role: "SUPER_ADMIN" as const,
        companyId,
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
        // If the user already exists (e.g. from a failed login attempt), update their role
        await ctx.db.patch(existing._id, { 
            role: "SUPER_ADMIN", 
            companyId: companyId || existing.companyId 
        });
        updatedCount++;
      } else {
        // Create the user from scratch
        await ctx.db.insert("users", u);
        seededCount++;
      }
    }

    return {
        status: "SUCCESS",
        message: `Seeded ${seededCount} new users and promoted ${updatedCount} existing users to SUPER_ADMIN.`,
        company: acme?.name || "None"
    };
  },
});
