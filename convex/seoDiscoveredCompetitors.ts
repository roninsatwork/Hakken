import { v } from "convex/values";

import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";
import { trackCompetitorCore } from "./websiteAttachments";

/**
 * Websites discovery says compete with one of a company's own.
 *
 * Suggestions, never competitors: nothing is tracked until a person accepts
 * one. Discovery returns dozens of domains that rank for the same searches,
 * and the `seo.real-competitor` judgment labels them so a client sees rivals
 * rather than every site that outranks them.
 *
 * Nothing is hidden by its label. A directory beating you for your own trade
 * is worth knowing; it is just not something to track as a rival.
 */

const suggestionRow = v.object({
  _id: v.id("discoveredCompetitors"),
  _creationTime: v.number(),
  host: v.string(),
  intersections: v.number(),
  averagePosition: v.union(v.number(), v.null()),
  kind: v.union(v.string(), v.null()),
  kindCertainty: v.union(v.string(), v.null()),
  discoveredAt: v.number(),
});

export const listDiscoveredCompetitors = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(suggestionRow),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("discoveredCompetitors")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(MAX_SUGGESTIONS);

    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const undecided = rows.filter((row) => !row.decidedAt);
    const matching = term ? undecided.filter((row) => includesSearchTerm(row.host, term)) : undecided;

    // Closest overlap first: the number of searches both sites rank for is
    // the one figure that says how much of a rival this really is.
    matching.sort((left, right) => right.intersections - left.intersections);

    return paginateItems(
      matching.map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        host: row.host,
        intersections: row.intersections,
        averagePosition: row.averagePosition ?? null,
        kind: row.kind ?? null,
        kindCertainty: row.kindCertainty ?? null,
        discoveredAt: row.discoveredAt,
      })),
      args.page,
      args.pageSize,
    );
  },
});

/**
 * Accept a suggestion, which tracks it as a competitor for real.
 *
 * Goes through `trackCompetitorCore` rather than writing the join row here,
 * so a discovered host gets the same identity check, the same shared
 * `websites` record and the same audit entry as one typed in by hand.
 */
export const acceptDiscoveredCompetitor = superAdminMutation({
  args: { suggestionId: v.id("discoveredCompetitors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw appError("NOT_FOUND", "That suggestion no longer exists.");

    await trackCompetitorCore(ctx, {
      companyWebsiteId: suggestion.companyWebsiteId,
      url: suggestion.host,
      userId: ctx.userId,
      via: "discovered",
    });

    await ctx.db.patch(args.suggestionId, {
      decidedAt: Date.now(),
      decidedBy: ctx.userId,
      dismissed: false,
    });
    return null;
  },
});

export const dismissDiscoveredCompetitor = superAdminMutation({
  args: { suggestionId: v.id("discoveredCompetitors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) return null;

    // Marked rather than deleted, so the next discovery run does not offer it
    // again. Re-running discovery must never resurrect a rejected suggestion.
    await ctx.db.patch(args.suggestionId, {
      decidedAt: Date.now(),
      decidedBy: ctx.userId,
      dismissed: true,
    });
    return null;
  },
});

/** Suggestions held per website. Beyond this the tail is noise. */
const MAX_SUGGESTIONS = 200;
