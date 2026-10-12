import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { marketFacts } from "./insightsReading";
import { LEAGUE_IDS, leaguesFrom } from "./utils/insightLeagues";
import { factValidator } from "./utils/insightFacts";
import { REPORT_KINDS, reportBodyValidator, weekSummaryValidator } from "./utils/insightSummary";
import { serviceValidator } from "./utils/insightStrategy";
import { measurementValidator } from "./utils/insightMeasurement";
import { planValidator } from "./utils/insightPlan";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { DRAFT_AREAS } from "./utils/insightDrafts";
import { conversionsOf, countedOf, readSlot } from "./googleAnalyticsRows";
import { EVERY_DEVICE, slotKey, splitChannelKey } from "./googleAnalyticsLists";
import { loadRivalHolds, loadSite } from "./websiteSiteRows";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { DEFAULT_CLIENT_SCHEDULE } from "./utils/insightTeam";

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
  /** What Hakken does next, for the Executive summary: the changes it has logged, when it reads again, and its next checks. */
  changes: v.number(),
  nextRead: v.union(v.string(), v.null()),
  checks: v.array(v.object({ day: v.string(), count: v.number() })),
});

/** Checks to come shown at most: the next two days a finding is checked on. */
const CHECKS_SHOWN = 2;
/** Changes counted at most for "keeps the log of N changes". */
const CHANGES_COUNTED = 100;
/** Findings read at most for them: the next few due, never the whole history. */
const CHECKS_READ = 15;

/** When Hakken reads a website again, by its company's own Insights schedule; null when switched off. */
async function nextReadOf(ctx: SiteReader, week: Doc<"insightWeeks">): Promise<string | null> {
  const schedule = (await ctx.db.get(week.companyId))?.insightsSchedule;
  if (schedule && !schedule.isActive) return null;
  const next = getNextWorkflowScheduleRunAt({ intervalStr: schedule?.intervalStr ?? DEFAULT_CLIENT_SCHEDULE, now: new Date(week.createdAt) });
  return next ? new Date(next).toISOString().slice(0, 10) : null;
}

/** The next days Hakken checks whether findings proved right, with how many it checks on each. */
async function checksOf(ctx: SiteReader, holdId: Id<"companyWebsites">): Promise<Array<{ day: string; count: number }>> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await ctx.db.query("insightFindings").withIndex("by_hold_check", (q) => q.eq("companyWebsiteId", holdId).eq("status", "PUBLISHED").gte("checkOn", today)).take(CHECKS_READ);
  const days = new Map<string, number>();
  for (const row of rows) {
    if (row.outcome || !row.checkOn) continue;
    days.set(row.checkOn, (days.get(row.checkOn) ?? 0) + 1);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, CHECKS_SHOWN).map(([day, count]) => ({ day, count }));
}

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
    const extras: Array<{ changes: number; nextRead: string | null; checks: Array<{ day: string; count: number }> }> = [];
    for (const { week } of weeks) {
      extras.push({
        changes: (await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", week.companyWebsiteId)).take(CHANGES_COUNTED)).length,
        nextRead: await nextReadOf(ctx, week),
        checks: await checksOf(ctx, week.companyWebsiteId),
      });
    }
    return {
      weeks: weeks.map(({ week, host }, index) => ({
        siteId: week.companyWebsiteId,
        host,
        week: week.week,
        verdict: week.verdict,
        createdAt: week.createdAt,
        checked: week.summary?.checked ?? week.sources.reduce((sum, source) => sum + source.facts, 0),
        ruledOut: week.summary?.ruledOut ?? 0,
        sources: week.sources,
        summary: week.summary ?? null,
        ...extras[index],
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

// ---------------------------------------------------------------------------
// Strategy and a service (§4.1, drawn as the Strategy and ServiceDetail boards)

/** The quarter's strategy: each service and its call from the newest week, and the roadmap — the week's three findings most at stake. */
export const insightsStrategy = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    week: v.string(),
    verdict: v.string(),
    services: v.array(serviceValidator),
    roadmap: v.array(v.object({ findingId: v.id("insightFindings"), action: v.string(), expect: v.string(), howWeKnow: v.string(), checkOn: v.union(v.string(), v.null()) })),
  })),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    const [newest] = await newestWeeks(ctx, sites.slice(0, 1));
    if (!newest) return null;
    const findings = (await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", newest.week.companyWebsiteId).eq("week", newest.week.week)).take(60))
      .filter((finding) => finding.status === "PUBLISHED")
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3);
    return {
      siteId: newest.week.companyWebsiteId,
      host: newest.host,
      week: newest.week.week,
      verdict: newest.week.verdict,
      services: newest.week.summary?.services ?? [],
      roadmap: findings.map((finding) => ({ findingId: finding._id, action: finding.action, expect: finding.headline, howWeKnow: finding.howWeKnow, checkOn: finding.checkOn ?? null })),
    };
  },
});

/** Searches a service's page is listed at most. */
const SERVICE_SEARCHES = 15;

/** One service: its figures from the newest week, the searches its page ranks for, and the best rival on each (DataForSEO's rankings, §5). */
export const insightsService = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")), page: v.string() },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    service: serviceValidator,
    siteClicks: v.union(v.number(), v.null()),
    searches: v.array(v.object({ keyword: v.string(), volume: v.number(), position: v.union(v.number(), v.null()), rival: v.union(v.string(), v.null()), rivalPosition: v.union(v.number(), v.null()) })),
  })),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    const [newest] = await newestWeeks(ctx, sites.slice(0, 1));
    const service = newest?.week.summary?.services?.find((entry) => entry.page === args.page);
    if (!newest || !service) return null;
    const site = await loadSite(ctx, newest.week.companyWebsiteId);
    if (!site) return null;
    const own = service.kind === "GUIDES"
      ? []
      : await ctx.db.query("siteKeywordRanks").withIndex("by_site_page_band_position", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("page", service.page)).take(300);
    const rivals = await loadRivalHolds(ctx, site);
    const rivalSites = await Promise.all(rivals.map(async (rival) => ({ id: rival.websiteId, website: await ctx.db.get(rival.websiteId) })));
    const top = [...own].sort((a, b) => b.volume - a.volume).slice(0, SERVICE_SEARCHES);
    const searches = [];
    for (const rank of top) {
      let best: { host: string; position: number } | null = null;
      for (const rival of rivalSites) {
        const theirs = await ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", rival.id).eq("locationCode", site.place).eq("keyword", rank.keyword)).first();
        if (theirs?.position !== undefined && (!best || theirs.position < best.position)) best = { host: rival.website?.displayHost ?? rival.website?.host ?? "", position: theirs.position };
      }
      searches.push({ keyword: rank.keyword, volume: rank.volume, position: rank.position ?? null, rival: best?.host ?? null, rivalPosition: best?.position ?? null });
    }
    // The website's own Google clicks in the same 90 days, for the service's share of them.
    const siteClicks = (newest.week.summary?.services ?? []).reduce((sum, entry) => sum + entry.clicks, 0);
    return { host: newest.host, service, siteClicks: siteClicks > 0 ? siteClicks : null, searches };
  },
});

// ---------------------------------------------------------------------------
// The Track record (§4.1, I25, I30; drawn as the Track board)

/** Learnings across companies show once this many companies have made a change of that kind: none is ever shown another's figures. */
const LIKE_YOURS = 5;

export const insightsTrackRecord = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.object({
    findings: v.array(v.object({ findingId: v.id("insightFindings"), host: v.string(), headline: v.string(), week: v.string(), checkOn: v.union(v.string(), v.null()), actedAt: v.union(v.number(), v.null()), outcome: v.union(v.string(), v.null()), outcomeNote: v.union(v.string(), v.null()) })),
    tally: v.object({ right: v.number(), wrong: v.number(), unclear: v.number() }),
    changes: v.array(v.object({ changeId: v.id("insightChanges"), host: v.string(), kind: v.string(), from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()), seenIn: v.string(), before: v.number(), after: v.number(), result: v.string(), week: v.string(), day: v.union(v.string(), v.null()) })),
    learnings: v.array(v.object({ kind: v.string(), own: v.object({ lost: v.number(), held: v.number(), grew: v.number() }), across: v.union(v.null(), v.object({ companies: v.number(), lost: v.number(), held: v.number(), grew: v.number() })) })),
    /** Each drafted fix the person approved, with what its tagged link brought (I39). */
    fixes: v.array(v.object({ draftId: v.id("insightDrafts"), host: v.string(), title: v.string(), target: v.string(), approved: v.string(), visits: v.number(), enquiries: v.number() })),
  }),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    const hosts = new Map(sites.map((site) => [site.hold._id, site.host]));
    const findings = [];
    for (const site of sites) {
      const rows = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", site.hold._id)).order("desc").take(500);
      findings.push(...rows.filter((row) => row.status === "PUBLISHED").map((row) => ({
        findingId: row._id, host: site.host, headline: row.headline, week: row.week, checkOn: row.checkOn ?? null, actedAt: row.actedAt ?? null, outcome: row.outcome ?? null, outcomeNote: row.outcomeNote ?? null,
      })));
    }
    const tallies = ctx.companyId ? await ctx.db.query("insightTally").withIndex("by_company_specialist", (q) => q.eq("companyId", ctx.companyId!)).take(20) : [];
    const changes = ctx.companyId ? (await ctx.db.query("insightChanges").withIndex("by_company_created", (q) => q.eq("companyId", ctx.companyId!)).order("desc").take(200)).filter((change) => hosts.has(change.companyWebsiteId)) : [];
    const kinds = [...new Set(changes.map((change) => change.kind))];
    const learnings = [];
    for (const kind of kinds) {
      const mine = changes.filter((change) => change.kind === kind);
      const across = await ctx.db.query("insightLearnings").withIndex("by_kind", (q) => q.eq("kind", kind)).first();
      learnings.push({
        kind,
        own: { lost: mine.filter((change) => change.result === "LOST").length, held: mine.filter((change) => change.result === "HELD").length, grew: mine.filter((change) => change.result === "GREW").length },
        across: across && across.companies.length >= LIKE_YOURS ? { companies: across.companies.length, lost: across.lost, held: across.held, grew: across.grew } : null,
      });
    }
    // The approved fixes, and what each tagged link brought: Analytics' campaigns over 12 months, by campaign and source (I39).
    const fixes = [];
    const since = Date.now() - 365 * 86_400_000;
    for (const site of sites) {
      const approved = [];
      for (const area of DRAFT_AREAS) {
        const rows = await ctx.db.query("insightDrafts").withIndex("by_hold_area_created", (q) => q.eq("companyWebsiteId", site.hold._id).eq("area", area).gte("createdAt", since)).take(200);
        approved.push(...rows.filter((row) => row.status === "APPROVED"));
      }
      if (approved.length === 0) continue;
      const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
      const counted = connection ? countedOf(connection) : [];
      const campaigns = connection ? await readSlot(ctx, site.hold._id, slotKey("campaign", "365", "NOW", EVERY_DEVICE)) : null;
      for (const draft of approved) {
        const source = draft.link ? new URL(draft.link).searchParams.get("utm_source") : null;
        const rows = (campaigns?.rows ?? []).filter((row) => {
          const { channel, source: sourceMedium } = splitChannelKey(row.key);
          return channel === draft.campaign && (!source || sourceMedium.startsWith(`${source} /`));
        });
        fixes.push({
          draftId: draft._id, host: site.host, title: draft.title, target: draft.target,
          approved: new Date(draft.decidedAt ?? draft.createdAt).toISOString().slice(0, 10),
          visits: rows.reduce((sum, row) => sum + row.visits, 0),
          enquiries: rows.reduce((sum, row) => sum + conversionsOf(row, counted).conversions, 0),
        });
      }
    }
    return {
      fixes: fixes.sort((a, b) => b.approved.localeCompare(a.approved)),
      findings: findings.sort((a, b) => (a.checkOn ?? "9").localeCompare(b.checkOn ?? "9")),
      tally: tallies.reduce((sum, row) => ({ right: sum.right + row.right, wrong: sum.wrong + row.wrong, unclear: sum.unclear + row.unclear }), { right: 0, wrong: 0, unclear: 0 }),
      changes: changes.map((change) => ({ changeId: change._id, host: hosts.get(change.companyWebsiteId) ?? "", kind: change.kind, from: change.from, to: change.to, seenIn: change.seenIn, before: change.before, after: change.after, result: change.result, week: change.week, day: change.day ?? null })),
      learnings,
    };
  },
});

/** A finding's steps taken on (Add the steps to Hakken tasks): the Track record's "acted on". Any member of the company. */
export const markInsightFindingActed = tenantMutation({
  args: { findingId: v.id("insightFindings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finding = await ctx.db.get(args.findingId);
    if (!finding || finding.companyId !== ctx.companyId || finding.actedAt) return null;
    await ctx.db.patch(finding._id, { actedAt: Date.now() });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Growth and setup (§4.1, phase 13): the Measurement check and Sources

/**
 * The Measurement check (§4.1, drawn as the Measurement board): whether the
 * figures can be trusted, as the newest week's run found — the same checks the
 * findings were written beside, so the page and the findings never disagree.
 */
export const insightsMeasurement = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    week: v.union(v.string(), v.null()),
    measurement: v.union(measurementValidator, v.null()),
  })),
  handler: async (ctx, args) => {
    const [site] = await sitesFor(ctx, args.siteId);
    if (!site) return null;
    const held = await ctx.db.query("insightMeasurements").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    return { siteId: site.hold._id, host: site.host, week: held?.week ?? null, measurement: held ? { checks: held.checks, byDay: held.byDay } : null };
  },
});

/**
 * Opportunities and the page plan (§4.1, phase 9, drawn as the Opportunities
 * and Page plan boards): as the newest run worked them out, one read for both
 * pages, with each page's name from Hakken's page list.
 */
export const insightsPlan = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    week: v.union(v.string(), v.null()),
    plan: v.union(planValidator, v.null()),
  })),
  handler: async (ctx, args) => {
    const [site] = await sitesFor(ctx, args.siteId);
    if (!site) return null;
    const held = await ctx.db.query("insightPlans").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    return { siteId: site.hold._id, host: site.host, week: held?.week ?? null, plan: held ? { opportunities: held.opportunities, pages: held.pages, siteRate: held.siteRate } : null };
  },
});

export const SOURCE_IDS = ["market", "searchConsole", "analytics", "clarity", "businessProfiles", "pages", "enquiryValue"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

const sourceRow = v.object({
  source: v.union(...SOURCE_IDS.map((source) => v.literal(source))),
  /** CONNECTED, NOT_CONNECTED, SET, NOT_SET, or SOON for a source Hakken doesn't read yet. */
  status: v.union(v.literal("CONNECTED"), v.literal("NOT_CONNECTED"), v.literal("SET"), v.literal("NOT_SET"), v.literal("SOON")),
  /** The first day held, where it has one. */
  since: v.union(v.string(), v.null()),
  count: v.union(v.number(), v.null()),
});

/** A website's Business Profiles read at most: a business's own are few. */
const LISTINGS_READ = 40;

/**
 * Sources (§4.1, drawn as the Sources board): for each of the company's
 * websites, what it gives Hakken — each source, whether it is connected, how
 * far back it goes — and what connecting or setting the rest would unlock.
 * Read live from the connections themselves: one document each.
 */
export const insightsSources = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string(), sources: v.array(sourceRow) })),
  handler: async (ctx, args) => {
    const sites = await sitesFor(ctx, args.siteId);
    const out: Array<{ siteId: Id<"companyWebsites">; host: string; sources: Array<typeof sourceRow.type> }> = [];
    for (const site of sites) {
      const hold = site.hold;
      const first = await ctx.db.query("siteDaySummaries").withIndex("by_site_day", (q) => q.eq("websiteId", hold.websiteId).eq("locationCode", hold.locationCode ?? DEFAULT_LOCATION_CODE)).first();
      const console = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
      const analytics = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
      const clarity = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
      const listings = (await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(LISTINGS_READ)).filter((entry) => entry.role === "OWN");
      const consoleOn = console?.status === "CONNECTED" && Boolean(console.newestDay);
      const analyticsOn = analytics?.status === "CONNECTED";
      const counted = (analytics?.events ?? []).filter((event) => event.counted);
      const valued = counted.some((event) => event.analyticsValue !== null || event.hakkenValue !== null || event.eventName === "purchase");
      out.push({
        siteId: hold._id,
        host: site.host,
        sources: [
          { source: "market", status: first ? "CONNECTED" : "NOT_CONNECTED", since: first?.day ?? null, count: null },
          { source: "searchConsole", status: consoleOn ? "CONNECTED" : "NOT_CONNECTED", since: consoleOn ? console?.oldestDay ?? null : null, count: null },
          { source: "analytics", status: analyticsOn ? "CONNECTED" : "NOT_CONNECTED", since: analyticsOn ? analytics?.oldestDay ?? null : null, count: null },
          { source: "clarity", status: clarity?.status === "CONNECTED" ? "CONNECTED" : "NOT_CONNECTED", since: clarity?.status === "CONNECTED" ? clarity.oldestDay ?? null : null, count: null },
          { source: "businessProfiles", status: listings.length > 0 ? "CONNECTED" : "NOT_CONNECTED", since: null, count: listings.length },
          { source: "pages", status: "SOON", since: null, count: null },
          { source: "enquiryValue", status: !analyticsOn ? "NOT_SET" : valued ? "SET" : "NOT_SET", since: null, count: counted.length },
        ],
      });
    }
    return out;
  },
});
