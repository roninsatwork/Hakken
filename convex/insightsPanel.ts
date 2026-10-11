import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { holdBrandNames } from "./holdProfiles";
import { holdQuestions } from "./holdLists";
import { loadSite } from "./websiteSiteRows";
import { partIsOn } from "./collectionParts";
import { addWebsiteQuestionCore } from "./websiteCanonical";
import { PANEL_REFRESH_DAYS, PANEL_SIZE, panelQuestionValidator } from "./utils/insightPanel";

/**
 * The buyer-question panel's reads and writes (docs/plans/active/
 * insights-analyst-plan.md I28, phase 12): what it is built from, the panel
 * kept, and its questions put on — or taken off — the company's own list of
 * AI questions as its "Buyer questions" collection is switched on or off.
 * The asking itself is the AI answers collection's, unchanged.
 */

/** Rankings read for the searches a panel is built from, the most searched first. */
const SEARCHES_READ = 300;
/** A company's questions read to match the panel against. */
const QUESTIONS_READ = 400;

export const panelInputs = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    name: v.string(),
    host: v.string(),
    due: v.boolean(),
    searches: v.array(v.object({ search: v.string(), volume: v.number(), page: v.string() })),
    services: v.array(v.object({ page: v.string(), title: v.union(v.string(), v.null()) })),
    guides: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const site = hold ? await loadSite(ctx, hold._id) : null;
    if (!hold || !site) return null;
    const panel = await ctx.db.query("insightQuestionPanels").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const due = !panel || Date.now() - panel.builtAt > PANEL_REFRESH_DAYS * 86_400_000;
    const brands = await holdBrandNames(ctx, hold._id);
    const host = site.website.displayHost ?? site.website.host;
    const name = brands[0]?.name ?? host.replace(/^www\./, "").split(".")[0];
    const pages = await ctx.db.query("holdPages").withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").take(300);
    const services = pages.filter((page) => page.pageType === "SERVICE").slice(0, 20).map((page) => ({ page: page.page, title: page.title ?? null }));
    const guides = pages.filter((page) => page.pageType === "ARTICLE" && page.title).slice(0, 5).map((page) => page.title!.split("|")[0].trim());
    // The searches buyers make that the website ranks for, the most searched first, at most three a page so every service is covered.
    const ranked = await ctx.db.query("siteKeywordRanks").withIndex("by_site_volume", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place)).order("desc").take(SEARCHES_READ);
    const servicePages = new Set(services.map((service) => service.page).concat(["/"]));
    const perPage = new Map<string, number>();
    const brandWords = brands.map((brand) => brand.name.toLowerCase());
    const searches = [];
    for (const row of ranked) {
      if (row.status === "LOST" || !row.volumeKnown || !servicePages.has(row.page)) continue;
      if (brandWords.some((word) => word && row.keyword.includes(word))) continue;
      const count = perPage.get(row.page) ?? 0;
      if (count >= 3) continue;
      perPage.set(row.page, count + 1);
      searches.push({ search: row.keyword, volume: row.volume, page: row.page });
      if (searches.length >= PANEL_SIZE) break;
    }
    return { name, host, due, searches, services, guides };
  },
});

export const savePanel = internalMutation({
  args: { holdId: v.id("companyWebsites"), companyId: v.id("companies"), questions: v.array(panelQuestionValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db.query("insightQuestionPanels").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    // The questions a panel built before asked, and this one doesn't, come off the company's list.
    if (held) {
      const kept = new Set(args.questions.map((question) => question.prompt.toLowerCase()));
      const gone = held.questions.filter((question) => !kept.has(question.prompt.toLowerCase())).map((question) => question.prompt);
      await setActive(ctx, args.holdId, gone, false);
    }
    const row = { companyId: args.companyId, companyWebsiteId: args.holdId, questions: args.questions, builtAt: Date.now() };
    if (held) await ctx.db.replace(held._id, row);
    else await ctx.db.insert("insightQuestionPanels", row);
    return null;
  },
});

/** The panel's questions on the company's list while its collection is on, off it while it's off. */
export const syncPanel = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({ asking: v.number(), overLimit: v.number() }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const panel = await ctx.db.query("insightQuestionPanels").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!hold || !panel) return { asking: 0, overLimit: 0 };
    const prompts = panel.questions.map((question) => question.prompt);
    if (!await partIsOn(ctx, hold.companyId, "buyerPanel")) {
      await setActive(ctx, args.holdId, prompts, false);
      return { asking: 0, overLimit: 0 };
    }
    await setActive(ctx, args.holdId, prompts, true);
    const listed = new Set((await holdQuestions(ctx, args.holdId, QUESTIONS_READ)).map((row) => row.prompt.toLowerCase()));
    let overLimit = 0;
    for (const prompt of prompts) {
      if (listed.has(prompt.toLowerCase())) continue;
      try {
        await addWebsiteQuestionCore(ctx, { companyWebsiteId: args.holdId, prompt });
      } catch {
        // Past the website's limit, or refused for its length: the panel says so, the rest still go on.
        overLimit += 1;
      }
    }
    return { asking: prompts.length - overLimit, overLimit };
  },
});

async function setActive(ctx: MutationCtx, holdId: Id<"companyWebsites">, prompts: readonly string[], isActive: boolean) {
  const wanted = new Set(prompts.map((prompt) => prompt.toLowerCase()));
  for (const row of await holdQuestions(ctx, holdId, QUESTIONS_READ)) {
    if (wanted.has(row.prompt.toLowerCase()) && row.isActive !== isActive) await ctx.db.patch(row._id, { isActive });
  }
}

/**
 * The panel as Visibility's Full answers page shows it (VisAiAnswers board):
 * each question, what it was built from, how often that is searched, whether
 * it names the business, and whether it is being asked.
 */
export const sitePanel = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    on: v.boolean(),
    builtAt: v.number(),
    questions: v.array(v.object({
      prompt: v.string(), builtFrom: v.string(), kind: v.string(), volume: v.union(v.number(), v.null()), withName: v.boolean(),
      status: v.union(v.literal("ASKING"), v.literal("WAITING"), v.literal("OVER_LIMIT")),
      firstAsked: v.union(v.number(), v.null()),
    })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (site.hold.relationship !== "OWNED") return null;
    const panel = await ctx.db.query("insightQuestionPanels").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    if (!panel) return null;
    const on = await partIsOn(ctx, site.hold.companyId, "buyerPanel");
    const listed = new Map((await holdQuestions(ctx, site.hold._id, QUESTIONS_READ)).map((row) => [row.prompt.toLowerCase(), row]));
    return {
      on,
      builtAt: panel.builtAt,
      questions: panel.questions.map((question) => {
        const row = listed.get(question.prompt.toLowerCase());
        return { ...question, status: !on ? "WAITING" as const : row?.isActive ? "ASKING" as const : "OVER_LIMIT" as const, firstAsked: row?.isActive ? row.createdAt : null };
      }),
    };
  },
});
