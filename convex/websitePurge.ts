import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Rows removed per pass, so one purge is one bounded transaction and chains
 * itself for the rest. The same number the rest of the websites code uses.
 */
const ENTRY_PURGE_BATCH = 100;

/**
 * Removing a company's holdings, in bounded passes.
 *
 * Split out of `websites.ts` when that file crossed the thousand-line ceiling
 * the module-size guard sets. These are the natural piece to move: they are
 * the retention path rather than the read-and-write path, they are called only
 * by the purge job, and — the constraint that decided it — none of them reads
 * the shared `websites` table, so the tenancy guard's list of two files that
 * may still stands untouched.
 */

export const purgeWebsiteHoldingsInternal = internalMutation({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owners = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);

    for (const owner of owners) {
      await ctx.db.delete(owner._id);
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeCompanyWebsiteCompetitorsInternal, {
        companyWebsiteId: owner._id,
      });
    }

    const rivals = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);

    for (const rival of rivals) await ctx.db.delete(rival._id);

    if (owners.length === ENTRY_PURGE_BATCH || rivals.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteHoldingsInternal, {
        websiteId: args.websiteId,
      });
    }
    return null;
  },
});

/** Competitors left behind by a removed company website. */
export const purgeCompanyWebsiteCompetitorsInternal = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(ENTRY_PURGE_BATCH);

    for (const row of rows) await ctx.db.delete(row._id);

    if (rows.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeCompanyWebsiteCompetitorsInternal, {
        companyWebsiteId: args.companyWebsiteId,
      });
    }
    return null;
  },
});

/** A deleted company's websites and competitors. The `websites` rows survive it. */
export const purgeCompanyWebsitesInternal = internalMutation({
  args: { companyId: v.id("companies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rivals = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(ENTRY_PURGE_BATCH);
    for (const rival of rivals) await ctx.db.delete(rival._id);

    const owned = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of owned) await ctx.db.delete(row._id);

    if (rivals.length === ENTRY_PURGE_BATCH || owned.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeCompanyWebsitesInternal, {
        companyId: args.companyId,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Writing — the names a site goes by, and where a company watches it from
// ---------------------------------------------------------------------------

/**
 * Set the names this website is known by.
 *
 * **Super admin only, and deliberately so.** The list sits on the shared
 * `websites` row, so one operator editing it changes what every company
 * tracking that host sees. Anthony, 2026-09-21: *"let's make it super admin for
 * now as I don't fully understand it yet."* Every edit is audited, including
 * what the list was before, because a shared record that someone blanked needs
 * to be recoverable from the trail rather than from memory.
 *
 * It is on the website rather than on a company's hold of it because two
 * companies would not disagree: anyone tracking a host writes down the same
 * names for it. The dedupe rule's test is disagreement, not ownership.
 */
