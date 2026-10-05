import { v, type Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isTrackedHold } from "./utils/websitePairing";
import { websiteIconUrl } from "./websiteIcons";
import { cadenceOf, DAY_MS, EVERY_DAYS } from "./seoRunEstimate";
import { DEFAULT_CREDIT_PRICES, DEFAULT_PLAN_CREDITS, creditDayOf, creditMonthNamed, creditMonthOf, type CreditKind } from "./creditKinds";
import { creditKindValidator, creditReasonValidator, creditSourceValidator } from "./creditSchema";

/**
 * What the Usage screens read (docs/plans/active/usage-credits-plan.md,
 * step 3): a company's month of credits — its summary from the daily
 * rollups, its statement line by line, and what its schedules have booked.
 *
 * Every read is the signed-in company's own. No real cost, supplier or
 * sharing ever leaves here: those are a super admin's (step 2).
 */

type Reader = Pick<QueryCtx, "db">;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month asked for, or this one; a month not yet begun is refused. */
function monthBounds(month: string | undefined, now: number) {
  if (month !== undefined && !MONTH_PATTERN.test(month)) throw appError("INVALID_INPUT", "A month is written YYYY-MM.");
  const bounds = month ? creditMonthNamed(month) : creditMonthOf(now);
  if (bounds.startsAt > now) throw appError("INVALID_INPUT", "That month has not begun.");
  const days = Math.round((bounds.endsAt - bounds.startsAt) / DAY_MS);
  const current = now >= bounds.startsAt && now < bounds.endsAt;
  return { ...bounds, days, current, startDay: creditDayOf(bounds.startsAt), endDay: creditDayOf(bounds.endsAt) };
}

/** A month's rollups: a row per kind and website, so a few hundred at most. */
async function monthRollups(ctx: Reader, companyId: Id<"companies">, month: string) {
  return await ctx.db
    .query("creditMonthRollups")
    .withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", month))
    .take(MONTH_ROLLUP_LIMIT);
}
const MONTH_ROLLUP_LIMIT = 900;

/** A month's daily totals: one a day. */
async function dayTotals(ctx: Reader, companyId: Id<"companies">, startDay: string, endDay: string) {
  return await ctx.db
    .query("creditDayTotals")
    .withIndex("by_company_day", (q) => q.eq("companyId", companyId).gte("day", startDay).lt("day", endDay))
    .take(31);
}

/** A month's days as an array of credits, one per UK day. */
function creditsByDay(rows: Doc<"creditDayTotals">[], month: string, days: number): number[] {
  const out = Array.from({ length: days }, () => 0);
  for (const row of rows) {
    const index = Number(row.day.slice(8, 10)) - 1;
    if (row.day.startsWith(month) && index >= 0 && index < days) out[index] += row.credits;
  }
  return out;
}

const websiteShape = v.object({
  websiteId: v.id("websites"),
  host: v.string(),
  relationship: v.union(v.literal("owned"), v.literal("tracked")),
  iconUrl: v.union(v.string(), v.null()),
});
type WebsiteInfo = Infer<typeof websiteShape>;

/** Who a website is to this company, by its own hold: owned or tracked. */
async function websitesOf(ctx: Reader, companyId: Id<"companies">, ids: Iterable<Id<"websites">>): Promise<Map<string, WebsiteInfo>> {
  const out = new Map<string, WebsiteInfo>();
  for (const websiteId of new Set(ids)) {
    const [website, hold] = await Promise.all([
      ctx.db.get(websiteId),
      ctx.db.query("companyWebsites").withIndex("by_company_website", (q) => q.eq("companyId", companyId).eq("websiteId", websiteId)).first(),
    ]);
    if (!website) continue;
    out.set(websiteId, {
      websiteId,
      host: website.displayHost,
      relationship: hold && isTrackedHold(hold) ? "tracked" : "owned",
      // The icon only through the company's own hold, as the Sites lists draw it.
      iconUrl: hold ? await websiteIconUrl(ctx, websiteId) : null,
    });
  }
  return out;
}

async function namesOf(ctx: Reader, ids: Iterable<Id<"users">>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const userId of new Set(ids)) {
    const user = await ctx.db.get(userId);
    if (user) out.set(userId, user.name?.trim() || user.email || "");
  }
  return out;
}

/** The company's plan credits a month: its plan's, else the platform's. */
async function monthlyPlanCredits(ctx: Reader, companyId: Id<"companies">): Promise<number> {
  const company = await ctx.db.get(companyId);
  const plan = company?.planId ? await ctx.db.get(company.planId) : null;
  if (plan?.monthlyCredits !== undefined) return plan.monthlyCredits;
  const settings = await ctx.db.query("creditSettings").withIndex("by_key", (q) => q.eq("key", "platform")).first();
  return settings?.planCredits ?? DEFAULT_PLAN_CREDITS;
}

// ---------------------------------------------------------------- what is booked

const scheduledShape = v.object({
  kind: creditKindValidator,
  website: v.union(websiteShape, v.null()),
  everyDays: v.number(),
  nextAt: v.number(),
  each: v.number(),
  toMonthEnd: v.number(),
  nextMonth: v.number(),
  setUpBy: v.union(v.string(), v.null()),
});
type Scheduled = Infer<typeof scheduledShape>;

/** How far back a scheduled check's runs are read to see how often it runs, and how many of the newest charges at most. */
const BOOKING_LOOKBACK_MS = 45 * DAY_MS;
const BOOKING_READ_LIMIT = 900;

/**
 * What the company's schedules will charge, worked out from how they have
 * run: each scheduled check (a kind of work on a website) runs as often as
 * its recent runs were apart — or as often as the company's collection is
 * scheduled, after only one — and charges what its last run charged. A check
 * that has not run for two of its turns is taken as stopped.
 */
async function scheduledChecks(ctx: Reader, companyId: Id<"companies">, now: number): Promise<Scheduled[]> {
  const { endsAt } = creditMonthOf(now);
  const nextEndsAt = creditMonthOf(endsAt).endsAt;
  // The newest first: a busy company's last 45 days may be more than are read,
  // and how its checks run now is what decides what they book.
  const charges = await ctx.db
    .query("creditCharges")
    .withIndex("by_company_at", (q) => q.eq("companyId", companyId).gte("at", now - BOOKING_LOOKBACK_MS))
    .order("desc")
    .take(BOOKING_READ_LIMIT);
  const groups = new Map<string, Doc<"creditCharges">[]>();
  for (const charge of charges) {
    if (charge.entry !== "charge" || charge.state !== "charged" || charge.how !== "scheduled" || !charge.kind) continue;
    const key = `${charge.kind}:${charge.websiteId ?? "none"}`;
    groups.set(key, [...(groups.get(key) ?? []), charge]);
  }
  const schedule = await ctx.db.query("schedules").withIndex("by_company_agent", (q) => q.eq("companyId", companyId)).first();
  const scheduledDays = EVERY_DAYS[cadenceOf(schedule?.intervalStr)];

  const websites = await websitesOf(ctx, companyId, [...groups.values()].flatMap((runs) => (runs[0].websiteId ? [runs[0].websiteId] : [])));
  const names = await namesOf(ctx, [...groups.values()].flatMap((runs) => {
    const last = runs[runs.length - 1];
    return last.userId ? [last.userId] : [];
  }));

  const out: Scheduled[] = [];
  for (const runs of groups.values()) {
    const ats = runs.map((run) => run.at).sort((a, b) => a - b);
    const gaps = ats.slice(1).map((at, index) => (at - ats[index]) / DAY_MS);
    const everyDays = gaps.length > 0 ? Math.max(1, Math.round(median(gaps))) : Math.max(1, Math.round(scheduledDays));
    const last = runs[runs.length - 1];
    const everyMs = everyDays * DAY_MS;
    if (now - last.at > 2 * everyMs + DAY_MS) continue;
    let nextAt = last.at + everyMs;
    while (nextAt <= now) nextAt += everyMs;
    const runsBefore = (until: number, from: number) => (from >= until ? 0 : Math.floor((until - 1 - from) / everyMs) + 1);
    const toMonthEnd = runsBefore(endsAt, nextAt);
    const firstNext = nextAt + toMonthEnd * everyMs;
    out.push({
      kind: last.kind as CreditKind,
      website: last.websiteId ? websites.get(last.websiteId) ?? null : null,
      everyDays,
      nextAt,
      each: last.creditsOut,
      toMonthEnd: toMonthEnd * last.creditsOut,
      nextMonth: runsBefore(nextEndsAt, Math.max(firstNext, endsAt)) * last.creditsOut,
      setUpBy: last.userId ? names.get(last.userId) ?? null : null,
    });
  }
  return out.sort((a, b) => a.nextAt - b.nextAt);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// ---------------------------------------------------------------- the summary

const kindTotalShape = v.object({ kind: creditKindValidator, credits: v.number(), runs: v.number() });

const summaryShape = v.object({
  month: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  days: v.number(),
  /** Days of the month gone, counting today; null for a month already over. */
  today: v.union(v.number(), v.null()),
  plan: v.object({ granted: v.number(), left: v.number(), endsAt: v.number() }),
  bought: v.object({ left: v.number(), nextEndsAt: v.union(v.number(), v.null()), nextEndsLeft: v.number() }),
  owed: v.number(),
  used: v.number(),
  byDay: v.array(v.number()),
  previous: v.object({ month: v.string(), granted: v.number(), byDay: v.array(v.number()) }),
  kinds: v.array(kindTotalShape),
  websites: v.array(v.object({
    website: v.union(websiteShape, v.null()),
    credits: v.number(),
    runs: v.number(),
    kinds: v.array(creditKindValidator),
  })),
  lines: v.array(v.object({
    kind: creditKindValidator,
    website: v.union(websiteShape, v.null()),
    credits: v.number(),
    runs: v.number(),
    /** Days apart for a scheduled check; null for work started by hand. */
    everyDays: v.union(v.number(), v.null()),
  })),
  prices: v.array(v.object({ kind: creditKindValidator, credits: v.number(), per: v.number() })),
  /** This month only: what is booked to its end, the usual pace of work started by hand, and what is left after both. */
  forecast: v.union(v.object({ booked: v.number(), pace: v.number(), leftAtEnd: v.number() }), v.null()),
});

/** Usage → Overview: a month of credits, from the daily rollups. */
export const usageSummary = tenantQuery({
  args: { month: v.optional(v.string()) },
  returns: v.union(summaryShape, v.null()),
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    if (!companyId) return null;
    const now = Date.now();
    const month = monthBounds(args.month, now);
    const previous = monthBounds(creditMonthOf(month.startsAt - 1).month, now);

    const [rows, days, previousDays, batches, account, planCredits] = await Promise.all([
      monthRollups(ctx, companyId, month.month),
      dayTotals(ctx, companyId, month.startDay, month.endDay),
      dayTotals(ctx, companyId, previous.startDay, previous.endDay),
      ctx.db.query("creditBatches").withIndex("by_company_state_ends", (q) => q.eq("companyId", companyId).eq("state", "open")).take(50),
      ctx.db.query("creditAccounts").withIndex("by_company", (q) => q.eq("companyId", companyId)).first(),
      monthlyPlanCredits(ctx, companyId),
    ]);
    const planBatch = await ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", month.month)).first();
    const previousPlan = await ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", previous.month)).first();
    const topUps = batches.filter((batch) => batch.source === "topup" && batch.left > 0 && batch.endsAt > now);

    const kinds = new Map<CreditKind, { credits: number; runs: number }>();
    const sites = new Map<string, { credits: number; runs: number; kinds: Set<CreditKind> }>();
    const lines = new Map<string, { kind: CreditKind; websiteKey: string; credits: number; runs: number }>();
    for (const row of rows) {
      const kind = row.kind as CreditKind;
      const k = kinds.get(kind) ?? { credits: 0, runs: 0 };
      kinds.set(kind, { credits: k.credits + row.credits, runs: k.runs + row.runs });
      const s = sites.get(row.websiteKey) ?? { credits: 0, runs: 0, kinds: new Set<CreditKind>() };
      s.kinds.add(kind);
      sites.set(row.websiteKey, { credits: s.credits + row.credits, runs: s.runs + row.runs, kinds: s.kinds });
      const lineKey = `${kind}:${row.websiteKey}`;
      const l = lines.get(lineKey) ?? { kind, websiteKey: row.websiteKey, credits: 0, runs: 0 };
      lines.set(lineKey, { ...l, credits: l.credits + row.credits, runs: l.runs + row.runs });
    }

    const websiteIds = [...sites.keys()].filter((key) => key !== "none") as Id<"websites">[];
    const websites = await websitesOf(ctx, companyId, websiteIds);
    const scheduled = month.current ? await scheduledChecks(ctx, companyId, now) : [];
    const everyOf = new Map(scheduled.map((check) => [`${check.kind}:${check.website?.websiteId ?? "none"}`, check.everyDays]));

    const used = rows.reduce((sum, row) => sum + row.credits, 0);
    const today = month.current ? Math.floor((now - month.startsAt) / DAY_MS) + 1 : null;
    const granted = planBatch?.granted ?? planCredits;
    const planLeft = planBatch ? (planBatch.state === "open" ? planBatch.left : 0) : granted;
    let forecast: Infer<typeof summaryShape>["forecast"] = null;
    if (today !== null) {
      const booked = scheduled.reduce((sum, check) => sum + check.toMonthEnd, 0);
      const byHand = days.reduce((sum, day) => sum + day.byHand, 0);
      const pace = Math.round((byHand / today) * (month.days - today));
      forecast = { booked, pace, leftAtEnd: planLeft - booked - pace };
    }

    const nextTopUp = topUps[0] ?? null;
    const prices = await ctx.db.query("creditPrices").take(20);
    return {
      month: month.month,
      startsAt: month.startsAt,
      endsAt: month.endsAt,
      days: month.days,
      today,
      plan: { granted, left: planLeft, endsAt: month.endsAt },
      bought: {
        left: topUps.reduce((sum, batch) => sum + batch.left, 0),
        nextEndsAt: nextTopUp?.endsAt ?? null,
        nextEndsLeft: nextTopUp?.left ?? 0,
      },
      owed: account?.owed ?? 0,
      used,
      byDay: creditsByDay(days, month.month, month.days),
      previous: { month: previous.month, granted: previousPlan?.granted ?? planCredits, byDay: creditsByDay(previousDays, previous.month, previous.days) },
      kinds: [...kinds.entries()].map(([kind, total]) => ({ kind, ...total })).sort((a, b) => b.credits - a.credits),
      websites: [...sites.entries()]
        .map(([key, total]) => ({ website: key === "none" ? null : websites.get(key) ?? null, credits: total.credits, runs: total.runs, kinds: [...total.kinds] }))
        .sort((a, b) => b.credits - a.credits),
      lines: [...lines.values()]
        .map((line) => ({
          kind: line.kind,
          website: line.websiteKey === "none" ? null : websites.get(line.websiteKey) ?? null,
          credits: line.credits,
          runs: line.runs,
          everyDays: everyOf.get(`${line.kind}:${line.websiteKey}`) ?? null,
        }))
        .sort((a, b) => b.credits - a.credits),
      prices: (Object.keys(DEFAULT_CREDIT_PRICES) as CreditKind[]).map((kind) => {
        const saved = prices.find((price) => price.kind === kind);
        return { kind, credits: saved?.credits ?? DEFAULT_CREDIT_PRICES[kind].credits, per: saved?.per ?? DEFAULT_CREDIT_PRICES[kind].per };
      }),
      forecast,
    };
  },
});

// ---------------------------------------------------------------- what is booked

/** Usage → Coming up: every scheduled check, when it next runs, and what it will use this month and next. */
export const usageComingUp = tenantQuery({
  args: {},
  returns: v.union(v.object({
    month: v.string(),
    endsAt: v.number(),
    nextMonth: v.string(),
    planLeft: v.number(),
    nextMonthCredits: v.number(),
    checks: v.array(scheduledShape),
  }), v.null()),
  handler: async (ctx) => {
    const companyId = ctx.companyId;
    if (!companyId) return null;
    const now = Date.now();
    const month = creditMonthOf(now);
    const planBatch = await ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", month.month)).first();
    const nextMonthCredits = await monthlyPlanCredits(ctx, companyId);
    return {
      month: month.month,
      endsAt: month.endsAt,
      nextMonth: creditMonthOf(month.endsAt).month,
      planLeft: planBatch ? (planBatch.state === "open" ? planBatch.left : 0) : nextMonthCredits,
      nextMonthCredits,
      checks: await scheduledChecks(ctx, companyId, now),
    };
  },
});

// ---------------------------------------------------------------- the statement

/** A month's lines sent at most; past them the screen says so and the CSV is the whole. */
const STATEMENT_LIMIT = 900;

const statementLineShape = v.object({
  id: v.id("creditCharges"),
  at: v.number(),
  entry: v.union(v.literal("charge"), v.literal("grant"), v.literal("ended"), v.literal("refund")),
  kind: v.union(creditKindValidator, v.null()),
  source: v.union(creditSourceValidator, v.null()),
  website: v.union(websiteShape, v.null()),
  user: v.union(v.string(), v.null()),
  how: v.union(v.literal("scheduled"), v.literal("byHand"), v.literal("automatic"), v.literal("bought")),
  units: v.number(),
  out: v.number(),
  in: v.number(),
  balance: v.union(v.number(), v.null()),
  detail: v.union(v.string(), v.null()),
  /** Why a line that is not plain work was written, and what it stood at before (`creditCharges.reason`). */
  reason: v.union(creditReasonValidator, v.null()),
  before: v.union(v.number(), v.null()),
  /** The batches that paid, or were paid back: a month's plan (`YYYY-MM`), or a top-up bought on a day. */
  from: v.array(v.object({ source: creditSourceValidator, month: v.union(v.string(), v.null()), startsAt: v.number() })),
  /** A grant's or an ending's own batch: its month, and when it began and ends. */
  batch: v.union(v.object({ source: creditSourceValidator, month: v.union(v.string(), v.null()), startsAt: v.number(), endsAt: v.number() }), v.null()),
});

/**
 * Usage → Statement, and the lists on By work and By website: every credit
 * in and out in a month, in order, with the balance after each and the
 * balance the month opened with.
 */
export const usageStatement = tenantQuery({
  args: {
    month: v.optional(v.string()),
    /** By work: one kind of work's charges only. */
    kind: v.optional(creditKindValidator),
    /** By website: one website's charges only, or `none` for work tied to no website. */
    website: v.optional(v.string()),
  },
  returns: v.union(v.object({
    month: v.string(),
    opening: v.number(),
    closing: v.number(),
    lines: v.array(statementLineShape),
    /** True when the month had more lines than are sent. */
    cut: v.boolean(),
  }), v.null()),
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    if (!companyId) return null;
    const month = monthBounds(args.month, Date.now());
    const before = await ctx.db
      .query("creditCharges")
      .withIndex("by_company_at", (q) => q.eq("companyId", companyId).lt("at", month.startsAt))
      .order("desc")
      .take(50);
    const opening = before.find((line) => line.state === "charged" && line.balanceAfter !== undefined)?.balanceAfter ?? 0;
    const kind = args.kind;
    const website = args.website;
    const rows = await ctx.db
      .query("creditCharges")
      .withIndex("by_company_at", (q) => q.eq("companyId", companyId).gte("at", month.startsAt).lt("at", month.endsAt))
      .filter((q) => {
        const charged = q.eq(q.field("state"), "charged");
        const ofKind = kind ? q.eq(q.field("kind"), kind) : charged;
        const ofSite = website === undefined ? charged : website === "none" ? q.eq(q.field("websiteId"), undefined) : q.eq(q.field("websiteId"), website as Id<"websites">);
        return q.and(charged, ofKind, ofSite);
      })
      .take(STATEMENT_LIMIT);
    const charged = rows;

    const websites = await websitesOf(ctx, companyId, charged.flatMap((row) => (row.websiteId ? [row.websiteId] : [])));
    const names = await namesOf(ctx, charged.flatMap((row) => (row.userId ? [row.userId] : [])));
    const batches = new Map<string, Doc<"creditBatches"> | null>();
    for (const batchId of new Set(charged.flatMap((row) => [...row.paidFrom.map((part) => part.batchId), ...(row.batchId ? [row.batchId] : [])]))) {
      batches.set(batchId, await ctx.db.get(batchId));
    }

    const lines = charged.map((row) => ({
      id: row._id,
      at: row.at,
      entry: row.entry,
      kind: row.kind ?? null,
      source: row.source ?? null,
      website: row.websiteId ? websites.get(row.websiteId) ?? null : null,
      user: row.userId ? names.get(row.userId) ?? null : null,
      how: row.how,
      units: row.units,
      out: row.creditsOut,
      in: row.creditsIn,
      balance: row.balanceAfter ?? null,
      detail: row.detail ?? null,
      reason: row.reason ?? null,
      before: row.before ?? null,
      from: row.paidFrom.flatMap((part) => {
        const batch = batches.get(part.batchId);
        return batch ? [{ source: batch.source, month: batch.month ?? null, startsAt: batch.startsAt }] : [];
      }),
      batch: (() => {
        const batch = row.batchId ? batches.get(row.batchId) : null;
        return batch ? { source: batch.source, month: batch.month ?? null, startsAt: batch.startsAt, endsAt: batch.endsAt } : null;
      })(),
    }));
    return {
      month: month.month,
      opening,
      closing: lines.length > 0 ? lines[lines.length - 1].balance ?? opening : opening,
      lines,
      cut: rows.length === STATEMENT_LIMIT,
    };
  },
});
