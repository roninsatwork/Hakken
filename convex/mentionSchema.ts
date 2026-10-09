import { defineTable } from "convex/server";
import { v } from "convex/values";

/** A column packed as `packColumn` writes it (`utils/packedColumns.ts`), as the other schemas declare it. */
const packedColumnValidator = v.union(v.string(), v.array(v.union(v.number(), v.null())));

/**
 * Web mentions (docs/plans/active/discovery-local-reputation-ai-plan.md, step
 * 6): the pages naming a website, kept once for everyone (`webMentions.ts`),
 * and the websites linking to its rivals and not to it.
 */
export const mentionTables = {
  /**
   * A website's mentions, the newest thousand within twelve months, one
   * record: each page once — its address and title, the day it was found,
   * its kind of site, how it speaks of the business, whether it links to it,
   * its site's strength, and whether the AI check (D20) found it about this
   * business. No page text is kept.
   */
  webMentionParts: defineTable({
    websiteId: v.id("websites"),
    urls: v.array(v.string()),
    titles: v.array(v.union(v.string(), v.null())),
    days: packedColumnValidator,
    kinds: packedColumnValidator,
    tones: packedColumnValidator,
    strength: packedColumnValidator,
    linked: packedColumnValidator,
    /** 1 about this business, 0 another of the name; read by the AI check or its rule. */
    about: packedColumnValidator,
    updatedAt: v.number(),
  }).index("by_website", ["websiteId"]),

  /**
   * The websites linking to both of two rivals and not to a website, from the
   * pair's last monthly reading: shared, one record a website and pair. A
   * company's Where to get listed reads the pairs of the rivals it watches.
   */
  linkGapPairs: defineTable({
    websiteId: v.id("websites"),
    /** The two rivals' addresses, in order. */
    rivals: v.array(v.string()),
    month: v.string(),
    domains: v.array(v.string()),
    strength: packedColumnValidator,
    updatedAt: v.number(),
  }).index("by_website", ["websiteId"]),
};
