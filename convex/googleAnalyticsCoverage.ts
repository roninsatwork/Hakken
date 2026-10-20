import type { Doc } from "./_generated/dataModel";
import type { DayFactList } from "./googleAnalyticsSchema";

/**
 * Where each home country's Google Analytics figures stand (docs/plans/active/ga-stored-figures-plan.md
 * SF7): the days held, the two years filled and each page held over time —
 * the main home country's on the connection itself, another's beside it in
 * `countryHistory`. Read by the collection, the fills and every screen.
 */

/** Where a home country's days, history and pages stand (SF7): the main one's on the connection, another's beside it. */
export type Coverage = { newestDay?: string; oldestDay?: string; historyFrom?: string; historyFilled?: DayFactList[]; pageHistoryFrom?: string; pageChannelsFrom?: string };

export function coverageOf(connection: Doc<"googleAnalyticsConnections">, country = ""): Coverage {
  if (!country) {
    const { newestDay, oldestDay, historyFrom, historyFilled, pageHistoryFrom, pageChannelsFrom } = connection;
    return { newestDay, oldestDay, historyFrom, historyFilled, pageHistoryFrom, pageChannelsFrom };
  }
  return connection.countryHistory?.find((one) => one.country === country) ?? {};
}

/** A connection's other home countries' coverage with one country's changed: added when it is new. */
export function withCoverage(connection: Doc<"googleAnalyticsConnections">, country: string, change: Coverage): Doc<"googleAnalyticsConnections">["countryHistory"] {
  const held = connection.countryHistory ?? [];
  const before = held.find((one) => one.country === country);
  return before ? held.map((one) => (one.country === country ? { ...one, ...change } : one)) : [...held, { country, ...change }];
}

/** The day lists whose two years are filled: a website filled before SF12 has its channels alone. */
export function filledLists(coverage: Pick<Coverage, "historyFilled" | "historyFrom">): DayFactList[] {
  return coverage.historyFilled ?? (coverage.historyFrom ? ["channel"] : []);
}
