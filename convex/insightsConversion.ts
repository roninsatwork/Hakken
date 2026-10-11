import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { decodePages } from "./holdPageRefs";
import { conversionsOf, countedOf, readSlot } from "./googleAnalyticsRows";
import { EVERY_DEVICE, slotKey } from "./googleAnalyticsLists";
import { conversionValidator, pageReviewValidator, sourceRowValidator, funnelStepValidator } from "./utils/insightConversion";
import { pageFactsValidator } from "./utils/moneyPageChecks";
import { addUpClarity, clarityRowValidator, type ClarityRow } from "./utils/clarityRows";
import { shiftDay } from "./utils/insightFacts";

/**
 * The Conversion specialist's reads and writes (docs/plans/active/
 * insights-analyst-plan.md §4.1, phase 14): each money page's figures and
 * facts for its review, the reviews kept with the funnel, and the
 * experiments — started by the person, measured by Hakken eight weeks on.
 */

/** Eight weeks after going live, an experiment is measured. */
export const EXPERIMENT_DAYS = 56;

type Reader = { db: QueryCtx["db"] };

/** A page's visits and enquiries in one of Analytics' landing lists, by path. */
async function landingByPath(ctx: Reader, holdId: Id<"companyWebsites">, period: "30" | "365", which: "NOW" | "YEAR") {
  const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
  if (!connection?.property) return null;
  const counted = countedOf(connection);
  const landing = await readSlot(ctx, holdId, slotKey("landing", period, which, EVERY_DEVICE));
  if (!landing) return null;
  const addresses = await decodePages(ctx, holdId, landing.rows.map((row) => row.key));
  const out = new Map<string, { visits: number; enquiries: number }>();
  landing.rows.forEach((row, index) => {
    const path = pathOf(addresses[index]);
    const held = out.get(path) ?? { visits: 0, enquiries: 0 };
    held.visits += row.visits;
    held.enquiries += conversionsOf(row, counted).conversions;
    out.set(path, held);
  });
  return { from: landing.from, to: landing.to, pages: out };
}

function pathOf(address: string): string {
  try {
    return new URL(address).pathname;
  } catch {
    return address;
  }
}

/** Each money page with its 12 months against the 12 before, and what its words show, for the Conversion specialist. */
export const reviewInputs = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(v.object({
    page: v.string(), title: v.union(v.string(), v.null()), kind: v.union(v.string(), v.null()),
    visits: v.number(), enquiries: v.number(), visitsBefore: v.union(v.number(), v.null()), enquiriesBefore: v.union(v.number(), v.null()),
    facts: v.union(pageFactsValidator, v.null()), structured: v.union(v.array(v.string()), v.null()),
    /** Clarity's behaviour over its last 30 days, where it is connected (I24). */
    behaviour: v.union(v.null(), clarityRowValidator),
  })),
  handler: async (ctx, args) => {
    const checks = await ctx.db.query("moneyPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId)).take(48);
    if (checks.length === 0) return [];
    const now = await landingByPath(ctx, args.holdId, "365", "NOW");
    const year = await landingByPath(ctx, args.holdId, "365", "YEAR");
    // Clarity's last 30 days by page, where the website has it connected (I24).
    const clarity = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const behaviour = new Map<string, ClarityRow>();
    if (clarity?.newestDay) {
      const days = await ctx.db.query("clarityDays").withIndex("by_hold_by_day", (q) => q.eq("companyWebsiteId", args.holdId).eq("by", "PAGE").gte("day", shiftDay(clarity.newestDay!, -29))).take(31);
      for (const row of addUpClarity(days.map((day) => day.rows))) behaviour.set(row.key, row);
    }
    const titles = new Map<string, string | null>();
    for (const check of checks) {
      const held = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId).eq("page", check.page)).first();
      titles.set(check.page, held?.title ?? null);
    }
    return checks
      .map((check) => {
        const mine = now?.pages.get(check.page), before = year?.pages.get(check.page);
        return {
          page: check.page, title: titles.get(check.page) ?? null, kind: check.kind,
          visits: mine?.visits ?? 0, enquiries: mine?.enquiries ?? 0,
          visitsBefore: year ? before?.visits ?? 0 : null, enquiriesBefore: year ? before?.enquiries ?? 0 : null,
          facts: check.facts ?? null, structured: check.structured, behaviour: behaviour.get(check.page) ?? null,
        };
      })
      .filter((page) => page.visits > 0)
      .sort((a, b) => b.visits - a.visits);
  },
});

/** The week's funnel, sources and reviews; each verdict not yet tried becomes an experiment ready to start; the experiments due are measured. */
export const saveConversion = internalMutation({
  args: { holdId: v.id("companyWebsites"), companyId: v.id("companies"), week: v.string(), conversion: conversionValidator },
  returns: v.object({ ready: v.number(), measured: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const held = await ctx.db.query("insightConversions").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const row = { companyId: args.companyId, companyWebsiteId: args.holdId, week: args.week, ...args.conversion, createdAt: now };
    if (held) await ctx.db.replace(held._id, row);
    else await ctx.db.insert("insightConversions", row);
    let ready = 0;
    for (const page of args.conversion.pages) {
      if (page.verdict === "KEEP") continue;
      const key = `${page.page}|${page.verdict}`;
      const existing = await ctx.db.query("insightExperiments").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("key", key)).first();
      if (existing) {
        if (existing.status === "READY") await ctx.db.patch(existing._id, { why: page.reason });
        continue;
      }
      await ctx.db.insert("insightExperiments", { companyId: args.companyId, companyWebsiteId: args.holdId, key, page: page.page, verdict: page.verdict, why: page.reason, status: "READY", createdAt: now });
      ready += 1;
    }
    // Eight weeks on, each experiment running is measured: its page's last 30 days against the 30 before it went live.
    let measured = 0;
    const running = await ctx.db.query("insightExperiments").withIndex("by_hold_status", (q) => q.eq("companyWebsiteId", args.holdId).eq("status", "RUNNING")).take(50);
    const due = running.filter((experiment) => experiment.startedAt && now - experiment.startedAt >= EXPERIMENT_DAYS * 86_400_000);
    if (due.length > 0) {
      const last = await landingByPath(ctx, args.holdId, "30", "NOW");
      for (const experiment of due) {
        const figures = last?.pages.get(experiment.page) ?? { visits: 0, enquiries: 0 };
        await ctx.db.patch(experiment._id, { status: "DONE", result: { ...figures, from: last?.from ?? "", to: last?.to ?? "" } });
        measured += 1;
      }
    }
    return { ready, measured };
  },
});

const experimentRow = v.object({
  experimentId: v.id("insightExperiments"),
  page: v.string(),
  verdict: v.string(),
  why: v.string(),
  status: v.string(),
  startedAt: v.union(v.number(), v.null()),
  baseline: v.union(v.null(), v.object({ visits: v.number(), enquiries: v.number(), from: v.string(), to: v.string() })),
  result: v.union(v.null(), v.object({ visits: v.number(), enquiries: v.number(), from: v.string(), to: v.string() })),
  visits: v.number(),
});

/**
 * The Conversion pages' read (Funnel, Page reviews, a page's review and
 * Experiments): the newest run's funnel, sources and reviews, and every
 * experiment, for the website chosen or the company's first.
 */
export const insightsConversion = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    week: v.union(v.string(), v.null()),
    funnel: v.array(funnelStepValidator),
    sources: v.array(sourceRowValidator),
    pages: v.array(pageReviewValidator),
    experiments: v.array(experimentRow),
  })),
  handler: async (ctx, args) => {
    const hold = await chosenHold(ctx, args.siteId);
    if (!hold) return null;
    const website = await ctx.db.get(hold.websiteId);
    const row = await ctx.db.query("insightConversions").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const experiments = [];
    for (const status of ["READY", "RUNNING", "DONE"] as const) {
      experiments.push(...await ctx.db.query("insightExperiments").withIndex("by_hold_status", (q) => q.eq("companyWebsiteId", hold._id).eq("status", status)).take(50));
    }
    const visitsOf = new Map((row?.pages ?? []).map((page) => [page.page, page.visits]));
    return {
      siteId: hold._id,
      host: website?.displayHost ?? website?.host ?? "",
      week: row?.week ?? null,
      funnel: row?.funnel ?? [],
      sources: row?.sources ?? [],
      pages: row?.pages ?? [],
      experiments: experiments.map((experiment) => ({
        experimentId: experiment._id, page: experiment.page, verdict: experiment.verdict, why: experiment.why, status: experiment.status,
        startedAt: experiment.startedAt ?? null, baseline: experiment.baseline ?? null, result: experiment.result ?? null, visits: visitsOf.get(experiment.page) ?? 0,
      })),
    };
  },
});

async function chosenHold(ctx: Parameters<typeof requireMySite>[0] & { companyId?: Id<"companies"> | null }, siteId: Id<"companyWebsites"> | undefined): Promise<Doc<"companyWebsites"> | null> {
  if (siteId) {
    const site = await requireMySite(ctx, siteId);
    return site.hold.relationship === "OWNED" ? site.hold : null;
  }
  if (!ctx.companyId) return null;
  const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", ctx.companyId!)).take(50);
  return holds.find((hold) => hold.relationship === "OWNED") ?? null;
}

/** The person says a change went live: Hakken keeps the page's 30 days before it, and measures it eight weeks on. */
export const startExperiment = tenantMutation({
  args: { experimentId: v.id("insightExperiments"), state: v.union(v.literal("RUNNING"), v.literal("READY"), v.literal("DROPPED")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) throw appError("NOT_FOUND", "That experiment is gone.");
    await requireMySite(ctx, experiment.companyWebsiteId);
    if (args.state !== "RUNNING") {
      await ctx.db.patch(experiment._id, { status: args.state, startedAt: undefined, baseline: undefined });
      return null;
    }
    const before = await landingByPath(ctx, experiment.companyWebsiteId, "30", "NOW");
    const figures = before?.pages.get(experiment.page) ?? { visits: 0, enquiries: 0 };
    await ctx.db.patch(experiment._id, { status: "RUNNING", startedAt: Date.now(), baseline: { ...figures, from: before?.from ?? "", to: before?.to ?? "" } });
    return null;
  },
});
