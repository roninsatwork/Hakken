import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { WIKI_PAGE_MAX_CHARS } from "./wikiRewriteService";

/**
 * The tending pass's default-runtime half (wiki plan, phase 4): what the
 * nightly gardener may look at, and the mechanical repairs that need no
 * model at all. The model-assisted tidying lives in wikiTendingActions.ts.
 */

/** How many pages one company's sweep may send to the model per night. */
export const WIKI_TENDING_MODEL_PAGES_PER_SWEEP = 3;

/** A page this full is worth tidying; below it, leave the garden alone. */
export const WIKI_TENDING_LENGTH_THRESHOLD = Math.floor(WIKI_PAGE_MAX_CHARS * 0.75);

/** Don't re-tidy a page the gardener has already seen this week. */
export const WIKI_TENDING_MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const listCompaniesWithPagesInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"companies">>> => {
    // Bounded: pages are created one conversation at a time; a scan of the
    // newest few hundred names every company with a living wiki.
    const pages = await ctx.db.query("wikiPages").order("desc").take(1000);
    return [...new Set(pages.map((page) => page.companyId))];
  },
});

export const getTendingCandidatesInternal = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    args
  ): Promise<{
    linkRepairs: Array<{ pageId: Id<"wikiPages">; links: string[] }>;
    overgrown: Array<{
      pageId: Id<"wikiPages">;
      subjectKey: string;
      title: string;
      content: string;
      pinnedCorrections: Array<{ text: string; pinnedAt: number }>;
    }>;
  }> => {
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(500);

    const livingSubjects = new Set(pages.map((page) => `${page.kind}:${page.subjectKey}`));
    const linkRepairs = pages
      .map((page) => ({
        pageId: page._id,
        links: page.links.filter((link) => livingSubjects.has(link)),
        broken: page.links.some((link) => !livingSubjects.has(link)),
      }))
      .filter((repair) => repair.broken)
      .map(({ pageId, links }) => ({ pageId, links }));

    const now = Date.now();
    const overgrown = pages
      .filter(
        (page) =>
          page.content.length >= WIKI_TENDING_LENGTH_THRESHOLD &&
          now - (page.lastTendedAt ?? 0) >= WIKI_TENDING_MIN_INTERVAL_MS
      )
      .slice(0, WIKI_TENDING_MODEL_PAGES_PER_SWEEP)
      .map((page) => ({
        pageId: page._id,
        subjectKey: page.subjectKey,
        title: page.title,
        content: page.content,
        pinnedCorrections: page.pinnedCorrections,
      }));

    return { linkRepairs, overgrown };
  },
});

/** The free half of tending: links to pages that no longer exist come off. */
export const repairLinksInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    repairs: v.array(v.object({ pageId: v.id("wikiPages"), links: v.array(v.string()) })),
  },
  handler: async (ctx, args): Promise<number> => {
    let repaired = 0;
    const now = Date.now();
    for (const repair of args.repairs) {
      const page = await ctx.db.get(repair.pageId);
      if (!page || page.companyId !== args.companyId) continue;
      await ctx.db.patch(repair.pageId, { links: repair.links });
      repaired += 1;
    }
    if (repaired > 0) {
      await ctx.db.insert("auditLogs", {
        actionType: "WIKI_LINKS_REPAIRED",
        entityType: "wikiPages",
        companyId: args.companyId,
        timestamp: now,
        metadata: JSON.stringify({ pages: repaired }),
      });
    }
    return repaired;
  },
});

/** Stamped whether or not the model changed anything, so a tidy page is not
 * offered to the model again for a week. */
export const markTendedInternal = internalMutation({
  args: { pageId: v.id("wikiPages") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.pageId, { lastTendedAt: Date.now() });
  },
});
