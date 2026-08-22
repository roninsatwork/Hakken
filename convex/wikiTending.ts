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
  handler: async (ctx): Promise<Array<Id<"companies"> | null>> => {
    // Bounded: pages are created one conversation at a time; a scan of the
    // newest few hundred names every brain with living pages. The global
    // shelf rides the same rotas as one more round, as `null`
    // (global-wiki-plan.md, phase 4) — an empty shelf costs nothing.
    const pages = await ctx.db.query("wikiPages").order("desc").take(1000);
    const scopes = new Set<Id<"companies"> | null>();
    for (const page of pages) scopes.add(page.companyId ?? null);
    return [...scopes];
  },
});

export const getTendingCandidatesInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
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
    // The newest pages first: activity — and therefore fresh dead links —
    // lives at this end, and the window is a window, not the wiki
    // (wiki-scaling-note.md).
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(500);

    // A link's target being outside the window proves nothing on a wiki
    // bigger than the window — the old in-window-or-broken rule would have
    // stripped valid links to older pages. A candidate is only declared
    // dead after a point read fails to find its target, a bounded number
    // per night; unverified candidates simply wait for another pass.
    const livingSubjects = new Set(pages.map((page) => `${page.kind}:${page.subjectKey}`));
    let verifyBudget = 200;
    const linkRepairs: Array<{ pageId: Id<"wikiPages">; links: string[] }> = [];
    for (const page of pages) {
      const kept: string[] = [];
      let removedAny = false;
      for (const link of page.links) {
        if (livingSubjects.has(link)) {
          kept.push(link);
          continue;
        }
        const separator = link.indexOf(":");
        if (separator <= 0) {
          removedAny = true;
          continue;
        }
        if (verifyBudget <= 0) {
          kept.push(link);
          continue;
        }
        verifyBudget -= 1;
        const target = await ctx.db
          .query("wikiPages")
          .withIndex("by_company_kind_subject", (q) =>
            q
              .eq("companyId", args.companyId)
              .eq("kind", link.slice(0, separator) as "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE" | "GOAL")
              .eq("subjectKey", link.slice(separator + 1))
          )
          .unique();
        if (target) {
          livingSubjects.add(link);
          kept.push(link);
        } else {
          removedAny = true;
        }
      }
      if (removedAny) linkRepairs.push({ pageId: page._id, links: kept });
    }

    const now = Date.now();
    const overgrown = pages
      .filter(
        (page) =>
          // Hub index pages are mechanical, source notes are full imports,
          // and goals are human intent; the model never tidies (i.e.
          // shortens) any of them.
          page.kind !== "SOURCE" &&
          page.kind !== "GOAL" &&
          !page.subjectKey.endsWith("-index") &&
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
    companyId: v.optional(v.id("companies")),
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
