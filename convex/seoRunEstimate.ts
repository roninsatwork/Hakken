import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { findSeoOperation } from "./dataForSeoRegistry";

/**
 * How often a company's collection buys each kind of request, and what a
 * month of it comes to — the Data collection screen's "a month from now".
 * Moved out of `seoRunReports.ts` on 2026-09-27, when the estimate began
 * pricing the everyday check's pages per run and each kind of request at what
 * it last cost (`newestPrices`).
 */

type Reader = { db: QueryCtx["db"] };

export const DAYS_PER_MONTH = 30.44;
export const DAY_MS = 86_400_000;

/** A company's collection cadence, as its Data collection screen offers it. */
export type Cadence = "daily" | "weekly" | "fortnightly" | "monthly";

/** A run's report, when one has been worked out. */
export async function reportOf(ctx: Reader, cycleId: Id<"seoCollectionCycles">) {
  return await ctx.db.query("seoRunReports").withIndex("by_cycle", (q) => q.eq("cycleId", cycleId)).unique();
}

/** A schedule's cadence, as the Data collection screen offers it; anything else reads as weekly. */
export function cadenceOf(intervalStr: string | undefined): Cadence {
  const plain = (intervalStr ?? "").trim();
  let cadence: unknown = plain;
  try {
    cadence = (JSON.parse(plain) as Record<string, unknown>).cadence;
  } catch {
    // An old plain-word schedule: "daily", "weekly".
  }
  if (cadence === "daily" || cadence === "hourly") return "daily";
  if (cadence === "fortnightly") return "fortnightly";
  if (cadence === "monthly") return "monthly";
  return "weekly";
}

export const EVERY_DAYS: Record<Cadence, number> = { daily: 1, weekly: 7, fortnightly: 14, monthly: DAYS_PER_MONTH };

/** How many days apart a schedule's runs come, from its cadence. */
export function everyDaysOf(intervalStr: string | undefined): number {
  return EVERY_DAYS[cadenceOf(intervalStr)];
}

/**
 * How often a call with its own cadence of `ownDays` is bought when its
 * company collects every `runDays`: on the run nearest its own cadence — held
 * until it is within half a run of due (`heldByOwnCadence`). Null: every run,
 * because the company collects no more often than the call — a monthly
 * company's run buys everything (Anthony, 2026-09-25: "if we run once a month
 * it's always the full scan").
 *
 * Daily: a weekly list every 7th run, a monthly crawl every 30th. Weekly: the
 * lists every run, the crawl every 4th. Fortnightly: the lists every run, the
 * crawl every other. Monthly: everything, every run.
 */
export function repeatDays(ownDays: number, runDays: number): number | null {
  if (collectsEveryRun(ownDays, runDays)) return null;
  const runs = Math.ceil((ownDays - runDays / 2) / runDays);
  return runs <= 1 ? null : runs * runDays;
}

/**
 * Whether a company whose runs come every `runDays` buys a call with its own
 * cadence of `ownDays` on every run: it collects about as seldom as the call,
 * or more seldom — a monthly company and a monthly crawl, a weekly one and a
 * weekly list — so every run is due one, however the months fall.
 */
export function collectsEveryRun(ownDays: number, runDays: number): boolean {
  return runDays >= ownDays * 0.9;
}

export const estimateShape = v.object({
  perMonthUsd: v.number(),
  lines: v.array(v.object({
    every: v.union(v.literal("DAY"), v.literal("WEEK"), v.literal("FORTNIGHT"), v.literal("MONTH")),
    costUsd: v.number(),
    perMonthUsd: v.number(),
  })),
});
export type Estimate = Infer<typeof estimateShape>;

/** How often a kind of request is bought for a company, in days: on the run nearest its own cadence, never more often than the company collects. */
function boughtEveryDays(operationId: string, cadence: Cadence): number {
  const ownDays = findSeoOperation(operationId)?.refresh?.everyDays;
  return (ownDays !== undefined ? repeatDays(ownDays, EVERY_DAYS[cadence]) : null) ?? EVERY_DAYS[cadence];
}

/**
 * What a company will cost a month, from what its requests cost: each kind as
 * often as it is bought — on the run nearest its own cadence where it has one
 * (a weekly list, a monthly crawl), and never more often than the company
 * collects (`repeatDays`). The keyword list's everyday pages are bought on
 * every run whatever the list's own cadence (`everyRunCostUsd`), so they are
 * priced per run (Anthony, 2026-09-27).
 */
export function estimateMonthly(
  byOperation: ReadonlyArray<{ operationId: string; costUsd: number; everyRunCostUsd?: number }>,
  cadence: Cadence,
): Estimate {
  const lines = new Map<Estimate["lines"][number]["every"], { costUsd: number; perMonthUsd: number }>();
  const add = (everyDays: number, costUsd: number) => {
    const every = everyDays <= 1 ? "DAY" : everyDays <= 7 ? "WEEK" : everyDays <= 14 ? "FORTNIGHT" : "MONTH";
    const line = lines.get(every) ?? { costUsd: 0, perMonthUsd: 0 };
    line.costUsd += costUsd;
    line.perMonthUsd += (costUsd * DAYS_PER_MONTH) / everyDays;
    lines.set(every, line);
  };
  for (const { operationId, costUsd, everyRunCostUsd } of byOperation) {
    const eachRun = Math.min(costUsd, everyRunCostUsd ?? 0);
    if (eachRun > 0) add(EVERY_DAYS[cadence], eachRun);
    if (eachRun === 0 || costUsd > eachRun) add(boughtEveryDays(operationId, cadence), costUsd - eachRun);
  }
  const order = ["DAY", "WEEK", "FORTNIGHT", "MONTH"] as const;
  const listed = order.flatMap((every) => {
    const line = lines.get(every);
    return line ? [{ every, ...line }] : [];
  });
  return { perMonthUsd: listed.reduce((sum, line) => sum + line.perMonthUsd, 0), lines: listed };
}

/** A company's newest runs read for its estimate: a daily company's month and more, so its monthly crawl is priced. */
const ESTIMATE_RUNS_READ = 40;

/**
 * What each kind of request cost the last time the company bought it, from
 * its newest runs, for the estimate. A daily company's last run holds only
 * what is bought every run; its weekly lists and its monthly crawl are priced
 * from the run that last bought them — and a kind not bought within its own
 * cadence, and a run more, is no longer bought, and left out.
 */
export async function newestPrices(
  ctx: Reader,
  companyId: Id<"companies">,
  cadence: Cadence,
  now: number,
): Promise<Array<{ operationId: string; costUsd: number; everyRunCostUsd?: number }>> {
  const runs = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
    .order("desc")
    .take(ESTIMATE_RUNS_READ);
  const eachRun = new Map<string, number>();
  const ownCadence = new Map<string, number>();
  for (const run of runs) {
    const report = await reportOf(ctx, run._id);
    if (!report) continue;
    const age = (now - run.startedAt) / DAY_MS;
    for (const entry of report.byOperation) {
      const everyRun = Math.min(entry.costUsd, entry.everyRunCostUsd ?? 0);
      if (everyRun > 0 && !eachRun.has(entry.operationId) && age <= 2 * EVERY_DAYS[cadence]) {
        eachRun.set(entry.operationId, everyRun);
      }
      const rest = entry.costUsd - everyRun;
      const bought = everyRun === 0 || rest > 0;
      if (bought && !ownCadence.has(entry.operationId) && age <= boughtEveryDays(entry.operationId, cadence) + EVERY_DAYS[cadence]) {
        ownCadence.set(entry.operationId, rest);
      }
    }
  }
  return [...new Set([...eachRun.keys(), ...ownCadence.keys()])].map((operationId) => {
    const everyRun = eachRun.get(operationId) ?? 0;
    return { operationId, costUsd: everyRun + (ownCadence.get(operationId) ?? 0), ...(everyRun > 0 ? { everyRunCostUsd: everyRun } : {}) };
  });
}
