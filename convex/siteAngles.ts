import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { listHold, requireMySite } from "./siteAccess";
import { holdQuestions, holdSearches } from "./holdLists";
import { fanOutSourceValidator } from "./seoAiEngines";
import { anglePositionFromValidator, pageVerdictValidator } from "./fanOutSchema";
import { isTrackedHold } from "./utils/websitePairing";
import { MAX_LIST } from "./websiteSiteRows";
import { readFanOutLimits } from "./fanOutLimits";

/**
 * The Sites Fan-out queries page (docs/plans/active/fan-out-angles-plan.md,
 * FA1): the searches the AI assistants ran for the site's questions, grouped
 * into angles (FA5), with where the site stands for each (FA2) and the page
 * that answers it, or none (FA4).
 *
 * Read from the angles the collection built (`fanOutAngles.ts`) — the list's
 * rows, never a row per question and engine — through the company's own hold.
 * Whether a search is tracked, and what the searcher wants, are read as the
 * page opens, so tracking one in admin shows at once. For a competitor the
 * angles are those of the site it is compared with, and where the competitor
 * stands is not worked out: the two columns are about the company's own site.
 * How many angles are shown, most seen first, is the company's choice
 * (`fanOutLimits.ts`); past it the page says the list is longer.
 */

const angleRowValidator = v.object({
  /** The question and angle together: one row. */
  key: v.string(),
  angle: v.string(),
  prompt: v.string(),
  /** The wording the page shows, the most seen, and the rest of the angle's wordings. */
  query: v.string(),
  queryText: v.string(),
  otherWordings: v.array(v.string()),
  intent: v.union(v.string(), v.null()),
  engines: v.array(fanOutSourceValidator),
  timesSeen: v.number(),
  lastSeenDay: v.string(),
  position: v.union(v.null(), v.object({
    value: v.union(v.number(), v.null()),
    from: anglePositionFromValidator,
    day: v.string(),
  })),
  /** Null until the page is judged. */
  page: v.union(v.null(), v.object({
    verdict: pageVerdictValidator,
    page: v.union(v.string(), v.null()),
    url: v.union(v.string(), v.null()),
  })),
  tracked: v.boolean(),
});

export const listAngles = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    rows: v.array(angleRowValidator),
    /** The length the list was held to, when it was longer; null when it is whole. */
    cut: v.union(v.number(), v.null()),
    /** The site open is the company's own: its position and page are shown. */
    own: v.boolean(),
    /** How many searches the angles hold, for the table's count. */
    wordings: v.number(),
    /** Whether the angles have been built yet: never, until the first collection after they began. */
    built: v.boolean(),
    /** What "None" was judged against: the pages the newest site audit read, and its limit. */
    audit: v.union(v.null(), v.object({ pagesCrawled: v.number(), maxPages: v.union(v.number(), v.null()) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = listHold(site);
    const own = !isTrackedHold(site.hold);
    if (!holdId) return { rows: [], cut: null, own, wordings: 0, built: false, audit: null };
    const { anglesShown } = await readFanOutLimits(ctx, site.hold.companyId, holdId);

    const [questions, searches, list, rows] = await Promise.all([
      holdQuestions(ctx, holdId, MAX_LIST),
      holdSearches(ctx, holdId, MAX_LIST),
      ctx.db.query("fanOutAngleLists").withIndex("by_hold", (q) => q.eq("holdId", holdId)).unique(),
      ctx.db
        .query("fanOutAngles")
        .withIndex("by_hold_seen", (q) => q.eq("holdId", holdId))
        .order("desc")
        .take(anglesShown + 1),
    ]);
    // A question removed since the angles were built takes its angles with it.
    const asked = new Set(questions.map((question) => question.prompt));
    const tracked = new Set(searches.map((search) => search.keyword));
    const kept = rows.slice(0, anglesShown).filter((row) => asked.has(row.prompt));

    const judgments = new Map<string, { verdict: "ANSWERED" | "NONE" | "OFF_TOPIC" | "UNSURE"; page: string | null; url: string | null }>();
    if (own) {
      for (const angle of new Set(kept.map((row) => row.angle))) {
        const held = await ctx.db
          .query("fanOutPageJudgments")
          .withIndex("by_hold_angle", (q) => q.eq("holdId", holdId).eq("angle", angle))
          .unique();
        if (held) judgments.set(angle, { verdict: held.verdict, page: held.page ?? null, url: held.url ?? null });
      }
    }

    const shaped = await Promise.all(kept.map(async (row) => {
      const lead = row.wordings[0];
      const intent = lead
        ? await ctx.db.query("seoKeywordIntents").withIndex("by_keyword", (q) => q.eq("keyword", lead.query)).unique()
        : null;
      return {
        key: `${row.prompt}::${row.angle}`,
        angle: row.angle,
        prompt: row.prompt,
        query: lead?.query ?? row.angle,
        queryText: lead?.queryText ?? row.angle,
        otherWordings: row.wordings.slice(1).map((wording) => wording.queryText),
        intent: intent?.intent ?? null,
        engines: row.engines,
        timesSeen: row.timesSeen,
        lastSeenDay: row.lastSeenDay,
        position: own && row.position ? { value: row.position.value, from: row.position.from, day: row.position.day } : null,
        page: own ? judgments.get(row.angle) ?? null : null,
        tracked: row.wordings.some((wording) => tracked.has(wording.query)),
      };
    }));

    const crawl = own
      ? await ctx.db
        .query("siteCrawls")
        .withIndex("by_site_day", (q) => q.eq("websiteId", site.website._id))
        .order("desc")
        .first()
      : null;

    return {
      rows: shaped,
      cut: rows.length > anglesShown || list?.cut ? shaped.length : null,
      own,
      wordings: shaped.reduce((sum, row) => sum + 1 + row.otherWordings.length, 0),
      built: Boolean(list && list.rebuiltAt > 0),
      audit: crawl ? { pagesCrawled: crawl.pagesCrawled, maxPages: crawl.maxPages ?? null } : null,
    };
  },
});
