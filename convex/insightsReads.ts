import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { marketFacts } from "./insightsReading";
import { LEAGUE_IDS, leaguesFrom } from "./utils/insightLeagues";
import { factValidator } from "./utils/insightFacts";
import { weekSummaryValidator } from "./utils/insightSummary";

/**
 * What the Insights screens read (docs/plans/active/insights-analyst-plan.md
 * §4.1): the company's own websites, read the way an agency would, with a
 * filter for one. Screens do no work when they open beyond what each reads
 * here (§8): the team's saved findings and weeks, and for the leaderboards the
 * history Hakken already keeps, read once. Only the caller's own company.
 */

const siteValidator = v.object({ siteId: v.id("companyWebsites"), host: v.string() });

/** The section's frame: the company, its own websites, when the team last looked, and the menu's numbers. */
export const insightsHome = tenantQuery({
  args: {},
  returns: v.union(v.null(), v.object({
    company: v.string(),
    sites: v.array(siteValidator),
    lastLooked: v.union(v.number(), v.null()),
    thisWeek: v.number(),
    findings: v.number(),
  })),
  handler: async (ctx) => {
    if (!ctx.companyId) return null;
    const company = await ctx.db.get(ctx.companyId);
    const holds = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
    const weeks = await ctx.db.query("insightWeeks").withIndex("by_company_week", (q) => q.eq("companyId", ctx.companyId!)).order("desc").take(10);
    const latestWeek = weeks[0]?.week ?? null;
    const thisWeek = latestWeek
      ? (await ctx.db.query("insightFindings").withIndex("by_company_week", (q) => q.eq("companyId", ctx.companyId!).eq("week", latestWeek)).take(100)).filter((finding) => finding.status === "PUBLISHED").length
      : 0;
    const findings = (await ctx.db.query("insightFindings").withIndex("by_company_week", (q) => q.eq("companyId", ctx.companyId!)).order("desc").take(500)).filter((finding) => finding.status === "PUBLISHED").length;
    return {
      company: company?.name ?? "",
      sites: holds.map((entry) => ({ siteId: entry.hold._id, host: entry.summary.host })),
      lastLooked: weeks.reduce<number | null>((newest, week) => (newest === null || week.createdAt > newest ? week.createdAt : newest), null),
      thisWeek,
      findings,
    };
  },
});

/** The website a screen reads: the one chosen, or the company's first own website. */
async function chosenSite(ctx: SiteReader, siteId: Id<"companyWebsites"> | undefined): Promise<Doc<"companyWebsites"> | null> {
  if (siteId) return (await requireMySite(ctx, siteId)).hold;
  if (!ctx.companyId) return null;
  const owned = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
  return owned[0]?.hold ?? null;
}

const rowValidator = v.object({
  name: v.string(),
  you: v.boolean(),
  value: v.number(),
  before: v.union(v.number(), v.null()),
  place: v.number(),
  placeBefore: v.union(v.number(), v.null()),
  share: v.union(v.number(), v.null()),
});

const leagueValidator = v.object({
  id: v.union(...LEAGUE_IDS.map((id) => v.literal(id))),
  main: v.boolean(),
  rows: v.array(rowValidator),
  place: v.union(v.number(), v.null()),
  placeBefore: v.union(v.number(), v.null()),
  gapAbove: v.union(v.number(), v.null()),
});

/**
 * The leaderboards (§5): every league for one website and its rivals, from
 * the same facts the team reads, with each place a year before where Hakken
 * holds it. The figures' newest day, for the screen to say.
 */
export const insightsLeagues = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    rivals: v.number(),
    asOf: v.union(v.string(), v.null()),
    leagues: v.array(leagueValidator),
  })),
  handler: async (ctx, args) => {
    const hold = await chosenSite(ctx, args.siteId);
    if (!hold) return null;
    const website = await ctx.db.get(hold.websiteId);
    const host = website?.displayHost ?? website?.host ?? "";
    const facts = await marketFacts(ctx, hold);
    const leagues = leaguesFrom(facts, host);
    const asOf = facts.filter((fact) => fact.key.startsWith(`seo.${host}.`) && fact.key.endsWith(".now")).map((fact) => fact.to ?? "").sort().at(-1) ?? null;
    return {
      siteId: hold._id,
      host,
      rivals: Math.max(0, new Set(facts.map((fact) => /^seo\.(.+)\.traffic\.now$/.exec(fact.key)?.[1]).filter(Boolean)).size - 1),
      asOf,
      leagues,
    };
  },
});

// ---------------------------------------------------------------------------
// Findings and weeks (§4.1: This week, All findings, A finding, the executive summary)

const findingRow = v.object({
  findingId: v.id("insightFindings"),
  siteId: v.id("companyWebsites"),
  host: v.string(),
  week: v.string(),
  rank: v.number(),
  specialist: v.string(),
  pattern: v.string(),
  headline: v.string(),
  action: v.string(),
  sure: v.string(),
  sources: v.array(v.string()),
  atStake: v.union(v.number(), v.null()),
  ruledOut: v.number(),
  isNew: v.boolean(),
  outcome: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

/** The company's own websites, or the one chosen, with their hosts. */
async function sitesFor(ctx: SiteReader, siteId: Id<"companyWebsites"> | undefined): Promise<Array<{ hold: Doc<"companyWebsites">; host: string }>> {
  if (!ctx.companyId) return [];
  const owned = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
  if (siteId) await requireMySite(ctx, siteId);
  return owned.filter((entry) => !siteId || entry.hold._id === siteId).map((entry) => ({ hold: entry.hold, host: entry.summary.host }));
}

/** Each website's newest week. */
async function newestWeeks(ctx: SiteReader, sites: Array<{ hold: Doc<"companyWebsites">; host: string }>) {
  const out: Array<{ week: Doc<"insightWeeks">; host: string }> = [];
  for (const site of sites) {
    const week = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", site.hold._id)).order("desc").first();
    if (week) out.push({ week, host: site.host });
  }
  return out;
}

function rowOf(finding: Doc<"insightFindings">, host: string, newest: string | null): typeof findingRow.type {
  return {
    findingId: finding._id,
    siteId: finding.companyWebsiteId,
    host,
    week: finding.week,
    rank: finding.rank,
    specialist: finding.specialist,
    pattern: finding.pattern,
    headline: finding.headline,
    action: finding.action,
    sure: finding.sure,
    sources: finding.sources,
    atStake: finding.atStake ?? null,
    ruledOut: finding.ruledOut.length,
    isNew: finding.week === newest,
    outcome: finding.outcome ?? null,
    createdAt: finding.createdAt,
  };
}

const weekView = v.object({
  siteId: v.id("companyWebsites"),
  host: v.string(),
  week: v.string(),
  verdict: v.string(),
  createdAt: v.number(),
  checked: v.number(),
  ruledOut: v.number(),
  sources: v.array(v.object({ source: v.string(), facts: v.number() })),
  summary: v.union(weekSummaryValidator, v.null()),
});

/** This week: each website's newest week and its published findings, most at stake first (§4.1). */
export const insightsThisWeek = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.object({ weeks: v.array(weekView), findings: v.array(findingRow), open: v.number() }),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    const weeks = await newestWeeks(ctx, sites);
    const findings: Array<typeof findingRow.type> = [];
    for (const { week, host } of weeks) {
      const rows = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", week.companyWebsiteId).eq("week", week.week)).take(60);
      findings.push(...rows.filter((row) => row.status === "PUBLISHED").map((row) => rowOf(row, host, week.week)));
    }
    let open = 0;
    for (const site of sites) {
      open += (await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", site.hold._id)).order("desc").take(300))
        .filter((row) => row.status === "PUBLISHED" && !row.outcome).length;
    }
    return {
      weeks: weeks.map(({ week, host }) => ({
        siteId: week.companyWebsiteId,
        host,
        week: week.week,
        verdict: week.verdict,
        createdAt: week.createdAt,
        checked: week.summary?.checked ?? week.sources.reduce((sum, source) => sum + source.facts, 0),
        ruledOut: week.summary?.ruledOut ?? 0,
        sources: week.sources,
        summary: week.summary ?? null,
      })),
      findings: findings.sort((a, b) => a.rank - b.rank || a.host.localeCompare(b.host)),
      open,
    };
  },
});

/** Every published finding Hakken has written for the company, newest week first (§4.1, All findings). */
export const insightsAllFindings = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.array(findingRow),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    const out: Array<typeof findingRow.type> = [];
    for (const site of sites) {
      const rows = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", site.hold._id)).order("desc").take(500);
      const newest = rows[0]?.week ?? null;
      out.push(...rows.filter((row) => row.status === "PUBLISHED").map((row) => rowOf(row, site.host, newest)));
    }
    return out.sort((a, b) => b.week.localeCompare(a.week) || a.rank - b.rank);
  },
});

/** One finding, the whole case (§4.1, A finding): only the caller's own company's. */
export const insightsFinding = tenantQuery({
  args: { findingId: v.id("insightFindings") },
  returns: v.union(v.null(), v.object({
    findingId: v.id("insightFindings"),
    host: v.string(),
    week: v.string(),
    isNew: v.boolean(),
    specialist: v.string(),
    pattern: v.string(),
    headline: v.string(),
    story: v.string(),
    action: v.string(),
    howWeKnow: v.string(),
    ruledOut: v.array(v.string()),
    sure: v.string(),
    sources: v.array(v.string()),
    facts: v.array(factValidator),
    comparisons: v.array(v.array(v.string())),
    checkOn: v.union(v.string(), v.null()),
    atStake: v.union(v.number(), v.null()),
    outcome: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const finding = await ctx.db.get(args.findingId);
    if (!finding || finding.companyId !== ctx.companyId || finding.status !== "PUBLISHED") return null;
    const site = await requireMySite(ctx, finding.companyWebsiteId);
    const newest = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", finding.companyWebsiteId)).order("desc").first();
    return {
      findingId: finding._id,
      host: site.website.displayHost ?? site.website.host,
      week: finding.week,
      isNew: newest?.week === finding.week,
      specialist: finding.specialist,
      pattern: finding.pattern,
      headline: finding.headline,
      story: finding.story,
      action: finding.action,
      howWeKnow: finding.howWeKnow,
      ruledOut: finding.ruledOut,
      sure: finding.sure,
      sources: finding.sources,
      facts: finding.facts,
      comparisons: finding.comparisons,
      checkOn: finding.checkOn ?? null,
      atStake: finding.atStake ?? null,
      outcome: finding.outcome ?? null,
      createdAt: finding.createdAt,
    };
  },
});
