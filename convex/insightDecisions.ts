import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { readPeriod } from "./searchConsolePeriodReads";
import { readSlot } from "./googleAnalyticsRows";
import { EVERY_DEVICE, slotKey } from "./googleAnalyticsLists";
import { decodePages } from "./holdPageRefs";
import { readListCopy, linksCopyKey } from "./siteListCopies";
import { LINK_COPY_FIELDS } from "./siteLinkLists";
import { contentGapOf, rankingNow } from "./siteContentGap";
import { readKeywordCopy } from "./siteKeywordCopy";
import { loadRivalHolds, loadSite } from "./websiteSiteRows";
import { historyOf, monthsOf, pageKindsOf } from "./insightsPeriodData";
import { normalisePage } from "./utils/pageClassification";
import { createValidator, decisionValidator, pageDecisionsFrom, pagesToCreate, type DecisionInput, type PageDecision, type PageToCreate } from "./utils/insightDecisions";
import { PAGE_ANSWER, PAGE_DECISIONS_ROLE, applyPageAnswer, carryPages, pageReading, pagesInputOf, pagesToHand } from "./utils/insightPageAgent";
import { deciderValidator } from "./utils/insightDecided";
import { briefFor } from "./utils/insightBriefs";
import { ask, type InsightsRunArgs } from "./insightsAsk";
import type { TeamMember } from "./insightsTeam";
import { PLAN_ACTIONS, type PlanAction } from "./utils/insightPlan";

/**
 * Page decisions (docs/plans/active/insights-intelligence-plan.md phase 4):
 * each week the run gives every page of the website a verdict — keep,
 * improve, merge, redirect, remove — and lists the pages to create
 * (utils/insightDecisions.ts), kept for the Page decisions screen. Read from
 * what Hakken already holds; nothing is bought. Only the caller's own company
 * is ever read.
 */

/** Pages read from the website's page list a call. */
const PAGES_A_CALL = 500;
/** Decisions kept a website, the ones to act on first: a list a screen can carry whole. */
const MOST_DECISIONS_KEPT = 2_000;
/** Decisions in one kept part. */
const PER_PART = 250;
/** Kept parts at most: `MOST_DECISIONS_KEPT` over `PER_PART`, and room. */
const MOST_PARTS = 16;
/** Competing groups read: as many as Keyword cannibalisation keeps. */
const MOST_GROUPS_READ = 40;

/** A page address as every list is joined by: no host, query or section, lower case, no closing slash. */
const keyOf = (address: string) => {
  const path = normalisePage(address);
  return path.length > 1 ? path.replace(/\/$/, "") : path;
};

/** The website's pages, a part at a time, each with its classification and Search Console's 90 days' clicks. */
export const pagesPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    pages: v.array(v.object({ path: v.string(), kind: v.union(v.string(), v.null()), type: v.string(), clicks: v.number(), title: v.optional(v.string()) })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId)).paginate({ numItems: PAGES_A_CALL, cursor: args.cursor });
    const kindOf = await pageKindsOf(ctx, args.holdId);
    return {
      pages: page.page.map((row: Doc<"holdPages">) => {
        const kind = kindOf(row.page);
        return { path: row.page, kind: kind.name, type: kind.type, clicks: row.clicks, ...(row.title ? { title: row.title } : {}) };
      }),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

const crawledValidator = v.object({ key: v.string(), flags: v.array(v.string()), inbound: v.union(v.number(), v.null()), status: v.union(v.number(), v.null()) });

/** The site audit's pages, a part at a time: each page's problems, the website's own links to it, its status. */
export const crawlPart = internalQuery({
  args: { pullId: v.id("seoDataPulls"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ pages: v.array(crawledValidator), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("siteCrawlPages").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).paginate({ numItems: PAGES_A_CALL, cursor: args.cursor });
    return {
      pages: page.page.map((row: Doc<"siteCrawlPages">) => ({ key: keyOf(row.page), flags: row.problems, inbound: row.inboundLinks ?? null, status: row.statusCode ?? null })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

const figuresValidator = v.object({ key: v.string(), visits: v.number(), enquiries: v.number() });

/** Everything else a decision reads, each keyed by page: one bounded read of each list Hakken keeps. */
export const decisionSources = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    year: v.array(figuresValidator),
    views: v.union(v.null(), v.array(v.object({ key: v.string(), views: v.number() }))),
    console: v.array(v.object({ key: v.string(), shown: v.number(), clicks: v.number() })),
    domains: v.union(v.null(), v.array(v.object({ key: v.string(), domains: v.number() }))),
    /** The newest site audit, read a part at a time (`crawlPart`). */
    crawlPull: v.union(v.null(), v.id("seoDataPulls")),
    plan: v.array(v.object({ key: v.string(), action: v.string() })),
    competing: v.array(v.object({
      key: v.string(), decision: v.union(v.literal("OWNER"), v.literal("MERGE"), v.literal("DIFFERENTIATE"), v.literal("LINK")), owner: v.string(),
      why: v.optional(v.string()), decidedBy: v.optional(deciderValidator),
    })),
    reviews: v.array(v.object({ key: v.string(), verdict: v.string() })),
    creates: v.array(createValidator),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const site = hold ? await loadSite(ctx, hold._id) : null;
    if (!hold || !site) return null;

    // Analytics: landing visits and enquiries over the last 12 whole months, from the history.
    const records = await historyOf(ctx, hold._id);
    const kindOf = await pageKindsOf(ctx, hold._id);
    const year = new Set(monthsOf(records, kindOf).filter((month) => month.whole).map((month) => month.month).sort().slice(-12));
    const byYear = new Map<string, { visits: number; enquiries: number }>();
    for (const record of records) {
      if (record.kind !== "GA_PAGES" || !year.has(record.month)) continue;
      for (const row of record.rows) {
        const key = keyOf(row.key);
        const held = byYear.get(key) ?? { visits: 0, enquiries: 0 };
        held.visits += row.visits ?? 0;
        held.enquiries += row.enquiries ?? 0;
        byYear.set(key, held);
      }
    }

    // Every page viewed over a year, not only the pages visits began on.
    const viewed = await readSlot(ctx, hold._id, slotKey("page", "365", "NOW", EVERY_DEVICE));
    let views: Array<{ key: string; views: number }> | null = null;
    if (viewed) {
      const addresses = await decodePages(ctx, hold._id, viewed.rows.map((row) => row.key));
      const byKey = new Map<string, number>();
      viewed.rows.forEach((row, at) => {
        const key = keyOf(addresses[at] ?? row.key);
        byKey.set(key, (byKey.get(key) ?? 0) + (row.views ?? row.visits));
      });
      views = [...byKey].map(([key, count]) => ({ key, views: count }));
    }

    // Search Console's showings and clicks of each page over 90 days.
    const pages = await readPeriod(ctx, hold._id, "web", "page", "90", "NOW");
    const consoleBy = new Map<string, { shown: number; clicks: number }>();
    for (const row of pages?.rows ?? []) {
      const key = keyOf(row.key);
      const held = consoleBy.get(key) ?? { shown: 0, clicks: 0 };
      held.shown += row.impressions;
      held.clicks += row.clicks;
      consoleBy.set(key, held);
    }

    // The websites linking to each page, from the monthly link list.
    const links = await readListCopy(ctx, "links", linksCopyKey(site.website._id), LINK_COPY_FIELDS);
    let domains: Array<{ key: string; domains: number }> | null = null;
    if (links) {
      const from = new Map<string, Set<string>>();
      for (const [, domainFrom, , , pageTo, , status] of links.rows) {
        if (status === "LOST" || typeof pageTo !== "string" || typeof domainFrom !== "string") continue;
        const key = keyOf(pageTo);
        from.set(key, (from.get(key) ?? new Set<string>()).add(domainFrom));
      }
      domains = [...from].map(([key, set]) => ({ key, domains: set.size }));
    }

    // The newest site audit, its pages read a part at a time.
    const crawl = await ctx.db.query("siteCrawls").withIndex("by_site_day", (q) => q.eq("websiteId", site.website._id)).order("desc").first();

    // What the Page plan and Keyword cannibalisation decided this week.
    const plan = await ctx.db.query("insightPlans").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const groups = await ctx.db.query("insightCompetingGroups").withIndex("by_hold_rank", (q) => q.eq("companyWebsiteId", hold._id)).take(MOST_GROUPS_READ);
    // The Conversion specialist's newest page reviews: a page it asked to change is one to improve.
    const reviewed = await ctx.db.query("insightConversions").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").first();

    // The pages to create: searches rivals win that the website has no page for, and buyers' questions.
    const rivals = await loadRivalHolds(ctx, site);
    const gap = await contentGapOf(ctx, { websiteId: site.website._id, place: site.place }, rivals.map((rival) => rival.websiteId));
    const own = await readKeywordCopy(ctx, site.website._id, site.place);
    const ranked = new Set(own ? rankingNow(own.rows, own.latestCheckDay).map((row) => row.keyword.toLowerCase()) : []);
    const panel = await ctx.db.query("insightQuestionPanels").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();

    return {
      year: [...byYear].map(([key, figures]) => ({ key, ...figures })),
      views,
      console: [...consoleBy].map(([key, figures]) => ({ key, ...figures })),
      domains,
      crawlPull: crawl?.pullId ?? null,
      plan: (plan?.pages ?? []).map((row) => ({ key: keyOf(row.page), action: row.action })),
      // Each page read against the page it merges into or is made different from: the one owning most of what it is shown for.
      competing: groups.flatMap((row) => row.group.pages.map((member) => ({
        key: keyOf(member.path), decision: member.decision, owner: member.into ?? row.group.owner,
        ...(member.reason ? { why: member.reason } : {}), ...(row.group.decidedBy ? { decidedBy: row.group.decidedBy } : {}),
      }))),
      reviews: (reviewed?.pages ?? []).map((page) => ({ key: keyOf(page.page), verdict: page.verdict })),
      creates: pagesToCreate(gap?.rows ?? [], panel?.questions ?? [], ranked),
    };
  },
});

/** The Page decisions specialist, as the weekly run hands it its pages: the run, its member, the run's ground rules and the week. */
export type PageSpecialist = { run: InsightsRunArgs; member: TeamMember | undefined; rules: string; week: string };

/** The decisions kept last, every part, to keep the specialist's verdicts on pages the rule reads just the same. */
export const keptDecisions = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(decisionValidator),
  handler: async (ctx, args) => {
    const parts = await ctx.db.query("insightPageDecisions").withIndex("by_hold_part", (q) => q.eq("companyWebsiteId", args.holdId)).take(MOST_PARTS);
    return parts.flatMap((row) => row.decisions);
  },
});

/**
 * Every page's decision now: the website's page list read in parts, joined to
 * the other lists, decided by the rule; last week's specialist verdicts kept
 * where the rule reads a page just the same; and, in the weekly run, the
 * pages left that the rule doesn't simply keep handed to the Page decisions
 * specialist (insights-one-voice-plan.md phase 2). Kept, and the verdicts'
 * counts returned; null when the website is gone.
 */
export async function buildDecisions(ctx: ActionCtx, holdId: Id<"companyWebsites">, specialist?: PageSpecialist): Promise<Record<string, number> | null> {
  const sources = await ctx.runQuery(internal.insightDecisions.decisionSources, { holdId });
  if (!sources) return null;
  const listed: Array<{ path: string; kind: string | null; type: string; clicks: number; title?: string }> = [];
  for (let cursor: string | null = null; ;) {
    const part: { pages: typeof listed; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.insightDecisions.pagesPart, { holdId, cursor });
    listed.push(...part.pages);
    if (part.isDone) break;
    cursor = part.continueCursor;
  }
  const year = new Map(sources.year.map((row) => [row.key, row]));
  const views = sources.views ? new Map(sources.views.map((row) => [row.key, row.views])) : null;
  const consoleBy = new Map(sources.console.map((row) => [row.key, row]));
  const domains = sources.domains ? new Map(sources.domains.map((row) => [row.key, row.domains])) : null;
  let crawl: Map<string, { flags: string[]; inbound: number | null; status: number | null }> | null = null;
  if (sources.crawlPull) {
    crawl = new Map();
    for (let cursor: string | null = null; ;) {
      const part: { pages: Array<{ key: string; flags: string[]; inbound: number | null; status: number | null }>; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.insightDecisions.crawlPart, { pullId: sources.crawlPull, cursor });
      for (const row of part.pages) crawl.set(row.key, row);
      if (part.isDone) break;
      cursor = part.continueCursor;
    }
  }
  const inputs: DecisionInput[] = listed.map((page) => {
    const key = keyOf(page.path);
    const crawled = crawl?.get(key);
    return {
      path: page.path, kind: page.kind, type: page.type,
      visits: year.get(key)?.visits ?? 0, enquiries: year.get(key)?.enquiries ?? 0,
      views: views ? views.get(key) ?? 0 : null,
      shown: consoleBy.get(key)?.shown ?? 0, clicks: consoleBy.get(key)?.clicks ?? page.clicks,
      domains: domains ? domains.get(key) ?? 0 : null,
      flags: crawled?.flags ?? [], inbound: crawled?.inbound ?? null, status: crawled?.status ?? null,
    };
  });
  const byKey = new Map(listed.map((page) => [keyOf(page.path), page.path]));
  const plan = new Map(sources.plan.filter((row) => (PLAN_ACTIONS as readonly string[]).includes(row.action) && byKey.has(row.key)).map((row) => [byKey.get(row.key)!, row.action as PlanAction]));
  const competing = new Map(sources.competing.filter((row) => byKey.has(row.key)).map((row) => [byKey.get(row.key)!, { decision: row.decision, owner: row.owner, why: row.why, decidedBy: row.decidedBy }]));
  const reviews = new Map(sources.reviews.filter((row) => byKey.has(row.key)).map((row) => [byKey.get(row.key)!, row.verdict]));
  const decisions = pageDecisionsFrom(inputs, { plan, competing, reviews });
  // The rule's reading of each page, and last week's specialist verdicts where it reads the page just the same.
  for (const decision of decisions) Object.assign(decision, { signature: pageReading(decision), decidedBy: decision.decidedBy ?? "RULE" });
  const before = new Map((await ctx.runQuery(internal.insightDecisions.keptDecisions, { holdId })).map((decision) => [decision.path, decision]));
  const carried = carryPages(decisions, before);
  if (specialist) await handToSpecialist(ctx, specialist, decisions, new Map(listed.flatMap((page) => (page.title ? [[page.path, page.title] as const] : []))), carried);
  await ctx.runMutation(internal.insightDecisions.saveDecisions, { holdId, decisions: decisions.slice(0, MOST_DECISIONS_KEPT), creates: sources.creates, pages: decisions.length });
  const counts: Record<string, number> = {};
  for (const decision of decisions) counts[decision.verdict] = (counts[decision.verdict] ?? 0) + 1;
  return { ...counts, CREATE: sources.creates.length };
}

/**
 * The Head of Strategy hands the Page decisions specialist the pages the rule
 * doesn't simply keep, those Keyword cannibalisation hasn't decided and last
 * week's verdicts don't cover, the most used first; its answer is put on them
 * within the guards (`applyPageAnswer`), and the run's log says what went to
 * whom. A failed or refused answer leaves the rule's verdicts, said so.
 */
async function handToSpecialist(ctx: ActionCtx, specialist: PageSpecialist, decisions: PageDecision[], titles: ReadonlyMap<string, string>, carried: number) {
  const { run, member, rules, week } = specialist;
  const handed = pagesToHand(decisions);
  const log = async (detail: string, failed: boolean) => await ctx.runMutation(internal.roleRuns.logRunLine, { runId: run.runId, companyId: run.companyId, heading: "Page decisions specialist", detail: detail.slice(0, 900), failed });
  const said = `Head of Strategy → Page decisions specialist: ${handed.length} pages${carried > 0 ? `, ${carried} more kept as it decided them last week` : ""}.`;
  if (handed.length === 0) return await log(said, false);
  try {
    const system = [rules, briefFor(PAGE_DECISIONS_ROLE, member?.instructions), PAGE_ANSWER].filter(Boolean).join("\n\n");
    const prompt = JSON.stringify({ website: run.host, pages: pagesInputOf(handed, titles) });
    const answer = await ask(ctx, run, member, "the Page decisions specialist", system, prompt);
    const applied = applyPageAnswer(handed, answer, new Set(decisions.map((decision) => decision.path)), week);
    await log(`${said} It kept ${applied.kept}, changed ${applied.changed}${applied.refused > 0 ? `, and ${applied.refused} of its answers broke a guard or gave no reason, so the rule's verdict stands for them` : ""}.`, false);
  } catch (error) {
    await log(`${said} Not reached, so the rule's verdicts stand: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

/** For the weekly run, after the week is saved: every page decided, the specialist's pages handed it, and the run's log saying how many of each. */
export async function decideForRun(ctx: ActionCtx, run: InsightsRunArgs, week: string, rules: string, member: TeamMember | undefined): Promise<void> {
  try {
    const counts = await buildDecisions(ctx, run.holdId, { run, member, rules, week });
    const detail = counts ? Object.entries(counts).map(([verdict, count]) => `${verdict.toLowerCase()} ${count}`).join(", ") : "The website is gone.";
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: run.runId, companyId: run.companyId, heading: "Page decisions", detail, failed: !counts });
  } catch (error) {
    await ctx.runMutation(internal.roleRuns.logRunLine, { runId: run.runId, companyId: run.companyId, heading: "Page decisions", detail: error instanceof Error ? error.message.slice(0, 500) : "Could not decide.", failed: true });
  }
}

/** To decide every page again now, without a weekly run. */
export const decideNow = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.record(v.string(), v.number())),
  handler: async (ctx, args) => await buildDecisions(ctx, args.holdId),
});

/** The decisions kept, the last run's replaced: in parts a screen reads whole. */
export const saveDecisions = internalMutation({
  args: { holdId: v.id("companyWebsites"), decisions: v.array(decisionValidator), creates: v.array(createValidator), pages: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return null;
    const old = await ctx.db.query("insightPageDecisions").withIndex("by_hold_part", (q) => q.eq("companyWebsiteId", args.holdId)).take(MOST_PARTS + 4);
    for (const row of old) await ctx.db.delete(row._id);
    const now = Date.now();
    const parts = Math.max(1, Math.ceil(args.decisions.length / PER_PART));
    for (let part = 0; part < Math.min(parts, MOST_PARTS); part += 1) {
      await ctx.db.insert("insightPageDecisions", {
        companyId: hold.companyId, companyWebsiteId: args.holdId, part,
        decisions: args.decisions.slice(part * PER_PART, (part + 1) * PER_PART),
        ...(part === 0 ? { creates: args.creates, pages: args.pages } : {}),
        createdAt: now,
      });
    }
    return null;
  },
});

/** The website a company-wide read shows: the one chosen, or its first owned website holding decisions. */
async function siteFor(ctx: SiteReader, siteId: Id<"companyWebsites"> | undefined): Promise<{ hold: Doc<"companyWebsites">; host: string } | null> {
  if (!ctx.companyId) return null;
  if (siteId) await requireMySite(ctx, siteId);
  const owned = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED" && (!siteId || entry.hold._id === siteId));
  for (const entry of owned) {
    const any = await ctx.db.query("insightPageDecisions").withIndex("by_hold_part", (q) => q.eq("companyWebsiteId", entry.hold._id)).first();
    if (any) return { hold: entry.hold, host: entry.summary.host };
  }
  return owned[0] ? { hold: owned[0].hold, host: owned[0].summary.host } : null;
}

/** Page decisions: every page's verdict, and the pages to create. */
export const insightsPageDecisions = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    decidedAt: v.union(v.number(), v.null()),
    pages: v.number(),
    decisions: v.array(decisionValidator),
    creates: v.array(createValidator),
  })),
  handler: async (ctx, args) => {
    const site = await siteFor(ctx, args.siteId);
    if (!site) return null;
    const parts = await ctx.db.query("insightPageDecisions").withIndex("by_hold_part", (q) => q.eq("companyWebsiteId", site.hold._id)).take(MOST_PARTS);
    const first = parts.find((row) => row.part === 0);
    const decisions: PageDecision[] = [...parts].sort((a, b) => a.part - b.part).flatMap((row) => row.decisions);
    const creates: PageToCreate[] = first?.creates ?? [];
    return { siteId: site.hold._id, host: site.host, decidedAt: first?.createdAt ?? null, pages: first?.pages ?? decisions.length, decisions, creates };
  },
});
