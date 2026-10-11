import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { marketFacts } from "./insightsReading";
import { LEAGUE_IDS, leaguesFrom } from "./utils/insightLeagues";

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
