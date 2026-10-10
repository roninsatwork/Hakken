import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import type { Id } from "./_generated/dataModel";
import { listHold, myRivals, requireMySite, type SiteReader } from "./siteAccess";
import { holdAiSummary, holdQuestionAnswers, holdQuestions } from "./holdLists";
import { AI_ENGINES, aiEngineValidator } from "./seoAiEngines";
import { citedPagesOf, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { MAX_LIST } from "./websiteSiteRows";
import { listWithCut } from "./siteListPages";
import { seenValidator } from "./utils/hakkenSees";
import { citedSees } from "./utils/sees/aiAnswers";

/**
 * What the AI engines say about a site, for the client's Sites screens.
 *
 * About this site only (D2, Anthony 2026-09-23: "this is about the website
 * only, not anyone else"). Rivals appear in share of voice as the comparison,
 * and nowhere as a list of who else an answer named.
 *
 * The questions are the list the company measures the site on — its own for
 * an owned site, the owned site's for a competitor (D17) — and the company's
 * alone, read through its hold (docs/plans/active/private-tracking-lists-plan.md).
 * They are a bounded list, capped at `MAX_LIST` on the record, so reading them
 * whole by index is a read of the company's own list, not a scan of anyone
 * else's. What the answers said is counted when they are filed, per question
 * and for the list as a whole (`siteListAi.ts`), so a screen reads the list's
 * rows, not the answers (docs/plans/active/sites-ai-list-summaries-plan.md).
 */

/**
 * How each engine treats the site on each of its questions, as of the newest
 * answer: counted over its latest answers (`ANSWER_WINDOW`), the same for the
 * company's own website and a competitor, and read from the list's rows in
 * one go, however long the list.
 */
export const listMentions = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    prompt: v.string(),
    engine: aiEngineValidator,
    asked: v.number(),
    named: v.number(),
    recommended: v.number(),
    warnedAgainst: v.number(),
    lastAskedDay: v.union(v.string(), v.null()),
    lastStance: v.union(
      v.literal("RECOMMENDED"), v.literal("NAMED"), v.literal("WARNED_AGAINST"), v.literal("NOT_NAMED"), v.null(),
    ),
  })),
  handler: async (ctx, args) => await readMentions(ctx, args.siteId),
});

/**
 * How each engine treats a site on each question — the one read the Mentions
 * screen and the Assistant both make (assistant-foundation-plan.md, item 7).
 */
export async function readMentions(ctx: SiteReader, siteId: Id<"companyWebsites">) {
  const site = await requireMySite(ctx, siteId);
  const websiteId = site.website._id;
  const holdId = listHold(site);
  const [questions, answered] = await Promise.all([
    holdQuestions(ctx, holdId, MAX_LIST),
    holdQuestionAnswers(ctx, holdId, site.place, MAX_LIST),
  ]);
  const byPrompt = new Map(answered.map((row) => [row.prompt, row]));

  const rows = questions.flatMap((question) => question.engines.map((engine) => {
    // Nothing yet for an engine that has not answered; "not named" once it
    // has, and its newest answer left the site out.
    const entry = byPrompt.get(question.prompt)?.engines.find((held) => held.engine === engine);
    const mine = entry?.sites.find((held) => held.websiteId === websiteId);
    return {
      prompt: question.prompt,
      engine,
      asked: entry?.asked ?? 0,
      named: mine?.named ?? 0,
      recommended: mine?.recommended ?? 0,
      warnedAgainst: mine?.warnedAgainst ?? 0,
      lastAskedDay: entry?.lastDay ?? null,
      lastStance: entry ? mine?.newest ?? ("NOT_NAMED" as const) : null,
    };
  }));
  return rows.sort((left, right) =>
    left.prompt.localeCompare(right.prompt) || AI_ENGINES.indexOf(left.engine) - AI_ENGINES.indexOf(right.engine));
}

/**
 * How often the engines name this site against its tracked rivals, per engine.
 *
 * Against tracked rivals only (D7): an answer names many firms, and the ones
 * we can count are the ones we hold names for. The screen says so.
 */
export const shareOfVoice = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    engine: aiEngineValidator,
    asked: v.number(),
    /** The newest day this engine was asked the site's questions: the "last checked" column. */
    lastDay: v.union(v.string(), v.null()),
    sites: v.array(v.object({ websiteId: v.id("websites"), host: v.string(), isYou: v.boolean(), named: v.number() })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    // The list's summary counts the whole group, so one row gives every
    // member's share — whichever member is open.
    const [rivals, summary] = await Promise.all([
      myRivals(ctx, site),
      holdAiSummary(ctx, listHold(site), site.place),
    ]);

    const everyone = [
      { websiteId, host: site.website.displayHost, isYou: true },
      ...rivals.map((rival) => ({ websiteId: rival.website._id, host: rival.website.displayHost, isYou: false })),
    ];
    return AI_ENGINES.flatMap((engine) => {
      const held = summary?.engines.find((entry) => entry.engine === engine);
      if (!held) return [];
      const named = new Map(held.named.map((entry) => [entry.websiteId, entry.times]));
      return [{
        engine,
        asked: held.asked,
        lastDay: held.lastDay,
        sites: everyone.map((entry) => ({ ...entry, named: named.get(entry.websiteId) ?? 0 })),
      }];
    });
  },
});

/**
 * The site's pages the engines link to in their answers, most cited first —
 * from the answers to the questions it is measured on only (D17). A bounded
 * list, read whole: the pages cited for a site's questions, not every page any
 * answer ever linked to. The screen searches and pages it in place.
 */
export const listCitedPages = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    ...listWithCut(v.object({
      url: v.string(),
      page: v.string(),
      engines: v.array(aiEngineValidator),
      times: v.number(),
      firstDay: v.string(),
      lastDay: v.string(),
    })).fields,
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const coverage = { cut: false };
    const rows = await citedPagesOf(ctx, site.website._id, listHold(site), site.place, QUESTIONS_FOR_CITED_PAGES, coverage);
    return { rows, cut: coverage.cut ? rows.length : null, seen: citedSees(rows) };
  },
});
