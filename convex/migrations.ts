import { mutation, internalMutation } from "./_generated/server";
import { auth } from "./auth";

/**
 * runSaaSMigration
 * This is a one-off automated query that:
 * 1. Mints the foundational 'ACME Inc' SaaS workspace.
 * 2. Elevates the root anthony@ronins.co.uk account to SUPER_ADMIN.
 * 3. Sweeps all other users and legacy threads into the ACME company for analytics continuity.
 */
export const runSaaSMigration = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Create ACME Inc.
    let acmeId = null;
    const existingCompany = await ctx.db
      .query("companies")
      .withIndex("by_name", (q) => q.eq("name", "ACME Inc"))
      .first();

    if (existingCompany) {
      acmeId = existingCompany._id;
    } else {
      acmeId = await ctx.db.insert("companies", {
        name: "ACME Inc",
        createdAt: Date.now(),
      });
    }

    // 2. Fetch all users
    const allUsers = await ctx.db.query("users").take(10000);
    let migratedUsers = 0;

    for (const user of allUsers) {
      if (user.email === "anthony@ronins.co.uk") {
        // Force elevate super admin
        await ctx.db.patch(user._id, { role: "SUPER_ADMIN" });
      } else {
        // Move into ACME 
        await ctx.db.patch(user._id, { companyId: acmeId });
        migratedUsers++;
      }
    }

    // 3. Migrate Threads for Cost Tracking
    const allThreads = await ctx.db.query("threads").take(10000);
    let migratedThreads = 0;

    for (const thread of allThreads) {
      // Regardless of who owns the thread, bundle it into ACME for legacy continuity
      await ctx.db.patch(thread._id, { companyId: acmeId });
      migratedThreads++;
    }

    return {
      status: "SUCCESS",
      message: `Migration completed. Seeded ${migratedUsers} users and ${migratedThreads} conversation threads into ACME Inc.`,
      companyId: acmeId
    };
  }
});
