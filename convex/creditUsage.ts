import { v, type Infer } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isTrackedHold } from "./utils/websitePairing";
import { websiteIconUrl } from "./websiteIcons";
import { cadenceOf, DAY_MS, EVERY_DAYS } from "./seoRunEstimate";
import { competitorChargeUnderTodaysRules } from "./creditForecastRules";
import { readCreditPrice } from "./creditLedger";
import { DEFAULT_CREDIT_PRICES, DEFAULT_PLAN_CREDITS, creditDayOf, creditMonthNamed, creditMonthOf, creditsForUnits, type CreditKind } from "./creditKinds";
import { creditEntryValidator, creditKindValidator, creditReasonValidator, creditSourceValidator } from "./creditSchema";

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

/** Runs read as being counted at once: every website and kind of a few collections under way. */
const COUNTING_READ = 300;

/**
 * A company's runs still being counted — a collection under way, its charge
 * open (finish-off-plan.md, item 4) — each with the credits what has come
 * back so far comes to at its price. Not taken from any batch until the run
 * closes; shown as "being counted" until then.
 */
async function runsBeingCounted(ctx: Reader, companyId: Id<"companies">) {
  const open = await ctx.db
    .query("creditCharges")
    .withIndex("by_company_state_at", (q) => q.eq("companyId", companyId).eq("state", "open"))
    .take(COUNTING_READ);
  return open.flatMap((charge) => (charge.kind && charge.entry === "charge"
    ? [{ kind: charge.kind, websiteKey: charge.websiteId ?? "none", credits: countingCredits(charge) }]
    : []));
}

/** What an open run's units come to so far, at the price it opened at. */
function countingCredits(charge: Doc<"creditCharges">): number {
  return charge.kind ? creditsForUnits(charge.price ?? DEFAULT_CREDIT_PRICES[charge.kind], charge.units) : 0;
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
  /** A Hakken task's own row: its title, and the task (hakken-tasks-plan.md, across all of it). */
  title: v.optional(v.string()),
  taskId: v.optional(v.id("hakkenTasks")),
});
type Scheduled = Infer<typeof scheduledShape>;

/** Hakken tasks' work, booked from the tasks themselves rather than from how their charges ran: one row each. */
const TASK_KINDS = new Set<CreditKind>(["taskAlerts", "taskReports", "taskResearch"]);
/** The company's tasks read for Coming up: far more than the 25 a person may have on. */
const TASKS_READ = 300;

/** How many runs every so often fall from one moment until another. */
function runsBetween(from: number, until: number, everyMs: number): number {
  return from >= until ? 0 : Math.floor((until - 1 - from) / everyMs) + 1;
}

/** Every Hakken task that is on, as a scheduled check: an alert every day, a report every week, at its price. */
async function taskChecks(ctx: Reader, companyId: Id<"companies">, now: number, endsAt: number, nextEndsAt: number): Promise<Scheduled[]> {
  const tasks = (await ctx.db.query("hakkenTasks").withIndex("by_company", (q) => q.eq("companyId", companyId)).order("desc").take(TASKS_READ))
    .filter((task) => task.state === "ON" && task.nextCheckAt !== undefined && (task.kind === "ALERT" || task.kind === "REPORT"));
  if (tasks.length === 0) return [];
  const holds = new Map<string, Id<"websites">>();
  for (const task of tasks) {
    if (!task.target || holds.has(task.target.companyWebsiteId)) continue;
    const hold = await ctx.db.get(task.target.companyWebsiteId);
    if (hold) holds.set(task.target.companyWebsiteId, hold.websiteId);
  }
  const websites = await websitesOf(ctx, companyId, holds.values());
  const names = await namesOf(ctx, tasks.map((task) => task.userId));
  const prices = {
    ALERT: creditsForUnits(await readCreditPrice(ctx, "taskAlerts"), 1),
    REPORT: creditsForUnits(await readCreditPrice(ctx, "taskReports"), 1),
  };
  return tasks.map((task) => {
    const everyDays = task.kind === "REPORT" ? 7 : 1;
    const everyMs = everyDays * DAY_MS;
    let nextAt = task.nextCheckAt ?? now;
    while (nextAt <= now) nextAt += everyMs;
    const each = task.kind === "REPORT" ? prices.REPORT : prices.ALERT;
    const toMonthEnd = runsBetween(nextAt, endsAt, everyMs);
    const websiteId = task.target ? holds.get(task.target.companyWebsiteId) : undefined;
    return {
      kind: task.kind === "REPORT" ? "taskReports" as const : "taskAlerts" as const,
      website: websiteId ? websites.get(websiteId) ?? null : null,
      everyDays,
      nextAt,
      each,
      toMonthEnd: toMonthEnd * each,
      nextMonth: runsBetween(Math.max(nextAt + toMonthEnd * everyMs, endsAt), nextEndsAt, everyMs) * each,
      setUpBy: names.get(task.userId) ?? null,
      title: task.title,
      taskId: task._id,
    };
  });
}

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
    if (charge.entry !== "charge" || charge.state !== "charged" || charge.how !== "scheduled" || !charge.kind || TASK_KINDS.has(charge.kind)) continue;
    const key = `${charge.kind}:${charge.websiteId ?? "none"}`;
    groups.set(key, [...(groups.get(key) ?? []), charge]);
  }
  const schedule = await ctx.db.query("schedules").withIndex("by_company_agent", (q) => q.eq("companyId", companyId)).first();
  const scheduledDays = EVERY_DAYS[cadenceOf(schedule?.intervalStr)];

  const websites = await websitesOf(ctx, companyId, [...groups.values()].flatMap((runs) => (runs[0].websiteId ? [runs[0].websiteId] : [])));
  // The charges were read newest first, so a check's last run is its first
  // here. Taken from the end, a check with more than its two turns of history
  // was read from its oldest run, and dropped as stopped (found 2026-10-05).
  const names = await namesOf(ctx, [...groups.values()].flatMap((runs) => (runs[0].userId ? [runs[0].userId] : [])));

  const out: Scheduled[] = [];
  for (const runs of groups.values()) {
    const ats = runs.map((run) => run.at).sort((a, b) => a - b);
    const gaps = ats.slice(1).map((at, index) => (at - ats[index]) / DAY_MS);
    const everyDays = gaps.length > 0 ? Math.max(1, Math.round(median(gaps))) : Math.max(1, Math.round(scheduledDays));
    const last = runs[0];
    const everyMs = everyDays * DAY_MS;
    if (now - last.at > 2 * everyMs + DAY_MS) continue;
    // A competitor is bought only what benchmarking needs from 2026-10-05:
    // its next runs are booked at what today's rules still buy of its last
    // (`creditForecastRules.ts`, finish-off plan item 15) — its audit at none.
    const website = last.websiteId ? websites.get(last.websiteId) ?? null : null;
    const each = website?.relationship === "tracked" ? await competitorChargeUnderTodaysRules(ctx, last) ?? last.creditsOut : last.creditsOut;
    if (each <= 0) continue;
    let nextAt = last.at + everyMs;
    while (nextAt <= now) nextAt += everyMs;
    const runsBefore = (until: number, from: number) => (from >= until ? 0 : Math.floor((until - 1 - from) / everyMs) + 1);
    const toMonthEnd = runsBefore(endsAt, nextAt);
    const firstNext = nextAt + toMonthEnd * everyMs;
    out.push({
      kind: last.kind as CreditKind,
      website,
      everyDays,
      nextAt,
      each,
      toMonthEnd: toMonthEnd * each,
      nextMonth: runsBefore(nextEndsAt, Math.max(firstNext, endsAt)) * each,
      setUpBy: last.userId ? names.get(last.userId) ?? null : null,
    });
  }
  out.push(...await taskChecks(ctx, companyId, now, endsAt, nextEndsAt));
  return out.sort((a, b) => a.nextAt - b.nextAt);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// ---------------------------------------------------------------- the summary

/**
 * A kind's month: its credits charged, runs, how many people started work of
 * it by hand (from the rollups' `byHandUsers`), and the credits of its runs
 * still being counted — a collection under way (finish-off-plan.md, item 4).
 */
const kindTotalShape = v.object({ kind: creditKindValidator, credits: v.number(), runs: v.number(), people: v.number(), counting: v.number() });

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
  /** Credits charged this month. */
  used: v.number(),
  /** This month only: credits of runs still being counted, not yet taken — a collection under way (item 4). */
  counting: v.number(),
  byDay: v.array(v.number()),
  previous: v.object({ month: v.string(), granted: v.number(), byDay: v.array(v.number()) }),
  kinds: v.array(kindTotalShape),
  websites: v.array(v.object({
    website: v.union(websiteShape, v.null()),
    credits: v.number(),
    runs: v.number(),
    people: v.number(),
    counting: v.number(),
    kinds: v.array(creditKindValidator),
  })),
  lines: v.array(v.object({
    kind: creditKindValidator,
    website: v.union(websiteShape, v.null()),
    credits: v.number(),
    runs: v.number(),
    counting: v.number(),
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

    type Total = { credits: number; runs: number; counting: number; people: Set<string>; kinds: Set<CreditKind> };
    const total = (): Total => ({ credits: 0, runs: 0, counting: 0, people: new Set<string>(), kinds: new Set<CreditKind>() });
    const kinds = new Map<CreditKind, Total>();
    const sites = new Map<string, Total>();
    const lines = new Map<string, Total & { kind: CreditKind; websiteKey: string }>();
    /** One month's row, or one run still being counted, into the kind, the website and the check it belongs to. */
    const add = (kind: CreditKind, websiteKey: string, change: { credits?: number; runs?: number; counting?: number; people?: readonly string[] }) => {
      const lineKey = `${kind}:${websiteKey}`;
      const targets = [
        kinds.get(kind) ?? kinds.set(kind, total()).get(kind)!,
        sites.get(websiteKey) ?? sites.set(websiteKey, total()).get(websiteKey)!,
        lines.get(lineKey) ?? lines.set(lineKey, { ...total(), kind, websiteKey }).get(lineKey)!,
      ];
      for (const target of targets) {
        target.credits += change.credits ?? 0;
        target.runs += change.runs ?? 0;
        target.counting += change.counting ?? 0;
        target.kinds.add(kind);
        for (const userId of change.people ?? []) target.people.add(userId);
      }
    };
    for (const row of rows) add(row.kind as CreditKind, row.websiteKey, { credits: row.credits, runs: row.runs, people: row.byHandUsers });
    // This month, runs still being counted: what has come back so far, at their price (finish-off-plan.md, item 4).
    const counting = month.current ? await runsBeingCounted(ctx, companyId) : [];
    for (const run of counting) add(run.kind, run.websiteKey, { counting: run.credits });

    const websiteIds = [...sites.keys()].filter((key) => key !== "none") as Id<"websites">[];
    const websites = await websitesOf(ctx, companyId, websiteIds);
    const scheduled = month.current ? await scheduledChecks(ctx, companyId, now) : [];
    const everyOf = new Map(scheduled.map((check) => [`${check.kind}:${check.website?.websiteId ?? "none"}`, check.everyDays]));

    const used = rows.reduce((sum, row) => sum + row.credits, 0);
    const beingCounted = counting.reduce((sum, run) => sum + run.credits, 0);
    const today = month.current ? Math.floor((now - month.startsAt) / DAY_MS) + 1 : null;
    const granted = planBatch?.granted ?? planCredits;
    const planLeft = planBatch ? (planBatch.state === "open" ? planBatch.left : 0) : granted;
    let forecast: Infer<typeof summaryShape>["forecast"] = null;
    if (today !== null) {
      const booked = scheduled.reduce((sum, check) => sum + check.toMonthEnd, 0);
      const byHand = days.reduce((sum, day) => sum + day.byHand, 0);
      const pace = Math.round((byHand / today) * (month.days - today));
      forecast = { booked, pace, leftAtEnd: planLeft - beingCounted - booked - pace };
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
      counting: beingCounted,
      byDay: creditsByDay(days, month.month, month.days),
      previous: { month: previous.month, granted: previousPlan?.granted ?? planCredits, byDay: creditsByDay(previousDays, previous.month, previous.days) },
      // Biggest first, what is being counted included.
      kinds: [...kinds.entries()]
        .map(([kind, sum]) => ({ kind, credits: sum.credits, runs: sum.runs, people: sum.people.size, counting: sum.counting }))
        .sort((a, b) => b.credits + b.counting - (a.credits + a.counting)),
      websites: [...sites.entries()]
        .map(([key, sum]) => ({ website: key === "none" ? null : websites.get(key) ?? null, credits: sum.credits, runs: sum.runs, people: sum.people.size, counting: sum.counting, kinds: [...sum.kinds] }))
        .sort((a, b) => b.credits + b.counting - (a.credits + a.counting)),
      lines: [...lines.values()]
        .map((line) => ({
          kind: line.kind,
          website: line.websiteKey === "none" ? null : websites.get(line.websiteKey) ?? null,
          credits: line.credits,
          runs: line.runs,
          counting: line.counting,
          everyDays: everyOf.get(`${line.kind}:${line.websiteKey}`) ?? null,
        }))
        .sort((a, b) => b.credits + b.counting - (a.credits + a.counting)),
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

/**
 * Lines read for one page of a statement narrowed by a person or a search,
 * which the page's own index cannot narrow: the screen asks for the next
 * page until its own is full, each read this many lines at most.
 */
const STATEMENT_SCAN = 200;

const statementLineShape = v.object({
  id: v.id("creditCharges"),
  at: v.number(),
  entry: creditEntryValidator,
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
  /** A run still being counted — a collection under way (finish-off-plan.md, item 4): its credits so far, not yet taken, and no balance after it. */
  counting: v.boolean(),
});

/** The statement's balance before a moment: the newest charged line's before it, among the last few. */
async function balanceBefore(ctx: Reader, companyId: Id<"companies">, at: number): Promise<number | null> {
  const before = await ctx.db
    .query("creditCharges")
    .withIndex("by_company_at", (q) => q.eq("companyId", companyId).lt("at", at))
    .order("desc")
    .take(50);
  return before.find((line) => line.state === "charged" && line.balanceAfter !== undefined)?.balanceAfter ?? null;
}

/** What a search finds on a line: its website, what it was for, who, and the kinds of work whose names the screen matched. */
function lineMatches(line: StatementLine, term: string, kinds: readonly CreditKind[]): boolean {
  return (line.kind !== null && kinds.includes(line.kind))
    || [line.website?.host, line.detail, line.user].some((text) => (text ?? "").toLowerCase().includes(term));
}

type StatementLine = Infer<typeof statementLineShape>;

/**
 * Usage → Statement, and the lists on By work and By website: a month's
 * credits in and out, a page at a time (finish-off-plan.md, item 10) — never
 * the whole month at once, however many lines it has. One kind of work's or
 * one website's lines are read by their own index; a person or a search
 * narrows each page as it is read, a page of at most `STATEMENT_SCAN` lines,
 * and the screen reads on until its own page is full. In date order, oldest
 * first for the statement; the month's balances and totals are
 * `usageStatementTotals`.
 */
export const usageStatement = tenantQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    month: v.optional(v.string()),
    /** By work, or the Task filter: one kind of work's lines only. */
    kind: v.optional(creditKindValidator),
    /** By website, or the Website filter: one website's lines only, or `none` for work tied to no website. */
    website: v.optional(v.string()),
    /** The User filter: one person's lines. */
    userId: v.optional(v.id("users")),
    /** The search box, and the kinds of work whose names (in the reader's language) it matches. */
    search: v.optional(v.string()),
    searchKinds: v.optional(v.array(creditKindValidator)),
    /** Oldest first, as a statement prints, or newest first. */
    order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    /** By work and By website: the work charged only, not the lines that granted, ended or gave back credits. */
    chargesOnly: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(statementLineShape),
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    const month = monthBounds(args.month, Date.now());
    if (!companyId) return { page: [], isDone: true, continueCursor: "" };
    const kind = args.kind;
    const website = args.website;
    const term = args.search?.trim().toLowerCase() ?? "";
    // One kind on one website — By website's Task filter — reads the kind's index and narrows by website as it goes.
    const bothKindAndWebsite = kind !== undefined && website !== undefined;
    const narrowed = args.userId !== undefined || term.length > 0 || bothKindAndWebsite || args.chargesOnly === true;
    const opts = narrowed ? { ...args.paginationOpts, numItems: Math.max(args.paginationOpts.numItems, STATEMENT_SCAN) } : args.paginationOpts;
    const { startsAt, endsAt } = month;
    const websiteId = website === undefined || website === "none" ? undefined : website as Id<"websites">;
    const query = kind
      ? ctx.db.query("creditCharges").withIndex("by_company_kind_at", (q) => q.eq("companyId", companyId).eq("kind", kind).gte("at", startsAt).lt("at", endsAt))
      : website !== undefined
        ? ctx.db.query("creditCharges").withIndex("by_company_website_at", (q) => q.eq("companyId", companyId).eq("websiteId", websiteId).gte("at", startsAt).lt("at", endsAt))
        : ctx.db.query("creditCharges").withIndex("by_company_at", (q) => q.eq("companyId", companyId).gte("at", startsAt).lt("at", endsAt));
    const page = await query.order(args.order ?? "asc").paginate(opts);
    // Charged lines, and runs still being counted (item 4).
    const rows = page.page.filter((row) => (row.state === "charged" || (row.state === "open" && row.entry === "charge"))
      && (args.userId === undefined || row.userId === args.userId)
      && (website === undefined || row.websiteId === websiteId)
      && (args.chargesOnly !== true || row.entry === "charge"));
    const lines = await statementLines(ctx, companyId, rows);
    return { ...page, page: term ? lines.filter((line) => lineMatches(line, term, args.searchKinds ?? [])) : lines };
  },
});

/**
 * The Statement's month in figures, without reading its lines (finish-off-
 * plan.md, item 10): the balance it opened with and stands at; what came in
 * from the plan and from anything else; and what went out — used, after
 * anything given back, and ended unused. Every line moves the balance by
 * what it takes or gives, so what went out is what opened and came in, less
 * what is left.
 */
export const usageStatementTotals = tenantQuery({
  args: { month: v.optional(v.string()) },
  returns: v.union(v.object({
    month: v.string(),
    opening: v.number(),
    closing: v.number(),
    planIn: v.number(),
    otherIn: v.number(),
    used: v.number(),
    ended: v.number(),
    /** This month: credits of runs still being counted, not in the balance yet (item 4). */
    counting: v.number(),
    /** The company's people, for the User filter. */
    people: v.array(v.object({ userId: v.id("users"), name: v.string() })),
  }), v.null()),
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    if (!companyId) return null;
    const month = monthBounds(args.month, Date.now());
    const previous = creditMonthOf(month.startsAt - 1).month;
    const [opening, closing, plan, endedPlan, batches, members] = await Promise.all([
      balanceBefore(ctx, companyId, month.startsAt),
      balanceBefore(ctx, companyId, month.endsAt),
      ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", month.month)).first(),
      ctx.db.query("creditBatches").withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", previous)).first(),
      // A company's top-ups: a handful a year.
      ctx.db.query("creditBatches").withIndex("by_company_state_ends", (q) => q.eq("companyId", companyId)).take(100),
      ctx.db.query("users").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(PEOPLE_LISTED),
    ]);
    const people = members
      .map((user) => ({ userId: user._id, name: user.name?.trim() || user.email || "" }))
      .filter((person) => person.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    const within = (at: number) => at >= month.startsAt && at < month.endsAt;
    const topUps = batches.filter((batch) => batch.source === "topup");
    const planIn = plan ? plan.granted : 0;
    const otherIn = topUps.filter((batch) => within(batch.startsAt)).reduce((sum, batch) => sum + batch.granted, 0);
    const ended = [endedPlan, ...topUps].reduce((sum, batch) => sum + (batch && batch.state === "ended" && within(batch.endsAt) ? batch.writtenOff ?? 0 : 0), 0);
    const open = opening ?? 0;
    const now = closing ?? open;
    const out = open + planIn + otherIn - now;
    // This month: the credits of runs still being counted, not yet taken (item 4).
    const counting = month.current ? (await runsBeingCounted(ctx, companyId)).reduce((sum, run) => sum + run.credits, 0) : 0;
    return { month: month.month, opening: open, closing: now, planIn, otherIn, used: out - ended, ended, counting, people };
  },
});

/** People offered by the User filter: a company's team. */
const PEOPLE_LISTED = 200;

/** Lines as the screens show them: each website, person and batch named, and nothing a company may not see. */
async function statementLines(ctx: Reader, companyId: Id<"companies">, charged: Doc<"creditCharges">[]): Promise<StatementLine[]> {
  const websites = await websitesOf(ctx, companyId, charged.flatMap((row) => (row.websiteId ? [row.websiteId] : [])));
  const names = await namesOf(ctx, charged.flatMap((row) => (row.userId ? [row.userId] : [])));
  const batches = new Map<string, Doc<"creditBatches"> | null>();
  for (const batchId of new Set(charged.flatMap((row) => [...row.paidFrom.map((part) => part.batchId), ...(row.batchId ? [row.batchId] : [])]))) {
    batches.set(batchId, await ctx.db.get(batchId));
  }

  return charged.map((row) => ({
    id: row._id,
    at: row.at,
    entry: row.entry,
    kind: row.kind ?? null,
    source: row.source ?? null,
    website: row.websiteId ? websites.get(row.websiteId) ?? null : null,
    user: row.userId ? names.get(row.userId) ?? null : null,
    how: row.how,
    units: row.units,
    out: row.state === "open" ? countingCredits(row) : row.creditsOut,
    counting: row.state === "open",
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
}
