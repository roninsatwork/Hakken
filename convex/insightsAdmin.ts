import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminQuery } from "./tenantFunctions";
import { INSIGHT_SPECIALISTS } from "./utils/insightTeam";

/**
 * Admin → Insights (docs/plans/active/insights-analyst-plan.md §4.3): each
 * website's weekly run — what it read, what it found, what the Editor sent
 * back and why, and what it cost — and the patterns, where each fired and
 * how often it held. Super admins only.
 */

/** Weeks listed at most: the newest, a page at a time on the screen. */
const MOST_WEEKS = 300;
/** Findings read when counting the patterns: the newest. */
const MOST_FINDINGS = 900;

const weekRow = v.object({
  weekId: v.id("insightWeeks"),
  company: v.string(),
  host: v.string(),
  week: v.string(),
  verdict: v.string(),
  published: v.number(),
  sentBack: v.number(),
  facts: v.number(),
  problems: v.number(),
  costUsd: v.number(),
  runId: v.union(v.id("agentRuns"), v.null()),
  agentId: v.union(v.id("agents"), v.null()),
  createdAt: v.number(),
});

export const insightWeeksList = superAdminQuery({
  args: {},
  returns: v.array(weekRow),
  handler: async (ctx) => {
    const weeks = await ctx.db.query("insightWeeks").withIndex("by_created").order("desc").take(MOST_WEEKS);
    const names = new Map<Id<"companies">, string>();
    const hosts = new Map<Id<"companyWebsites">, string>();
    const out: Array<typeof weekRow.type> = [];
    for (const week of weeks) {
      if (!names.has(week.companyId)) names.set(week.companyId, (await ctx.db.get(week.companyId))?.name ?? "");
      if (!hosts.has(week.companyWebsiteId)) hosts.set(week.companyWebsiteId, await hostOf(ctx, week.companyWebsiteId));
      const run = week.runId ? await ctx.db.get(week.runId) : null;
      out.push({
        weekId: week._id,
        company: names.get(week.companyId) ?? "",
        host: hosts.get(week.companyWebsiteId) ?? "",
        week: week.week,
        verdict: week.verdict,
        published: week.published,
        sentBack: week.sentBack,
        facts: week.sources.reduce((sum, source) => sum + source.facts, 0),
        problems: week.problems.length,
        costUsd: week.costUsd,
        runId: week.runId ?? null,
        agentId: run?.agentId ?? null,
        createdAt: week.createdAt,
      });
    }
    return out;
  },
});

async function hostOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">): Promise<string> {
  const hold = await ctx.db.get(holdId);
  if (!hold) return "";
  const website = await ctx.db.get(hold.websiteId);
  return website?.displayHost ?? website?.host ?? "";
}

const findingRow = v.object({
  findingId: v.id("insightFindings"),
  rank: v.number(),
  status: v.union(v.literal("PUBLISHED"), v.literal("SENT_BACK")),
  specialist: v.string(),
  pattern: v.string(),
  sure: v.string(),
  headline: v.string(),
  story: v.string(),
  action: v.string(),
  howWeKnow: v.string(),
  ruledOut: v.array(v.string()),
  sources: v.array(v.string()),
  editorNote: v.union(v.string(), v.null()),
  checkOn: v.union(v.string(), v.null()),
});

export const insightWeekDetail = superAdminQuery({
  args: { weekId: v.id("insightWeeks") },
  returns: v.union(v.null(), v.object({
    company: v.string(),
    host: v.string(),
    week: v.string(),
    verdict: v.string(),
    sources: v.array(v.object({ source: v.string(), facts: v.number() })),
    problems: v.array(v.string()),
    costUsd: v.number(),
    runId: v.union(v.id("agentRuns"), v.null()),
    agentId: v.union(v.id("agents"), v.null()),
    findings: v.array(findingRow),
  })),
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.weekId);
    if (!week) return null;
    const findings = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", week.companyWebsiteId).eq("week", week.week)).take(60);
    const run = week.runId ? await ctx.db.get(week.runId) : null;
    return {
      company: (await ctx.db.get(week.companyId))?.name ?? "",
      host: await hostOf(ctx, week.companyWebsiteId),
      week: week.week,
      verdict: week.verdict,
      sources: week.sources,
      problems: week.problems,
      costUsd: week.costUsd,
      runId: week.runId ?? null,
      agentId: run?.agentId ?? null,
      findings: findings
        .sort((a, b) => (a.status === b.status ? a.rank - b.rank : a.status === "PUBLISHED" ? -1 : 1))
        .map((finding) => ({
          findingId: finding._id,
          rank: finding.rank,
          status: finding.status,
          specialist: finding.specialist,
          pattern: finding.pattern,
          sure: finding.sure,
          headline: finding.headline,
          story: finding.story,
          action: finding.action,
          howWeKnow: finding.howWeKnow,
          ruledOut: finding.ruledOut,
          sources: finding.sources,
          editorNote: finding.editorNote ?? null,
          checkOn: finding.checkOn ?? null,
        })),
    };
  },
});

const patternRow = v.object({
  pattern: v.string(),
  specialist: v.string(),
  fired: v.number(),
  published: v.number(),
  sentBack: v.number(),
  websites: v.number(),
  right: v.number(),
  wrong: v.number(),
  lastWeek: v.string(),
});

/** Every pattern that has fired, newest findings counted: how often, where, and how it held up (I15). */
export const insightPatterns = superAdminQuery({
  args: {},
  returns: v.array(patternRow),
  handler: async (ctx) => {
    const findings = await ctx.db.query("insightFindings").order("desc").take(MOST_FINDINGS);
    const rows = new Map<string, typeof patternRow.type & { holds: Set<string> }>();
    for (const finding of findings) {
      const key = `${finding.specialist}:${finding.pattern}`;
      const row = rows.get(key) ?? { pattern: finding.pattern, specialist: finding.specialist, fired: 0, published: 0, sentBack: 0, websites: 0, right: 0, wrong: 0, lastWeek: finding.week, holds: new Set<string>() };
      row.fired += 1;
      if (finding.status === "PUBLISHED") row.published += 1;
      else row.sentBack += 1;
      if (finding.outcome === "RIGHT") row.right += 1;
      if (finding.outcome === "WRONG") row.wrong += 1;
      row.holds.add(finding.companyWebsiteId);
      if (finding.week > row.lastWeek) row.lastWeek = finding.week;
      rows.set(key, row);
    }
    const order = (specialist: string) => (INSIGHT_SPECIALISTS as readonly string[]).indexOf(specialist);
    return [...rows.values()]
      .map(({ holds, ...row }) => ({ ...row, websites: holds.size }))
      .sort((a, b) => order(a.specialist) - order(b.specialist) || b.fired - a.fired);
  },
});
