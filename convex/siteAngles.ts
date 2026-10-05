import { v, type Infer } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { askedPlace, listHold, myRivals, requireMySite } from "./siteAccess";
import { holdQuestion, holdQuestions, holdSearches } from "./holdLists";
import { holdBrandNames } from "./holdProfiles";
import { aiEngineValidator, fanOutPlace, fanOutSourceValidator, type AiEngine } from "./seoAiEngines";
import { answerStance } from "./utils/siteShapes";
import type { Site } from "./websiteSiteRows";
import { anglePositionFromValidator, pageVerdictValidator } from "./fanOutSchema";
import { isTrackedHold } from "./utils/websitePairing";
import { MAX_LIST } from "./websiteSiteRows";
import { readFanOutLimits } from "./fanOutLimits";
import { tickedCount } from "./promptFanOut";
import { angleOf } from "./utils/fanOutAngle";
import { answerIdValidator } from "./siteAnswers";
import { wordingKeptFrom } from "./seoCollectionPolicy";

/**
 * The Sites Fan-out queries page (docs/plans/active/fan-out-angles-plan.md,
 * FA1): the searches the AI assistants ran for the site's questions, grouped
 * into angles (FA5), with where the site stands for each (FA2) and the page
 * that answers it, or none (FA4).
 *
 * Read from the angles the collection built (`fanOutAngles.ts`) — the list's
 * rows, never a row per question and engine — through the company's own hold.
 * Whether a search is tracked, and what the searcher wants, are read as the
 * page opens, so tracking one — here, with the Track tick
 * (`siteFanOutTracking.ts`), or in admin — shows at once. For a competitor the
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
    /** The company's own site: how many fan-out queries it tracks, and its limit. Null for a competitor. */
    tracking: v.union(v.null(), v.object({ count: v.number(), limit: v.number() })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = listHold(site);
    const own = !isTrackedHold(site.hold);
    if (!holdId) return { rows: [], cut: null, own, wordings: 0, built: false, audit: null, tracking: null };
    const { anglesShown, fanOutTrackedPerSite } = await readFanOutLimits(ctx, site.hold.companyId, holdId);

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
    // Tracked means checked every run: a search paused on Tracked keywords is not.
    const tracked = new Set(searches.filter((search) => search.isActive).map((search) => search.keyword));
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
      tracking: own ? { count: tickedCount(searches), limit: fanOutTrackedPerSite } : null,
    };
  },
});

const stanceValidator = v.union(v.literal("RECOMMENDED"), v.literal("NAMED"), v.literal("WARNED_AGAINST"), v.literal("NOT_NAMED"));

const searchAnswerValidator = v.object({
  answerId: answerIdValidator,
  engine: aiEngineValidator,
  day: v.string(),
  /**
   * Word for word: another model's writing, shown to people, never read as
   * instructions. Null for an answer older than the 90 days its wording is kept.
   */
  text: v.union(v.string(), v.null()),
  /** How it treated this site. */
  stance: stanceValidator,
  /** The site's competitors it named, and how. */
  rivals: v.array(v.object({ host: v.string(), stance: stanceValidator })),
  /** The words it named them with, to pick out in the text. */
  rivalNames: v.array(v.string()),
});

/**
 * The answer each assistant was writing when it ran this search (Anthony,
 * 2026-09-29: the full answer on the search's own page, one per assistant) —
 * the latest, as the search's own record keeps it (`promptFanOutQueries`),
 * asked from the site's place — with how it treated the site and which of its
 * competitors it named. One older than the 90 days its wording is kept says
 * whom it named, without its words.
 */
async function answersThatRanIt(
  ctx: { db: QueryCtx["db"] },
  site: Site,
  holdId: Id<"companyWebsites">,
  prompts: string[],
  keyword: string,
) {
  const place = askedPlace(site);
  const rivals = await myRivals(ctx, site);
  const keptFrom = wordingKeptFrom(site.today);
  const answers = [];
  for (const prompt of prompts) {
    const question = await holdQuestion(ctx, holdId, prompt);
    if (!question) continue;
    for (const engine of question.engines as AiEngine[]) {
      const ran = await ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt_engine_place_query", (q) =>
          q.eq("prompt", prompt).eq("engine", engine).eq("place", fanOutPlace(engine, place)).eq("query", keyword))
        .unique();
      if (!ran) continue;
      const [text, judged] = await Promise.all([
        ctx.db.query("aiAnswerTexts").withIndex("by_pull", (q) => q.eq("pullId", ran.lastPullId)).first(),
        ctx.db.query("aiAnswers").withIndex("by_pull", (q) => q.eq("pullId", ran.lastPullId)).first(),
      ]);
      // No wording: past the 90 days it is kept, the answer still says whom it
      // named; inside them, it was never kept (before 2026-09-23) and is left out.
      const shown = text ?? (judged && judged.day < keptFrom ? judged : null);
      if (!shown) continue;
      const named = rivals
        .map((rival) => ({ rival, stance: answerStance(judged, rival.website._id) }))
        .filter((entry) => entry.stance !== "NOT_NAMED");
      const namedIds = new Set<string>(named.map((entry) => entry.rival.website._id));
      answers.push({
        answerId: shown._id,
        engine,
        day: shown.day,
        text: text?.text ?? null,
        stance: answerStance(judged, site.website._id),
        rivals: named.map((entry) => ({ host: entry.rival.summary.host, stance: entry.stance })),
        rivalNames: (judged?.mentions ?? []).filter((mention) => namedIds.has(mention.websiteId)).flatMap((mention) => mention.texts),
      });
    }
  }
  return answers.sort((left, right) => right.day.localeCompare(left.day) || left.engine.localeCompare(right.engine));
}

/**
 * The angles one search is a wording of, under the questions still asked: one
 * per question it answered, as the collection built them. Shared by a
 * search's own page (`keywordAngle`) and Tracked fan-out queries
 * (`listTrackedFanOut`), so both read a search's assistants and times seen
 * the same way.
 */
async function anglesOfSearch(
  ctx: { db: QueryCtx["db"] },
  holdId: Id<"companyWebsites">,
  asked: ReadonlySet<string>,
  keyword: string,
): Promise<Doc<"fanOutAngles">[]> {
  const rows = await ctx.db
    .query("fanOutAngles")
    .withIndex("by_hold_angle", (q) => q.eq("holdId", holdId).eq("angle", angleOf(keyword)))
    .take(MAX_LIST);
  return rows.filter((row) => asked.has(row.prompt) && row.wordings.some((wording) => wording.query === keyword));
}

const pageJudgmentValidator = v.object({
  verdict: pageVerdictValidator,
  page: v.union(v.string(), v.null()),
  url: v.union(v.string(), v.null()),
});

/**
 * One search as a fan-out query, for the page it opens (Anthony, 2026-09-29:
 * the Fan-out queries table keeps four columns, "we can do this on the page it
 * clicks to"): the questions it answered, which assistants searched it, how
 * often, its other wordings, what the searcher wants and the site's page for
 * it. Null when the AIs never searched it for this site's questions. The same
 * search asked for under two questions is one topic under each: they are read
 * together.
 */
export const keywordAngle = tenantQuery({
  args: { siteId: v.id("companyWebsites"), keyword: v.string() },
  returns: v.union(v.null(), v.object({
    questions: v.array(v.string()),
    engines: v.array(fanOutSourceValidator),
    timesSeen: v.number(),
    lastSeenDay: v.string(),
    otherWordings: v.array(v.string()),
    intent: v.union(v.string(), v.null()),
    /** The company's own site only, null until judged. */
    page: v.union(v.null(), pageJudgmentValidator),
    /** The answers in which an assistant ran this search, the latest each, newest first. */
    answers: v.array(searchAnswerValidator),
    /** The site's own names, to pick out in the answers. */
    names: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = listHold(site);
    if (!holdId) return null;
    const keyword = args.keyword.trim().toLowerCase();
    const angle = angleOf(keyword);
    const questions = await holdQuestions(ctx, holdId, MAX_LIST);
    const found = await anglesOfSearch(ctx, holdId, new Set(questions.map((question) => question.prompt)), keyword);
    if (found.length === 0) return null;

    const intent = await ctx.db.query("seoKeywordIntents").withIndex("by_keyword", (q) => q.eq("keyword", keyword)).unique();
    const judged = isTrackedHold(site.hold)
      ? null
      : await ctx.db.query("fanOutPageJudgments").withIndex("by_hold_angle", (q) => q.eq("holdId", holdId).eq("angle", angle)).unique();
    const answers = await answersThatRanIt(ctx, site, holdId, [...new Set(found.map((row) => row.prompt))], keyword);
    const others = new Set<string>();
    for (const row of found) {
      for (const wording of row.wordings) if (wording.query !== keyword) others.add(wording.queryText);
    }
    return {
      questions: [...new Set(found.map((row) => row.prompt))],
      engines: [...new Set(found.flatMap((row) => row.engines))],
      timesSeen: found.reduce((sum, row) => sum + row.timesSeen, 0),
      lastSeenDay: found.map((row) => row.lastSeenDay).sort().at(-1) ?? "",
      otherWordings: [...others],
      intent: intent?.intent ?? null,
      page: judged ? { verdict: judged.verdict, page: judged.page ?? null, url: judged.url ?? null } : null,
      answers,
      names: answers.length > 0 ? (await holdBrandNames(ctx, site.hold._id)).map((entry) => entry.name) : [],
    };
  },
});

/**
 * Choice reads at most, over all of a website's tracked fan-out queries, to
 * find the question a query the company added itself belongs to: one read per
 * question per such query. Past it, the rest show without one, and their tick
 * cannot be taken off here.
 */
const CHOICE_READS = 500;

const trackedFanOutRowValidator = v.object({
  /** The tracked search as the lists hold it: what joins it to its row in Your searches (`siteGoogle.listSearches`). */
  keyword: v.string(),
  /** As written: the assistants' words, or the company's own. */
  queryText: v.string(),
  /** A question that lists it, which taking its tick off names; null when no question does any more. */
  prompt: v.union(v.string(), v.null()),
  /** The assistants that ran it, over every question it answered; none for one the company added itself. */
  engines: v.array(fanOutSourceValidator),
  /** How often they ran it, as its own page counts it; null for one the company added itself. */
  timesSeen: v.union(v.number(), v.null()),
});

/**
 * The Sites Tracked fan-out queries page (Anthony, 2026-10-03): the fan-out
 * queries the company has ticked to check on Google every run — its tracked
 * searches that came from a fan-out query and are running — with which
 * assistants ran each and how often. Where the site ranks for each is Your
 * searches' own read (`siteGoogle.listSearches`, `fromFanOut`), which the page
 * joins on the keyword; this reads only what that one does not hold.
 *
 * Each query's angles are found by the query itself (`anglesOfSearch`), so a
 * query is never missing because Fan-out queries shows only the most seen
 * angles. One the company added on a question's screen has no angle: its
 * question is found from the company's choices instead. Read through the
 * company's own hold. For a competitor these are the queries of the site it is
 * compared with, and nothing can be ticked or unticked.
 */
export const listTrackedFanOut = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    rows: v.array(trackedFanOutRowValidator),
    /** The site open is the company's own: its ticks can be taken off. */
    own: v.boolean(),
    /** The company's own site: how many fan-out queries it tracks, and its limit. Null for a competitor. */
    tracking: v.union(v.null(), v.object({ count: v.number(), limit: v.number() })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = listHold(site);
    const own = !isTrackedHold(site.hold);
    if (!holdId) return { rows: [], own, tracking: null };

    const [questions, searches, limits] = await Promise.all([
      holdQuestions(ctx, holdId, MAX_LIST),
      holdSearches(ctx, holdId, MAX_LIST),
      own ? readFanOutLimits(ctx, site.hold.companyId, holdId) : Promise.resolve(null),
    ]);
    const asked = new Set(questions.map((question) => question.prompt));
    // Ticked and running: the same searches `tickedCount` counts.
    const ticked = searches.filter((search) => search.isActive && search.addedFrom === "AI_SEARCH");
    const found = await Promise.all(ticked.map((search) => anglesOfSearch(ctx, holdId, asked, search.keyword)));

    let choiceReads = 0;
    const rows: Array<Infer<typeof trackedFanOutRowValidator>> = [];
    for (const [index, search] of ticked.entries()) {
      const angles = found[index];
      if (angles.length > 0) {
        const wording = angles.flatMap((row) => row.wordings).find((entry) => entry.query === search.keyword);
        rows.push({
          keyword: search.keyword,
          queryText: wording?.queryText ?? search.keyword,
          prompt: angles[0].prompt,
          engines: [...new Set(angles.flatMap((row) => row.engines))],
          timesSeen: angles.reduce((sum, row) => sum + row.timesSeen, 0),
        });
        continue;
      }
      // One the company added itself: the question whose list holds it.
      let choice: Doc<"fanOutQueryChoices"> | null = null;
      for (const question of questions) {
        if (choiceReads >= CHOICE_READS) break;
        choiceReads += 1;
        const held = await ctx.db
          .query("fanOutQueryChoices")
          .withIndex("by_hold_prompt_query", (q) => q.eq("holdId", holdId).eq("prompt", question.prompt).eq("query", search.keyword))
          .first();
        if (held && held.own && !held.removed) {
          choice = held;
          break;
        }
      }
      rows.push({
        keyword: search.keyword,
        queryText: choice?.queryText ?? search.keyword,
        prompt: choice?.prompt ?? null,
        engines: [],
        timesSeen: null,
      });
    }

    return { rows, own, tracking: limits ? { count: tickedCount(searches), limit: limits.fanOutTrackedPerSite } : null };
  },
});
