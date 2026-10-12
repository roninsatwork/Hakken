import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { listHold, requireMySite } from "./siteAccess";
import { loadRivalHolds } from "./websiteSiteRows";
import { askedQuestions } from "./siteFigures";
import { aiEngineValidator, type AiEngine } from "./seoAiEngines";

/**
 * The pages rivals are building that AI assistants cite
 * (docs/plans/active/insights-analyst-plan.md §4.1, drawn on the VisRival and
 * PageDetail boards): from the answers to the company's own AI questions
 * (D17), each rival page with the assistants that cited it and the questions
 * it was cited for — on a rival's page, and on a page's review for the
 * questions its own page is cited for, or whose words it carries.
 */

type Reader = { db: QueryCtx["db"] };

/** The company's questions read, at most. */
const QUESTIONS_READ = 60;
/** A question's cited pages read for one website, at most. */
const PAGES_PER_QUESTION = 30;
/** A page's review reads this many of its questions, at most. */
const QUESTIONS_FOR_A_PAGE = 8;
/** Rows given at most. */
const MOST_ROWS = 25;

const citedRow = v.object({
  host: v.string(),
  url: v.string(),
  page: v.string(),
  engines: v.array(aiEngineValidator),
  /** The questions it was cited for, the first few. */
  prompts: v.array(v.string()),
  times: v.number(),
});
type CitedRow = typeof citedRow.type;

/** One website's pages cited in the answers to the questions given, each with its assistants and questions. */
async function citedFor(ctx: Reader, websiteId: Id<"websites">, host: string, asked: ReadonlyArray<{ prompt: string; engine: AiEngine; locationCode: number }>): Promise<CitedRow[]> {
  const byPage = new Map<string, CitedRow>();
  for (const question of asked) {
    const rows = await ctx.db.query("siteCitedPages")
      .withIndex("by_site_question", (q) => q.eq("websiteId", websiteId).eq("prompt", question.prompt).eq("engine", question.engine).eq("locationCode", question.locationCode))
      .take(PAGES_PER_QUESTION);
    for (const row of rows) {
      const held = byPage.get(row.page) ?? { host, url: row.url, page: row.page, engines: [], prompts: [], times: 0 };
      if (!held.engines.includes(question.engine)) held.engines.push(question.engine);
      if (!held.prompts.includes(question.prompt) && held.prompts.length < 3) held.prompts.push(question.prompt);
      held.times += row.times;
      byPage.set(row.page, held);
    }
  }
  return [...byPage.values()].sort((a, b) => b.times - a.times);
}

/** A rival's pages AI assistants cite, for the company's own questions: what the rival is building. */
export const rivalCitedPages = tenantQuery({
  args: { siteId: v.id("companyWebsites"), rivalId: v.id("companyWebsites") },
  returns: v.array(citedRow),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rival = (await loadRivalHolds(ctx, site)).find((hold) => hold._id === args.rivalId);
    if (!rival) return [];
    const website = await ctx.db.get(rival.websiteId);
    if (!website) return [];
    const asked = await askedQuestions(ctx, listHold(site), site.place, QUESTIONS_READ);
    return (await citedFor(ctx, website._id, website.displayHost ?? website.host, asked)).slice(0, MOST_ROWS);
  },
});

/** Words too common in a page's address to tell its subject. */
const COMMON = new Set(["agency", "agencies", "company", "companies", "services", "service", "london", "surrey", "best", "near", "with", "from", "your", "what", "page"]);

/**
 * The rivals' pages AI assistants cite for the same questions as one of the
 * website's pages: the questions its own page is cited for, or, where it is
 * cited for none, those carrying a word of its address.
 */
export const pageRivalCitedPages = tenantQuery({
  args: { siteId: v.id("companyWebsites"), page: v.string() },
  returns: v.array(citedRow),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const asked = await askedQuestions(ctx, listHold(site), site.place, QUESTIONS_READ);
    const own = await ctx.db.query("siteCitedPages").withIndex("by_site_page", (q) => q.eq("websiteId", site.website._id).eq("page", args.page)).take(200);
    const citedPrompts = new Set(own.map((row) => row.prompt));
    const words = args.page.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !COMMON.has(word));
    const matched = asked.filter((question) => citedPrompts.has(question.prompt));
    const chosen = matched.length > 0 ? matched : asked.filter((question) => words.some((word) => question.prompt.toLowerCase().includes(word)));
    const prompts = [...new Set(chosen.map((question) => question.prompt))].slice(0, QUESTIONS_FOR_A_PAGE);
    const questions = chosen.filter((question) => prompts.includes(question.prompt));
    if (questions.length === 0) return [];
    const rows: CitedRow[] = [];
    for (const rival of await loadRivalHolds(ctx, site)) {
      const website = await ctx.db.get(rival.websiteId);
      if (website) rows.push(...await citedFor(ctx, website._id, website.displayHost ?? website.host, questions));
    }
    return rows.sort((a, b) => b.times - a.times).slice(0, MOST_ROWS);
  },
});
