import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { readConversionsMap, conversionColumnsValidator } from "./googleAnalyticsConversionsMap";
import type { AnalyticsPeriod } from "./googleAnalyticsSchema";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";

/**
 * Reads an Insights agent makes that Ask Hakken's reads don't cover (stronger-agents-plan-2026-10-30.md A1): the
 * Conversions screen's map, through the very function the map reads (`readConversionsMap`), so what an agent reads
 * is what the map shows. Every rate is worked out here, in code, never by a model: each conversion's share of a
 * column's visits — the map's "Conversion rate" — and the visits it took for one, as the page's chart counts them;
 * every conversion together, a visit; a shop's steps, each into the next; and each view's standouts — the highest
 * and lowest rate among groups with visits enough to trust, and the biggest rise and fall — so an agent reading
 * hundreds of figures sees first where they part (Anthony, 2026-10-31: the bubble missed the channels he saw).
 * The company is the run's; `readConversionsMap` refuses a website the company doesn't hold.
 */

/** A share as a percentage to one place; null with nothing to divide by. */
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
/** Visits for one, to one place; null with none done. */
const forOne = (visits: number, did: number) => (did > 0 ? Math.round((visits / did) * 10) / 10 : null);

/** A group needs this share of the website's visits, or this many, before its rate is called a standout. */
const TRUSTED_SHARE = 0.02;
const TRUSTED_VISITS = 100;
/** A shop's steps as Google names them, each into the next: the standard ones, never a guess at the website's own. */
const SHOP_STEPS = ["add_to_cart", "begin_checkout", "purchase"] as const;

type Rated = { column: string; ratePercent: number | null; ratePercentBefore?: number | null };

/** Where a view's groups part: highest and lowest rate, biggest rise and fall, among groups with visits to trust. */
function standoutsOf(rows: readonly Rated[], visitsOf: ReadonlyMap<string, number>, trusted: number, named: { now: string; before: string } = { now: "ratePercent", before: "ratePercentBefore" }) {
  const fair = rows.filter((row) => row.ratePercent !== null && (visitsOf.get(row.column) ?? 0) >= trusted);
  if (fair.length < 2) return null;
  const byRate = [...fair].sort((a, b) => (b.ratePercent ?? 0) - (a.ratePercent ?? 0));
  const moved = fair.filter((row) => typeof row.ratePercentBefore === "number").map((row) => ({ ...row, changePoints: Math.round(((row.ratePercent ?? 0) - (row.ratePercentBefore ?? 0)) * 10) / 10 }));
  const byMove = [...moved].sort((a, b) => b.changePoints - a.changePoints);
  // Named as the figure is: a rate in percent, or conversions a visit, so each reads in its own unit.
  const pick = (row: Rated & { changePoints?: number }) => ({ column: row.column, [named.now]: row.ratePercent, ...(typeof row.ratePercentBefore === "number" ? { [named.before]: row.ratePercentBefore } : {}) });
  return {
    highest: pick(byRate[0]),
    lowest: pick(byRate[byRate.length - 1]),
    ...(byMove.length > 1 && byMove[0].changePoints > 0 ? { biggestRise: pick(byMove[0]) } : {}),
    ...(byMove.length > 1 && byMove[byMove.length - 1].changePoints < 0 ? { biggestFall: pick(byMove[byMove.length - 1]) } : {}),
  };
}

/** A column's name as the map heads it: its own, or what the special kinds stand for. */
function columnName(key: string, name: string | null): string {
  if (name) return name;
  if (key === NO_PAGE_KIND) return "no page recorded";
  if (key === OTHER_KIND) return "other kinds of page";
  if (key === NOT_SORTED_KIND) return "unclassified";
  return key;
}

export const conversionsByInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    siteId: v.id("companyWebsites"),
    period: v.string(),
    device: v.string(),
    country: v.optional(v.string()),
    columns: conversionColumnsValidator,
  },
  handler: async (ctx, args) => {
    const map = await readConversionsMap({ db: ctx.db, companyId: args.companyId }, {
      siteId: args.siteId, period: args.period as AnalyticsPeriod, device: args.device, columns: args.columns, ...(args.country ? { country: args.country } : {}),
    });
    if (map.collecting) return { ok: false, problem: "The map holds nothing for these dates yet." };
    const columns = map.columns.map((column) => ({ ...column, name: columnName(column.key, column.name) }));
    const siteVisits = columns.reduce((sum, column) => sum + column.visits, 0);
    const siteVisitsBefore = map.hasBefore ? columns.reduce((sum, column) => sum + (column.visitsBefore ?? 0), 0) : null;
    const counted = map.rows.filter((row) => row.counted);
    const visitsOf = new Map(columns.map((column) => [column.name, column.visits]));
    const trusted = Math.max(TRUSTED_VISITS, Math.round(siteVisits * TRUSTED_SHARE));
    // Every conversion together, a visit, in each column: the times they happened over its visits.
    const timesIn = (at: number, before: boolean) => counted.reduce((sum, row) => sum + ((before ? row.cells[at].timesBefore : row.cells[at].times) ?? 0), 0);
    const together = columns.map((column, at) => ({
      column: column.name,
      conversionsPerVisit: column.visits > 0 ? Math.round((timesIn(at, false) / column.visits) * 100) / 100 : null,
      ...(map.hasBefore && column.visitsBefore ? { conversionsPerVisitBefore: Math.round((timesIn(at, true) / column.visitsBefore) * 100) / 100 } : {}),
    }));
    const conversions = counted.map((row) => {
        const did = row.cells.reduce((sum, cell) => sum + cell.visits, 0);
        const didBefore = map.hasBefore ? row.cells.reduce((sum, cell) => sum + (cell.visitsBefore ?? 0), 0) : null;
        return {
          event: row.eventName,
          visitsThatDidIt: did,
          ...(didBefore !== null ? { visitsThatDidItBefore: didBefore } : {}),
          visitsForOne: forOne(siteVisits, did),
          ...(siteVisitsBefore !== null && didBefore !== null ? { visitsForOneBefore: forOne(siteVisitsBefore, didBefore) } : {}),
          by: columns.map((column, at) => ({
            column: column.name,
            visitsThatDidIt: row.cells[at].visits,
            ratePercent: percent(row.cells[at].visits, column.visits),
            ...(map.hasBefore && column.visitsBefore !== null && row.cells[at].visitsBefore !== null ? { ratePercentBefore: percent(row.cells[at].visitsBefore!, column.visitsBefore) } : {}),
          })),
        };
      });
    // A shop's steps, each into the next: of the visits that did one, the share that did the next, as visits.
    const did = (event: string, before: boolean) => {
      const row = counted.find((one) => one.eventName === event);
      if (!row) return null;
      return row.cells.reduce((sum, cell) => sum + ((before ? cell.visitsBefore : cell.visits) ?? 0), 0);
    };
    const steps = SHOP_STEPS.slice(0, -1).flatMap((from, at) => {
      const to = SHOP_STEPS[at + 1];
      const fromNow = did(from, false), toNow = did(to, false);
      if (!fromNow || toNow === null) return [];
      const fromBefore = map.hasBefore ? did(from, true) : null, toBefore = map.hasBefore ? did(to, true) : null;
      return [{
        step: `${from} to ${to}`,
        wentOnPercent: percent(toNow, fromNow),
        ...(fromBefore && toBefore !== null ? { wentOnPercentBefore: percent(toBefore, fromBefore) } : {}),
      }];
    });
    return {
      ok: true,
      by: args.columns,
      // Where the groups part, first: for every conversion together, then each conversion.
      standouts: [
        { conversion: "every conversion together, a visit", ...(standoutsOf(together.map((one) => ({ column: one.column, ratePercent: one.conversionsPerVisit, ratePercentBefore: one.conversionsPerVisitBefore ?? null })), visitsOf, trusted, { now: "conversionsPerVisit", before: "conversionsPerVisitBefore" }) ?? {}) },
        ...conversions.map((one) => ({ conversion: one.event, ...(standoutsOf(one.by, visitsOf, trusted) ?? {}) })),
      ],
      ...(steps.length > 0 ? { shopSteps: steps } : {}),
      visits: columns.map((column) => ({ column: column.name, visits: column.visits, ...(column.visitsBefore !== null ? { visitsBefore: column.visitsBefore } : {}) })),
      everyConversionTogether: together,
      // Each conversion the website counts: the visits that did it, the visits it took for one, and each column's rate.
      conversions,
    };
  },
});
