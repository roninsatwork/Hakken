import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { marketFacts } from "./insightsReading";
import { LEAGUE_IDS, leaguesFrom } from "./utils/insightLeagues";
import { factValidator } from "./utils/insightFacts";
import { REPORT_KINDS, reportBodyValidator, weekSummaryValidator } from "./utils/insightSummary";

/**
 * What the Insights screens read (docs/plans/active/insights-analyst-plan.md
 * §4.1): the company's own websites, read the way an agency would, with a
 * filter for one. Screens do no work when they open beyond what each reads
 * here (§8): the team's saved findings and weeks, and for the leaderboards the
 * history Hakken already keeps, read once. Only the caller's own company.
 */

const siteValidator = v.object({ siteId: v.id("companyWebsites"), host: v.string() });

/** Two years of weeks (I7): the most a website keeps. */
const MOST_WEEKS_KEPT = 110;

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
    // The menu's numbers from the weeks' own counts, never the findings themselves (phase 2b).
    const weeks = await ctx.db.query("insightWeeks").withIndex("by_company_week", (q) => q.eq("companyId", ctx.companyId!)).order("desc").take(MOST_WEEKS_KEPT);
    const latestWeek = weeks[0]?.week ?? null;
    const thisWeek = weeks.filter((week) => week.week === latestWeek).reduce((sum, week) => sum + week.published, 0);
    const findings = weeks.reduce((sum, week) => sum + week.published, 0);
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
    // Open: every finding published in the weeks kept, from the weeks' own counts (phase 2b).
    let open = 0;
    for (const site of sites) {
      open += (await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", site.hold._id)).order("desc").take(MOST_WEEKS_KEPT))
        .reduce((sum, week) => sum + week.published, 0);
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

// ---------------------------------------------------------------------------
// Reports (§4.1: Reports, Your month; §4.2: the board report)

const reportRow = v.object({
  reportId: v.id("insightReports"),
  siteId: v.id("companyWebsites"),
  host: v.string(),
  kind: v.union(...REPORT_KINDS.map((kind) => v.literal(kind))),
  title: v.string(),
  period: v.string(),
  from: v.string(),
  to: v.string(),
  status: v.union(v.literal("WRITTEN"), v.literal("READ")),
  createdAt: v.number(),
});

/** Every report Hakken has written for the company, newest first, kept two years (I7). */
export const insightsReports = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.array(reportRow),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    const hosts = new Map(sites.map((site) => [site.hold._id, site.host]));
    if (!ctx.companyId) return [];
    const reports = await ctx.db.query("insightReports").withIndex("by_company_created", (q) => q.eq("companyId", ctx.companyId!)).order("desc").take(400);
    return reports
      .filter((report) => hosts.has(report.companyWebsiteId))
      .map((report) => ({
        reportId: report._id,
        siteId: report.companyWebsiteId,
        host: hosts.get(report.companyWebsiteId) ?? "",
        kind: report.kind,
        title: report.title,
        period: report.period,
        from: report.from,
        to: report.to,
        status: report.status,
        createdAt: report.createdAt,
      }));
  },
});

const reportView = v.object({
  reportId: v.id("insightReports"),
  host: v.string(),
  company: v.string(),
  kind: v.union(...REPORT_KINDS.map((kind) => v.literal(kind))),
  title: v.string(),
  period: v.string(),
  from: v.string(),
  to: v.string(),
  status: v.union(v.literal("WRITTEN"), v.literal("READ")),
  createdAt: v.number(),
  body: reportBodyValidator,
});

async function viewOf(ctx: SiteReader, report: Doc<"insightReports">): Promise<typeof reportView.type | null> {
  if (report.companyId !== ctx.companyId) return null;
  const site = await requireMySite(ctx, report.companyWebsiteId);
  const company = await ctx.db.get(report.companyId);
  return {
    reportId: report._id,
    host: site.website.displayHost ?? site.website.host,
    company: company?.name ?? "",
    kind: report.kind,
    title: report.title,
    period: report.period,
    from: report.from,
    to: report.to,
    status: report.status,
    createdAt: report.createdAt,
    body: report.body,
  };
}

/** One report, exactly as written. */
export const insightsReport = tenantQuery({
  args: { reportId: v.id("insightReports") },
  returns: v.union(v.null(), reportView),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    return report ? await viewOf(ctx, report) : null;
  },
});

/** The newest report of a kind: Your month's monthly report, the executive summary's board report. */
export const insightsLatestReport = tenantQuery({
  args: { kind: v.union(...REPORT_KINDS.map((kind) => v.literal(kind))), siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), reportView),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    let newest: Doc<"insightReports"> | null = null;
    for (const site of sites) {
      const report = (await ctx.db.query("insightReports").withIndex("by_hold_kind_period", (q) => q.eq("companyWebsiteId", site.hold._id).eq("kind", args.kind)).order("desc").first());
      if (report && (!newest || report.createdAt > newest.createdAt)) newest = report;
    }
    return newest ? await viewOf(ctx, newest) : null;
  },
});

/** A report read: its status says so (§4.1, Reports' Written and Read). Any member of the company. */
export const markInsightReportRead = tenantMutation({
  args: { reportId: v.id("insightReports") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report || report.companyId !== ctx.companyId || report.status === "READ") return null;
    await ctx.db.patch(report._id, { status: "READ", readAt: Date.now() });
    return null;
  },
});
