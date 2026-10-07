import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type ActionCtx } from "./_generated/server";
import { holdSearches } from "./holdLists";
import { keepsSearch } from "./searchConsoleKeep";
import { decodePages } from "./searchConsolePageRefs";
import { readPeriod } from "./searchConsolePeriodReads";
import { askLive } from "./searchConsoleReads";
import { bySide, fromGoogle, type Row } from "./utils/searchConsolePacks";

/**
 * Part 3's gate (keep-less-history-plan.md, step 3.1): a website's 90 days of
 * searches and pages as Google gives them — one long ask, and the same days
 * in weekly pieces added up — against the lists built from the kept days, by
 * the searches the keep rule keeps, by clicks and by tracked searches. Run by
 * hand on a deployment; nothing is written. Goes once part 3 is built.
 *
 *   npx convex run searchConsoleGate:measureGate '{"host":"morehandles.co.uk"}'
 */

/** Rows Google gives one ask at most (`searchConsoleApi.ts`): an ask returning this many may have been cut. */
const GOOGLE_MOST_ROWS = 50_000;

/** Tracked searches read: one list's, capped as everywhere. */
const TRACKED_READ = 500;

type KeyClicks = Array<{ key: string; clicks: number }>;

/**
 * What the kept days built for the 90 days of web results: its searches and
 * pages, as JSON — a busy website's lists are longer than a returned array
 * may be — and the searches tracked.
 */
export const gateInputs = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.union(v.null(), v.object({
    property: v.string(),
    from: v.string(),
    to: v.string(),
    searchesJson: v.string(),
    pagesJson: v.string(),
    tracked: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.property) return null;
    const holdId = connection.companyWebsiteId;
    const searches = await readPeriod(ctx, holdId, "web", "query", "90", "NOW");
    const pages = await readPeriod(ctx, holdId, "web", "page", "90", "NOW");
    if (!searches || !pages) return null;
    const pageKeys = await decodePages(ctx, holdId, pages.rows.map((row) => row.key));
    const tracked = await holdSearches(ctx, holdId, TRACKED_READ, { activeOnly: true });
    return {
      property: connection.property,
      from: searches.from,
      to: searches.to,
      searchesJson: JSON.stringify(searches.rows.map((row) => ({ key: row.key, clicks: row.clicks }))),
      pagesJson: JSON.stringify(pages.rows.map((row, index) => ({ key: pageKeys[index], clicks: row.clicks }))),
      tracked: tracked.map((row) => row.keyword),
    };
  },
});

const dayMs = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The days from `from` to `to` in pieces of seven, the last shorter. */
function weeksOf(from: string, to: string): Array<{ from: string; to: string }> {
  const pieces: Array<{ from: string; to: string }> = [];
  for (let start = Date.parse(`${from}T00:00:00Z`); isoDay(start) <= to; start += 7 * dayMs) {
    const end = isoDay(start + 6 * dayMs);
    pieces.push({ from: isoDay(start), to: end < to ? end : to });
  }
  return pieces;
}

type Asked = { rows: Row[]; asks: number; cut: number };

/** Google's rows for the days asked, one ask or several pieces added up by key. */
async function asked(
  ctx: ActionCtx,
  target: { connectionId: Id<"searchConsoleConnections">; property: string },
  pieces: ReadonlyArray<{ from: string; to: string }>,
  dimensions: string[],
): Promise<Asked | { problem: string }> {
  const pairs = dimensions.length === 2;
  const sums = new Map<string, Row>();
  let cut = 0;
  for (const piece of pieces) {
    const answer = await askLive(ctx, target, { startDate: piece.from, endDate: piece.to, type: "web", dimensions });
    if (!answer.ok) return { problem: answer.problem };
    if (answer.rows.length >= GOOGLE_MOST_ROWS) cut += 1;
    for (const row of fromGoogle(answer.rows, pairs)) {
      const key = pairs ? `${row.key}\u0000${row.page}` : row.key;
      const held = sums.get(key);
      if (!held) sums.set(key, { ...row });
      else {
        held.clicks += row.clicks;
        held.impressions += row.impressions;
        held.positionSum += row.positionSum;
      }
    }
  }
  return { rows: [...sums.values()], asks: pieces.length, cut };
}

const sum = (values: Iterable<number>) => [...values].reduce((total, value) => total + value, 0);
const share = (part: number, whole: number) => (whole === 0 ? 1 : Math.round((part / whole) * 10_000) / 100);

/** How a list asked of Google compares with the one built from the kept days. */
function compared(
  google: { pairs: Asked; pages: Asked },
  built: { searches: Array<{ key: string; clicks: number }>; pages: Array<{ key: string; clicks: number }>; tracked: string[] },
) {
  const tracked = new Set(built.tracked);
  const searches = bySide(google.pairs.rows, "query");
  const kept = new Map([...searches].filter(([key, row]) => tracked.has(key) || keepsSearch({ ...row, pages: row.count })));
  const builtClicks = sum(built.searches.map((row) => row.clicks));
  const missing = built.searches.filter((row) => !kept.has(row.key));
  const pagesAsked = new Map(google.pages.rows.map((row) => [row.key, row.clicks]));
  const builtPageClicks = sum(built.pages.map((row) => row.clicks));
  const pagesMissing = built.pages.filter((row) => !pagesAsked.has(row.key));
  return {
    asks: google.pairs.asks + google.pages.asks,
    asksCut: google.pairs.cut + google.pages.cut,
    pairRows: google.pairs.rows.length,
    searchesKept: kept.size,
    searchesKeptClicks: sum([...kept.values()].map((row) => row.clicks)),
    builtSearchClicksFound: share(builtClicks - sum(missing.map((row) => row.clicks)), builtClicks),
    builtSearchesMissing: missing.length,
    builtSearchesMissingWithClicks: missing.filter((row) => row.clicks > 0).length,
    trackedMissing: built.tracked.filter((keyword) => !searches.has(keyword) && built.searches.some((row) => row.key === keyword)),
    pageRows: google.pages.rows.length,
    pageClicks: sum(google.pages.rows.map((row) => row.clicks)),
    builtPageClicksFound: share(builtPageClicks - sum(pagesMissing.map((row) => row.clicks)), builtPageClicks),
    builtPagesMissingWithClicks: pagesMissing.filter((row) => row.clicks > 0).length,
  };
}

export const measureGate = internalAction({
  args: { host: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const connections: Array<{ connectionId: Id<"searchConsoleConnections">; holdId: Id<"companyWebsites"> }> =
      await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {});
    const report: unknown[] = [];
    for (const { connectionId } of connections) {
      const host: string | null = await ctx.runQuery(internal.searchConsoleTidy.hostOfConnection, { connectionId });
      if (!host || (args.host !== undefined && host !== args.host)) continue;
      const inputs = await ctx.runQuery(internal.searchConsoleGate.gateInputs, { connectionId });
      const built = inputs && {
        ...inputs,
        searches: JSON.parse(inputs.searchesJson) as KeyClicks,
        pages: JSON.parse(inputs.pagesJson) as KeyClicks,
      };
      if (!built) {
        report.push({ host, problem: "no 90-day lists built" });
        continue;
      }
      const target = { connectionId, property: built.property };
      const whole = [{ from: built.from, to: built.to }];
      const weeks = weeksOf(built.from, built.to);
      const longPairs = await asked(ctx, target, whole, ["query", "page"]);
      const longPages = await asked(ctx, target, whole, ["page"]);
      const weekPairs = await asked(ctx, target, weeks, ["query", "page"]);
      const weekPages = await asked(ctx, target, weeks, ["page"]);
      const failed = [longPairs, longPages, weekPairs, weekPages].find((answer): answer is { problem: string } => "problem" in answer);
      if (failed) {
        report.push({ host, problem: failed.problem });
        continue;
      }
      report.push({
        host,
        days: `${built.from} to ${built.to}`,
        built: {
          searches: built.searches.length,
          searchClicks: sum(built.searches.map((row) => row.clicks)),
          pages: built.pages.length,
          pageClicks: sum(built.pages.map((row) => row.clicks)),
          tracked: built.tracked.length,
        },
        oneAsk: compared({ pairs: longPairs as Asked, pages: longPages as Asked }, built),
        weeklyPieces: compared({ pairs: weekPairs as Asked, pages: weekPages as Asked }, built),
      });
    }
    return report;
  },
});
