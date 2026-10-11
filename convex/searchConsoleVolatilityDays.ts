import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { shiftDay } from "./searchConsoleDays";
import type { UpdateWords } from "./searchConsoleChanges";
import { SETTLE_DAYS } from "./utils/sees/searchConsole";
import { completeDays } from "./utils/searchConsoleVolatility";

/**
 * Volatility's day scores as Search Console's pages read them
 * (docs/plans/active/search-console-volatility-plan.md §3): the web day rows
 * of the chart table (`searchConsoleWeeks`), each day's score worked out once
 * after its collection, and what Volatility and Google updates both read from
 * them — an update's score while it rolled out against the fortnight before.
 * Only complete days are judged: a day Google has half filled in is not.
 */

/** Days of scores read: the 60 kept as days, and the 14 before an update that began at their start. */
export const DAYS_READ = 75;
/** Days an update's own usual is read over before it began, as Google updates reads its days before. */
const BEFORE_UPDATE_DAYS = 14;

export type DayRow = Pick<Doc<"searchConsoleWeeks">, "week" | "volatility" | "volatilityKeywords" | "movedUp5" | "movedDown5">;

export const average = (scores: readonly number[]): number | null =>
  scores.length === 0 ? null : Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;

/** The scores of the complete days from one to the other, those that have one (§3: a day Google has half filled in is not judged). */
export const scoresBetween = (days: readonly DayRow[], from: string, to: string, complete: ReadonlySet<string>): number[] =>
  days.flatMap((day) => (day.week >= from && day.week <= to && complete.has(day.week) && day.volatility !== undefined ? [day.volatility] : []));

/** An update's volatility while it rolled out — to its last day, or the newest — against the 14 days before it began. */
export function updateVolatility(days: readonly DayRow[], update: Pick<UpdateWords, "startedOn" | "finishedOn">, newest: string, complete = completeDays(days)): { before: number | null; during: number | null } {
  const end = update.finishedOn && update.finishedOn < newest ? update.finishedOn : newest;
  return {
    before: average(scoresBetween(days, shiftDay(update.startedOn, -BEFORE_UPDATE_DAYS), shiftDay(update.startedOn, -1), complete)),
    during: average(scoresBetween(days, update.startedOn, end, complete)),
  };
}

/** The newest update still rolling out on the newest day, or finished in the `SETTLE_DAYS` before it. */
export function updateInPlay(updates: readonly UpdateWords[], newest: string): UpdateWords | null {
  const inPlay = updates.filter((update) => update.startedOn <= newest && (!update.finishedOn || shiftDay(update.finishedOn, SETTLE_DAYS) >= newest));
  return inPlay.sort((left, right) => right.startedOn.localeCompare(left.startedOn))[0] ?? null;
}


/** The website's web day rows from a day on, oldest first: at most the days kept and a fortnight before. */
export async function dayRowsOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, country: string | undefined, from: string): Promise<DayRow[]> {
  const rows = await ctx.db
    .query("searchConsoleWeeks")
    .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", holdId).eq("country", country).eq("searchType", "web").gte("week", from))
    .take(DAYS_READ * 3);
  return rows.filter((row) => row.grain === "DAY");
}
