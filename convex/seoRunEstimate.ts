import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { findSeoOperation } from "./dataForSeoRegistry";
import { boughtForCompetitor, collectsEveryRun, COMPETITOR_KEYWORD_LIST_DAYS, competitorFirstPageOnly } from "./seoBuyingRules";

// The rule lives with the other buying rules; its old home still answers for it.
export { collectsEveryRun };

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
 * company's run buys everything not still fresh (Anthony, 2026-09-25: "if we
 * run once a month it's always the full scan"; `heldForDays`, 2026-10-05).
 *
 * Daily: the weekly keyword list every 7th run, the monthly link lists and
 * crawl every 30th. Weekly: the keyword list every run, the link lists and the
 * crawl every 4th. Fortnightly: the keyword list every run, the link lists and
 * the crawl every other. Monthly: everything, every run.
 */
export function repeatDays(ownDays: number, runDays: number): number | null {
  if (collectsEveryRun(ownDays, runDays)) return null;
  const runs = Math.ceil((ownDays - runDays / 2) / runDays);
  return runs <= 1 ? null : runs * runDays;
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

/** One kind of request, priced: what it cost the time it was bought, and — where it differs from the registry's — its own cadence. */
export type Priced = { operationId: string; costUsd: number; everyRunCostUsd?: number; ownDays?: number };

/** A kind of request as a run's report keeps it (`runReportFields`). */
type ReportLine = { operationId: string; costUsd: number; everyRunCostUsd?: number; trackedCostUsd?: number; trackedFirstPageCostUsd?: number };

/**
 * What a run's spend on one kind of request comes to under today's buying
 * rules (`seoBuyingRules.ts`, finish-off plan item 15): a run bought before
 * them bought competitors crawls, every link list and their whole keyword
 * lists. A kind no longer bought for a competitor is priced on the company's
 * own websites alone; a competitor's keyword list at its top 1,000, once a
 * month. A report worked out before it kept what was bought for competitors
 * (`trackedCostUsd`) is priced whole — rebuild it (`rebuildRecentRunReports`).
 */
export function boughtUnderTodaysRules(line: ReportLine): Priced[] {
  const tracked = line.trackedCostUsd ?? 0;
  const everyRun = line.everyRunCostUsd ? { everyRunCostUsd: line.everyRunCostUsd } : {};
  if (boughtForCompetitor(line.operationId) && !competitorFirstPageOnly(line.operationId)) {
    return [{ operationId: line.operationId, costUsd: line.costUsd, ...everyRun }];
  }
  const own = line.costUsd - tracked;
  const top = boughtForCompetitor(line.operationId) ? line.trackedFirstPageCostUsd ?? 0 : 0;
  return [
    ...(own > 0 ? [{ operationId: line.operationId, costUsd: own, ...everyRun }] : []),
    ...(top > 0 ? [{ operationId: line.operationId, costUsd: top, ownDays: COMPETITOR_KEYWORD_LIST_DAYS }] : []),
  ];
}

/** How often a kind of request is bought for a company, in days: on the run nearest its own cadence, never more often than the company collects. */
function boughtEveryDays(priced: Pick<Priced, "operationId" | "ownDays">, cadence: Cadence): number {
  const ownDays = priced.ownDays ?? findSeoOperation(priced.operationId)?.refresh?.everyDays;
  return (ownDays !== undefined ? repeatDays(ownDays, EVERY_DAYS[cadence]) : null) ?? EVERY_DAYS[cadence];
}

/**
 * What a company will cost a month, from what its requests cost: each kind as
 * often as it is bought — on the run nearest its own cadence where it has one
 * (the monthly link lists and crawl, a competitor's monthly keyword list), and
 * never more often than the company collects (`repeatDays`). The keyword
 * list's everyday pages are bought on every run whatever the list's own
 * cadence (`everyRunCostUsd`), so they are priced per run (Anthony,
 * 2026-09-27).
 *
 * Steady runs, as the schedule makes them: an answer reused because it is
 * still fresh (`heldForDays`, item 6a) saves only on a run soon after another
 * — Collect now — which no schedule books.
 */
export function estimateMonthly(byOperation: ReadonlyArray<Priced>, cadence: Cadence): Estimate {
  const lines = new Map<Estimate["lines"][number]["every"], { costUsd: number; perMonthUsd: number }>();
  const add = (everyDays: number, costUsd: number) => {
    const every = everyDays <= 1 ? "DAY" : everyDays <= 7 ? "WEEK" : everyDays <= 14 ? "FORTNIGHT" : "MONTH";
    const line = lines.get(every) ?? { costUsd: 0, perMonthUsd: 0 };
    line.costUsd += costUsd;
    line.perMonthUsd += (costUsd * DAYS_PER_MONTH) / everyDays;
    lines.set(every, line);
  };
  for (const priced of byOperation) {
    const eachRun = Math.min(priced.costUsd, priced.everyRunCostUsd ?? 0);
    if (eachRun > 0) add(EVERY_DAYS[cadence], eachRun);
    if (eachRun === 0 || priced.costUsd > eachRun) add(boughtEveryDays(priced, cadence), priced.costUsd - eachRun);
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
 * its newest runs, for the estimate — under today's buying rules
 * (`boughtUnderTodaysRules`). A daily company's last run holds only what is
 * bought every run; its monthly lists and crawl are priced from the run that
 * last bought them — and a kind not bought within its own cadence, and a run
 * more, is no longer bought, and left out.
 */
export async function newestPrices(
  ctx: Reader,
  companyId: Id<"companies">,
  cadence: Cadence,
  now: number,
): Promise<Priced[]> {
  const runs = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
    .order("desc")
    .take(ESTIMATE_RUNS_READ);
  const eachRun = new Map<string, number>();
  const ownCadence = new Map<string, number>();
  const kinds = new Map<string, Pick<Priced, "operationId" | "ownDays">>();
  for (const run of runs) {
    const report = await reportOf(ctx, run._id);
    if (!report) continue;
    const age = (now - run.startedAt) / DAY_MS;
    for (const entry of report.byOperation.flatMap(boughtUnderTodaysRules)) {
      const key = entry.ownDays === undefined ? entry.operationId : `${entry.operationId}:${entry.ownDays}`;
      if (!kinds.has(key)) kinds.set(key, { operationId: entry.operationId, ...(entry.ownDays !== undefined ? { ownDays: entry.ownDays } : {}) });
      const everyRun = Math.min(entry.costUsd, entry.everyRunCostUsd ?? 0);
      if (everyRun > 0 && !eachRun.has(key) && age <= 2 * EVERY_DAYS[cadence]) {
        eachRun.set(key, everyRun);
      }
      const rest = entry.costUsd - everyRun;
      const bought = everyRun === 0 || rest > 0;
      if (bought && !ownCadence.has(key) && age <= boughtEveryDays(entry, cadence) + EVERY_DAYS[cadence]) {
        ownCadence.set(key, rest);
      }
    }
  }
  return [...new Set([...eachRun.keys(), ...ownCadence.keys()])].map((key) => {
    const everyRun = eachRun.get(key) ?? 0;
    return { ...kinds.get(key)!, costUsd: everyRun + (ownCadence.get(key) ?? 0), ...(everyRun > 0 ? { everyRunCostUsd: everyRun } : {}) };
  });
}
