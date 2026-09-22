import { v } from "convex/values";

import { superAdminQuery } from "./tenantFunctions";
import { aiEngineValidator } from "./seoAiEngines";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { appError } from "./utils/appError";
import type { Id } from "./_generated/dataModel";

/**
 * What the AI engines said, for one of a company's websites.
 *
 * **Read through the company's own cycle lines, never from the citation
 * table outward.** A citation row is shared — the same answer serves every
 * company that asked the same question — so the only safe way in is from a
 * company's hold on a website, to its cycles, to the pulls its lines point at.
 * That direction is what keeps one client's rivals out of another's screen.
 *
 * One row per answer: the question, the engine, the day, whether this website
 * was named and where, and everyone else who was. The last column is the
 * reason the feature sells.
 */

const namedShape = v.object({
  text: v.string(),
  websiteId: v.union(v.id("websites"), v.null()),
  /** Set for a brand match; absent for a cited source. */
  variantKind: v.optional(v.union(v.literal("NAME"), v.literal("MISSPELLING"))),
  kind: v.union(v.literal("BRAND"), v.literal("SOURCE")),
});

export const listCompanyWebsiteCitations = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("seoDataPulls"),
      prompt: v.string(),
      engine: aiEngineValidator,
      day: v.string(),
      /** Where this website was named, from 1, or null when it was not. */
      ourPosition: v.union(v.number(), v.null()),
      ourVariantKind: v.optional(v.union(v.literal("NAME"), v.literal("MISSPELLING"))),
      /** Everyone else the answer named or cited, in order. */
      others: v.array(namedShape),
      status: v.string(),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");

    // From this company's hold, to the pulls its own lines point at. Bounded
    // to a window of recent lines; this is a screen, not an archive.
    const lines = await ctx.db
      .query("seoCycleLines")
      .withIndex("by_company_website", (q) =>
        q.eq("companyId", companyWebsite.companyId).eq("websiteId", companyWebsite.websiteId))
      .order("desc")
      .take(MAX_LINES);

    const pullIds = new Set<Id<"seoDataPulls">>();
    for (const line of lines) {
      if (line.operationId.startsWith("ai_citation_")) pullIds.add(line.pullId);
    }

    const rows = [];

    for (const pullId of pullIds) {
      const pull = await ctx.db.get(pullId);
      if (!pull) continue;
      const engine = pull.operationId.slice("ai_citation_".length);

      const mentions = await ctx.db
        .query("aiCitations")
        .withIndex("by_pull", (q) => q.eq("pullId", pullId))
        .take(MAX_MENTIONS);

      const ours = mentions.find((row) =>
        row.kind === "BRAND" && row.mentionedWebsiteId === companyWebsite.websiteId);

      const others = [];
      for (const row of mentions) {
        if (row.mentionedWebsiteId === companyWebsite.websiteId) continue;
        // The text is what the engine wrote: the brand variant it used, or the
        // domain it cited. A brand match is the more specific fact and is not
        // replaced with the host it resolved to.
        others.push({
          text: row.mentionedText,
          websiteId: row.mentionedWebsiteId ?? null,
          ...(row.variantKind ? { variantKind: row.variantKind } : {}),
          kind: row.kind,
        });
      }

      const prompt = mentions[0]?.prompt ?? readPrompt(pull.taskArgsJson);
      rows.push({
        _id: pullId,
        prompt,
        engine: engine as never,
        day: (pull.completedAt ? new Date(pull.completedAt) : new Date(pull.submittedAt))
          .toISOString().slice(0, 10),
        ourPosition: ours?.position ?? null,
        ...(ours?.variantKind ? { ourVariantKind: ours.variantKind } : {}),
        others,
        status: pull.status,
      });
    }

    rows.sort((left, right) => right.day.localeCompare(left.day));

    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = term
      ? rows.filter((row) =>
        includesSearchTerm(row.prompt, term)
        || row.others.some((other) => includesSearchTerm(other.text, term)))
      : rows;

    return paginateItems(matching, args.page, args.pageSize);
  },
});

function readPrompt(taskArgsJson: string): string {
  try {
    const args = JSON.parse(taskArgsJson) as Record<string, unknown>;
    return typeof args.user_prompt === "string" ? args.user_prompt : "";
  } catch {
    return "";
  }
}

/** Recent lines for one company website. A screen, not an archive. */
const MAX_LINES = 500;

/** Mentions read per answer. An engine names a handful, never hundreds. */
const MAX_MENTIONS = 250;
