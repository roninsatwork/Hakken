import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { purgeHoldMoves } from "./websiteMoves";

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
      await purgeHoldMoves(ctx, owner._id);
      await ctx.db.delete(owner._id);
    }

    /*
      Anything watched *against* the deleted host loses its pairing, not its
      place on the list.

      The site it was being compared with is gone, so the pairing is meaningless
      and would dangle at a website id that resolves to nothing. The attachment
      itself is still something this company chose and pays for, so clearing the
      pairing is the honest half-measure: it then follows the company schedule,
      exactly as an unpaired tracked site does.
    */
    const paired = await ctx.db
      .query("companyWebsites")
      .withIndex("by_against", (q) => q.eq("againstWebsiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of paired) {
      await ctx.db.patch(row._id, { againstWebsiteId: undefined });
    }

    /*
      Both directions of the competition graph.

      An edge names two hosts, so deleting one host has to clear the edges it
      points at *and* the edges pointing at it — otherwise a deleted site stays
      on somebody else's rival list as an id that resolves to nothing.
    */
    const asRival = await ctx.db
      .query("websiteRivals")
      .withIndex("by_rival", (q) => q.eq("rivalWebsiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const edge of asRival) await ctx.db.delete(edge._id);

    if (owners.length === ENTRY_PURGE_BATCH
      || asRival.length === ENTRY_PURGE_BATCH
      || paired.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteHoldingsInternal, {
        websiteId: args.websiteId,
      });
    }
    return null;
  },
});

/**
 * The host's own lists, cleared when the host goes.
 *
 * Replaces the per-company-website competitor purge. These hang off the
 * website rather than off anybody's hold on it, so they are the website's to
 * take with it, and nothing scoped to a company needs clearing separately.
 */
export const purgeWebsiteListsInternal = internalMutation({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of questions) await ctx.db.delete(row._id);

    const keywords = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of keywords) await ctx.db.delete(row._id);

    const rivals = await ctx.db
      .query("websiteRivals")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of rivals) await ctx.db.delete(row._id);

    if (questions.length === ENTRY_PURGE_BATCH
      || keywords.length === ENTRY_PURGE_BATCH
      || rivals.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteListsInternal, {
        websiteId: args.websiteId,
      });
    }
    return null;
  },
});

/**
 * A deleted company's holds. The hosts and everything on them survive it.
 *
 * Only the holds now. It used to take the company's competitor rows too,
 * because a rival was a per-client row; rivalry is a fact about a market and
 * lives on the host, so it outlives whoever was watching — ready for the next
 * company that attaches, which is the point of the lists having moved.
 */
export const purgeCompanyWebsitesInternal = internalMutation({
  args: { companyId: v.id("companies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of owned) {
      await purgeHoldMoves(ctx, row._id);
      await ctx.db.delete(row._id);
    }

    if (owned.length === ENTRY_PURGE_BATCH) {
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
