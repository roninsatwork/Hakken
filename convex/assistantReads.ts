import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { companyHolds, type SiteReader } from "./siteAccess";
import { readMySite } from "./sites";
import { readMentions } from "./siteAi";
import { readPerformance } from "./searchConsoleReads";
import { readList } from "./searchConsoleLists";
import { shiftDay } from "./searchConsoleDays";
import { readWebsiteHost } from "./websiteIdentity";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * The company's own figures, as the Assistant reads them
 * (docs/plans/active/assistant-foundation-plan.md, item 7).
 *
 * Each read here calls the very function its screen calls — the Sites
 * overview's, Performance's, Pages', Mentions' — so a figure in an answer is
 * the figure on the screen, and each answer carries the screen's address so
 * anyone can check it. The company is the conversation's, passed in by the
 * tool runtime and never anything the model wrote; the website is found among
 * that company's own holds by its address, and one the company does not hold
 * answers as missing, exactly as an address typed into the screens does.
 */

const companyArg = { companyId: v.id("companies") };

/** The days the Assistant reads Search Console over: the screens' ready-made periods. */
export const ASSISTANT_PERIODS = [7, 30, 90] as const;

/**
 * A website as written — `https://www.Example.co.uk/page`, `example.co.uk` —
 * reduced to the bare host it is stored under, the way Websites reads one
 * (`readWebsiteHost`), or by stripping the scheme, `www.` and the path where
 * that reader declines the form.
 */
function bareHost(website: string): string {
  const read = readWebsiteHost(website);
  if (read.ok) return read.host;
  return website.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].replace(/\.$/, "");
}

/** What a model's website looks like once read: one of the company's own holds, or why there is none. */
export async function holdFor(ctx: Pick<QueryCtx, "db">, companyId: Id<"companies">, website: string) {
  const host = bareHost(website);
  const holds = await companyHolds(ctx, companyId);
  const held = holds.find((entry) => entry.website.host === host);
  if (!held) {
    return {
      problem: `${host || website} is not one of this company's websites. Its websites are: ${holds.map((entry) => entry.summary.host).join(", ") || "none yet"}.`,
    } as const;
  }
  return { held } as const;
}

const reader = (ctx: Pick<QueryCtx, "db">, companyId: Id<"companies">): SiteReader => ({ db: ctx.db, companyId });

/** The company's websites — its own, and the competitors each is measured against. */
export const websitesInternal = internalQuery({
  args: companyArg,
  handler: async (ctx, args) => {
    const holds = await companyHolds(ctx, args.companyId);
    return {
      websites: holds.map((entry) => ({
        website: entry.summary.host,
        kind: entry.summary.relationship === "OWNED" ? "the company's own" : `a competitor of ${entry.summary.ofHost ?? "the company"}`,
        link: `/app/sites/${entry.summary.siteId}`,
      })),
    };
  },
});

/** A website's headline figures, from the Sites overview's own read. */
export const siteOverviewInternal = internalQuery({
  args: { ...companyArg, website: v.string() },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem };
    const site = await readMySite(reader(ctx, args.companyId), found.held.hold._id);
    if (!site) return { ok: false, problem: "That website is not one this company holds." };
    return {
      ok: true,
      website: site.host,
      checkedOn: site.latestDay,
      searchesRankedFor: site.counts.keywords,
      pagesRanking: site.counts.pages,
      inGooglesTopThree: site.counts.top3,
      linkingWebsites: site.counts.referringDomains,
      searchesGainedSinceLastCheck: site.counts.rankedUp,
      searchesLostSinceLastCheck: site.counts.rankedDown,
      aiAnswersNamingIt: site.counts.aiNamed,
      aiAnswersAsked: site.counts.aiAsked,
      link: `/app/sites/${site.siteId}`,
    };
  },
});

/**
 * A website's Search Console figures over the last 7, 30 or 90 days held,
 * with the same days before — the whole website from Performance's read, or
 * one page from the Pages list's.
 */
export const searchConsoleInternal = internalQuery({
  args: {
    ...companyArg,
    website: v.string(),
    days: v.union(v.literal(7), v.literal(30), v.literal(90)),
    page: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem };
    const hold = found.held.hold;
    // Google gives a website's Search Console figures to its owner only, so a
    // competitor has none — said as that, not as "not connected", which
    // would read as something broken.
    if (isTrackedHold(hold)) {
      return {
        ok: false,
        problem: `Search Console covers the company's own websites only: Google gives those figures to a website's owner, and ${found.held.summary.host} is a competitor. Its rankings, linking websites and AI answers can still be read: from its Sites overview and its AI answers.`,
      };
    }
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id))
      .first();
    if (!connection?.newestDay) {
      return { ok: false, problem: `${found.held.summary.host} has no Search Console figures yet: it is not connected, or its first collection has not finished.` };
    }
    const to = connection.newestDay;
    const from = shiftDay(to, -(args.days - 1));
    const link = `/app/search-console/${hold._id}${args.page ? "/pages" : ""}`;

    if (args.page) {
      const list = await readList(ctx, hold._id, { searchType: "web", dimension: "page", from, to, q: args.page });
      const rows = list.rows.slice(0, 5).map((row) => ({
        page: row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        clickThroughRate: row.ctr,
        averagePosition: row.position,
        clicksTheDaysBefore: row.previousClicks,
      }));
      return {
        ok: true,
        website: found.held.summary.host,
        from,
        to,
        pagesMatching: rows,
        note: list.preparing ? "Search Console's figures are still being added up for these days." : undefined,
        link,
      };
    }

    const performance = await readPerformance(reader(ctx, args.companyId), { siteId: hold._id, searchType: "web", from, to });
    return {
      ok: true,
      website: found.held.summary.host,
      from,
      to,
      totals: performance.totals,
      theDaysBefore: performance.previous,
      byDay: performance.days,
      link,
    };
  },
});

/** How each AI engine treats a website on each tracked question, from the Mentions screen's read. */
export const aiMentionsInternal = internalQuery({
  args: { ...companyArg, website: v.string(), question: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem };
    const rows = await readMentions(reader(ctx, args.companyId), found.held.hold._id);
    const wanted = args.question?.trim().toLowerCase();
    const matching = wanted ? rows.filter((row) => row.prompt.toLowerCase().includes(wanted)) : rows;
    return {
      ok: true,
      website: found.held.summary.host,
      questionsTracked: new Set(rows.map((row) => row.prompt)).size,
      answers: matching.slice(0, 40).map((row) => ({
        question: row.prompt,
        engine: row.engine,
        latest: row.lastStance,
        timesAsked: row.asked,
        timesNamed: row.named,
        timesRecommended: row.recommended,
        timesWarnedAgainst: row.warnedAgainst,
        lastAsked: row.lastAskedDay,
      })),
      link: `/app/sites/${found.held.hold._id}/ai/mentions`,
    };
  },
});

/** The company's open tasks, as the Tasks screen lists them. */
export const openTasksInternal = internalQuery({
  args: companyArg,
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId).eq("status", "OPEN"))
      .order("asc")
      .take(25);
    const people = new Map<Id<"users">, Doc<"users"> | null>();
    for (const task of open) {
      if (task.assigneeUserId && !people.has(task.assigneeUserId)) people.set(task.assigneeUserId, await ctx.db.get(task.assigneeUserId));
    }
    return {
      tasks: open.map((task) => ({
        title: task.title,
        ...(task.detail ? { detail: task.detail.slice(0, 300) } : {}),
        assignedTo: task.assigneeUserId ? people.get(task.assigneeUserId)?.name ?? "someone in the company" : "nobody yet",
        ...(task.dueAt ? { due: new Date(task.dueAt).toISOString().slice(0, 10) } : {}),
      })),
      link: "/app/tasks",
    };
  },
});
