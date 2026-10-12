import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { countedOf } from "./googleAnalyticsRows";
import { ask as askAnalytics, countryIdOf, openSession } from "./googleAnalyticsCollect";
import type { ReportRow } from "./googleAnalyticsApi";
import { mainConsoleCountry } from "./searchConsoleCountries";
import { askLive } from "./searchConsoleReads";
import { shiftDay } from "./utils/insightFacts";
import {
  SOURCE_JOIN,
  addUp,
  dayOfGoogle,
  firstMonthKept,
  fromGoogleSearch,
  historyKindValidator,
  historyMonths,
  historyRowValidator,
  keepMost,
  monthOfGoogle,
  monthsToFetch,
  pathOf,
  type HistoryKind,
  type HistoryMonth,
  type HistoryRow,
} from "./utils/insightHistory";

/**
 * The research's history (utils/insightHistory.ts): sixteen months of Search
 * Console and Google Analytics asked of Google, which charges nothing, and
 * kept as small lines — each page and each source a month, the website a day.
 * Asked once whole, then each run the months not yet held and the newest two
 * again. Only the Insights run reads and writes it, for its own website.
 */

/**
 * Records a hold keeps at most: six kinds a record a month for seventeen
 * months at most, and the three whole-span ones — read in one bounded read,
 * never a collect.
 */
const RECORDS_MOST = 200;

const recordValidator = v.object({
  kind: historyKindValidator,
  month: v.string(),
  from: v.string(),
  to: v.string(),
  rows: v.array(historyRowValidator),
  cut: v.optional(v.boolean()),
});

/** Where a hold's history is asked: its two connections, and what it holds already. */
export const historyTarget = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    console: v.union(v.null(), v.object({ connectionId: v.id("searchConsoleConnections"), property: v.string(), newestDay: v.string() })),
    analytics: v.union(v.null(), v.object({
      connectionId: v.id("googleAnalyticsConnections"),
      property: v.string(),
      addresses: v.array(v.string()),
      country: v.string(),
      counted: v.array(v.string()),
      newestDay: v.string(),
    })),
    held: v.array(v.object({ kind: historyKindValidator, month: v.string(), from: v.string(), to: v.string() })),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return null;
    const sc = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const ga = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const held = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", hold._id)).take(RECORDS_MOST);
    return {
      console: sc?.status === "CONNECTED" && sc.property && sc.newestDay ? { connectionId: sc._id, property: sc.property, newestDay: sc.newestDay } : null,
      analytics: ga?.status === "CONNECTED" && ga.property && ga.newestDay
        ? {
          connectionId: ga._id,
          property: ga.property,
          addresses: ga.addresses ?? [],
          country: countryIdOf(ga.mainCountry ?? mainConsoleCountry(hold)),
          counted: countedOf(ga).map((event) => event.eventName),
          newestDay: ga.newestDay,
        }
        : null,
      held: held.map((record) => ({ kind: record.kind, month: record.month, from: record.from, to: record.to })),
    };
  },
});

/**
 * Each record written over its own (one a kind and month, the days a single
 * one), and the months now older than sixteen months removed: the table keeps
 * to its rule as each new month comes (keepRules.ts).
 */
export const saveHistory = internalMutation({
  args: { holdId: v.id("companyWebsites"), newestDay: v.string(), records: v.array(recordValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const record of args.records) {
      const held = await ctx.db
        .query("insightHistory")
        .withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", record.kind).eq("month", record.month))
        .first();
      const row = { companyWebsiteId: args.holdId, ...record, fetchedAt: now };
      if (held) await ctx.db.replace(held._id, row);
      else await ctx.db.insert("insightHistory", row);
    }
    const first = firstMonthKept(args.newestDay);
    const all = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId)).take(RECORDS_MOST);
    for (const record of all) {
      if (record.month !== "" && record.month < first) await ctx.db.delete(record._id);
    }
    return null;
  },
});

/** A hold's whole history, for the research to read. */
export const historyOf = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(recordValidator),
  handler: async (ctx, args) => {
    const all = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", args.holdId)).take(RECORDS_MOST);
    return all.map(({ kind, month, from, to, rows, cut }) => ({ kind, month, from, to, rows, ...(cut !== undefined ? { cut } : {}) }));
  },
});

type HeldRecord = { kind: HistoryKind; month: string; from: string; to: string; rows: HistoryRow[]; cut?: boolean };

/** The held months of one kind, by month. */
function heldOf(held: ReadonlyArray<{ kind: HistoryKind; month: string; from: string; to: string }>, kind: HistoryKind) {
  return new Map(held.filter((record) => record.kind === kind).map((record) => [record.month, { from: record.from, to: record.to }]));
}

/** A month's span among the months asked, by its `YYYY-MM`. */
const spanOf = (months: readonly HistoryMonth[], month: string) => months.find((entry) => entry.month === month);

/**
 * Asks Google for what the hold does not hold yet, and the newest months
 * again, and keeps it. Search Console: each page a month, and the website's
 * clicks, times shown and position a day. Analytics: each landing page and
 * each source a month, people a month, and visits — all, and from Google's own
 * search — a day. A source not connected is left out; a refusal is said, and
 * the rest kept.
 */
export const fetchHistory = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({ records: v.number(), asks: v.number(), problems: v.array(v.string()) }),
  handler: async (ctx, args): Promise<{ records: number; asks: number; problems: string[] }> => {
    const target = await ctx.runQuery(internal.insightHistory.historyTarget, { holdId: args.holdId });
    if (!target) return { records: 0, asks: 0, problems: ["The website is gone."] };
    const problems: string[] = [];
    const records: HeldRecord[] = [];
    let asks = 0;
    const days = new Map<string, HistoryRow>();
    const dayRow = (day: string) => {
      let row = days.get(day);
      if (!row) days.set(day, (row = { key: day }));
      return row;
    };
    const newest = [target.console?.newestDay, target.analytics?.newestDay].filter((day): day is string => Boolean(day)).sort().pop();
    if (!newest) return { records: 0, asks: 0, problems: ["Neither Search Console nor Google Analytics is connected."] };

    if (target.console) {
      const sc = target.console;
      const months = historyMonths(sc.newestDay);
      for (const month of monthsToFetch(months, heldOf(target.held, "SC_PAGES"))) {
        asks += 1;
        const answer = await askLive(ctx, sc, { startDate: month.from, endDate: month.to, type: "web", dimensions: ["page"] });
        if (!answer.ok) {
          problems.push(`Search Console refused ${month.month}'s pages (${answer.problem}).`);
          continue;
        }
        const rows = addUp(answer.rows.map((row) => ({ key: pathOf(row.keys[0] ?? ""), clicks: row.clicks, impressions: row.impressions, positionSum: row.position * row.impressions })));
        records.push({ ...month, kind: "SC_PAGES", rows: keepMost(rows) });
      }
      // Each search by the page Google showed for it, the last 90 days (phase 2, "the searches behind the enquiries"):
      // a page's enquiries from Google shared out over its searches by their clicks.
      asks += 1;
      const searchFrom = shiftDay(sc.newestDay, -89);
      const searchPages = await askLive(ctx, sc, { startDate: searchFrom, endDate: sc.newestDay, type: "web", dimensions: ["query", "page"] });
      if (searchPages.ok) {
        const rows = addUp(searchPages.rows.filter((row) => row.clicks > 0).map((row) => ({ key: [row.keys[0] ?? "", pathOf(row.keys[1] ?? "")].join(SOURCE_JOIN), clicks: row.clicks, impressions: row.impressions, positionSum: row.position * row.impressions })));
        records.push({ kind: "SC_SEARCH_PAGES", month: "", from: searchFrom, to: sc.newestDay, rows: keepMost(rows) });
      } else {
        problems.push(`Search Console refused the searches by page (${searchPages.problem}).`);
      }
      // The website's own days, whole: a few hundred rows, asked each run so the newest settle.
      asks += 1;
      const span = months[0];
      const daily = await askLive(ctx, sc, { startDate: span.from, endDate: sc.newestDay, type: "web", dimensions: ["date"] });
      if (daily.ok) {
        for (const row of daily.rows) {
          const day = dayRow(row.keys[0] ?? "");
          day.clicks = row.clicks;
          day.impressions = row.impressions;
          day.positionSum = row.position * row.impressions;
        }
      } else {
        problems.push(`Search Console refused the days (${daily.problem}).`);
      }
    }

    if (target.analytics) {
      const analytics = target.analytics;
      const opened = await openSession(ctx, analytics.connectionId);
      if (!opened.ok) {
        problems.push(`Google Analytics could not be opened (${opened.problem}).`);
      } else {
        const months = historyMonths(analytics.newestDay);
        const base = { endDate: analytics.newestDay, hostNames: analytics.addresses, countries: [analytics.country] };
        const withEvents = async (from: string, dimensions: string[], metrics: string[]) => {
          asks += 1;
          const main = await askAnalytics(opened.session, analytics.property, { ...base, startDate: from, dimensions, metrics });
          if (!main.ok) return null;
          if (analytics.counted.length === 0) return { main: main.rows, events: [] as ReportRow[], cut: main.cut };
          asks += 1;
          const events = await askAnalytics(opened.session, analytics.property, {
            ...base, startDate: from, dimensions: [...dimensions, "eventName"], metrics: ["keyEvents"], eventNames: analytics.counted,
          });
          return events.ok ? { main: main.rows, events: events.rows, cut: main.cut || events.cut } : null;
        };
        const joinKey = (keys: readonly string[], width: number) => keys.slice(0, width).join(SOURCE_JOIN);

        // Each landing page a month, for the months not held and the newest two.
        const wanted = monthsToFetch(months, heldOf(target.held, "GA_PAGES"));
        if (wanted.length > 0) {
          const pages = await withEvents(wanted[0].from, ["yearMonth", "landingPage"], ["sessions"]);
          if (!pages) {
            problems.push("Google Analytics refused the landing pages by month.");
          } else {
            const byMonth = new Map<string, Map<string, HistoryRow>>();
            const add = (keys: readonly string[], field: "visits" | "enquiries", value: number) => {
              const month = monthOfGoogle(keys[0] ?? "");
              let rows = byMonth.get(month);
              if (!rows) byMonth.set(month, (rows = new Map()));
              const key = pathOf(keys[1] ?? "");
              let row = rows.get(key);
              if (!row) rows.set(key, (row = { key, visits: 0, enquiries: 0 }));
              row[field] = (row[field] ?? 0) + value;
            };
            for (const row of pages.main) add(row.keys, "visits", row.values[0] ?? 0);
            for (const row of pages.events) add(row.keys, "enquiries", row.values[0] ?? 0);
            for (const month of wanted) {
              records.push({ ...month, kind: "GA_PAGES", rows: keepMost([...(byMonth.get(month.month)?.values() ?? [])]), ...(pages.cut ? { cut: true } : {}) });
            }
          }
        }

        // Each landing page by where its visitors came from, a month (phase 2): Google's share of a page's enquiries, and
        // which pages each AI assistant sends people to.
        const pagesBySource = monthsToFetch(months, heldOf(target.held, "GA_PAGE_SOURCES"));
        if (pagesBySource.length > 0) {
          const asked = await withEvents(pagesBySource[0].from, ["yearMonth", "landingPage", "sessionDefaultChannelGroup", "sessionSource"], ["sessions"]);
          if (!asked) {
            problems.push("Google Analytics refused the landing pages by source.");
          } else {
            const byMonth = new Map<string, Map<string, HistoryRow>>();
            const add = (keys: readonly string[], field: "visits" | "enquiries", value: number) => {
              const month = monthOfGoogle(keys[0] ?? "");
              let rows = byMonth.get(month);
              if (!rows) byMonth.set(month, (rows = new Map()));
              const key = [pathOf(keys[1] ?? ""), keys[2] ?? "", keys[3] ?? ""].join(SOURCE_JOIN);
              let row = rows.get(key);
              if (!row) rows.set(key, (row = { key, visits: 0, enquiries: 0 }));
              row[field] = (row[field] ?? 0) + value;
            };
            for (const row of asked.main) add(row.keys, "visits", row.values[0] ?? 0);
            for (const row of asked.events) add(row.keys, "enquiries", row.values[0] ?? 0);
            for (const month of pagesBySource) {
              records.push({ ...month, kind: "GA_PAGE_SOURCES", rows: keepMost([...(byMonth.get(month.month)?.values() ?? [])]), ...(asked.cut ? { cut: true } : {}) });
            }
          }
        }

        // Each event a month, counted as an enquiry or not (phase 2, "each kind of enquiry"): its times, and its enquiries
        // when it is one Hakken counts.
        asks += 1;
        const events = await askAnalytics(opened.session, analytics.property, { ...base, startDate: months[0].from, dimensions: ["yearMonth", "eventName"], metrics: ["eventCount", "keyEvents"] });
        if (events.ok) {
          const counted = new Set(analytics.counted);
          const byMonth = new Map<string, HistoryRow[]>();
          for (const row of events.rows) {
            const month = monthOfGoogle(row.keys[0] ?? "");
            const name = row.keys[1] ?? "";
            const rows = byMonth.get(month) ?? [];
            rows.push({ key: name, times: row.values[0] ?? 0, enquiries: counted.has(name) ? row.values[1] ?? 0 : 0 });
            byMonth.set(month, rows);
          }
          for (const [month, rows] of byMonth) {
            const span = spanOf(months, month);
            if (span) records.push({ ...span, kind: "GA_EVENTS", rows: keepMost(rows) });
          }
        } else {
          problems.push("Google Analytics refused the events by month.");
        }

        // The pages read in visits that ended in an enquiry, the last 90 days (phase 2, "pages read on the way"): each
        // page's visits, and of them the visits with an enquiry, from each counted event's share of visits.
        if (analytics.counted.length > 0) {
          asks += 1;
          const from = shiftDay(analytics.newestDay, -89);
          const read = await askAnalytics(opened.session, analytics.property, {
            ...base, startDate: from, dimensions: ["pagePath"], metrics: ["sessions", ...analytics.counted.slice(0, 9).map((event) => `sessionKeyEventRate:${event}`)],
          });
          if (read.ok) {
            const rows = read.rows.map((row) => {
              const sessions = row.values[0] ?? 0;
              const rate = Math.min(1, row.values.slice(1).reduce((sum, value) => sum + (value ?? 0), 0));
              return { key: pathOf(row.keys[0] ?? ""), visits: sessions, enquiries: Math.round(sessions * rate) };
            });
            records.push({ kind: "GA_JOURNEY", month: "", from, to: analytics.newestDay, rows: keepMost(addUp(rows)) });
          } else {
            problems.push("Google Analytics refused the pages read before an enquiry.");
          }
        }

        // Each source a day, the whole sixteen months: the sources a month, and the days' visits beside Search Console's clicks.
        const sources = await withEvents(months[0].from, ["date", "sessionDefaultChannelGroup", "sessionSource"], ["sessions"]);
        if (!sources) {
          problems.push("Google Analytics refused the sources by day.");
        } else {
          const byMonth = new Map<string, Map<string, HistoryRow>>();
          const add = (keys: readonly string[], field: "visits" | "enquiries", value: number) => {
            const day = dayOfGoogle(keys[0] ?? "");
            const channel = keys[1] ?? "", source = keys[2] ?? "";
            const daily = dayRow(day);
            daily[field] = (daily[field] ?? 0) + value;
            if (field === "visits" && fromGoogleSearch(channel, source)) daily.googleVisits = (daily.googleVisits ?? 0) + value;
            const month = day.slice(0, 7);
            let rows = byMonth.get(month);
            if (!rows) byMonth.set(month, (rows = new Map()));
            const key = joinKey([channel, source], 2);
            let row = rows.get(key);
            if (!row) rows.set(key, (row = { key, visits: 0, enquiries: 0 }));
            row[field] = (row[field] ?? 0) + value;
          };
          for (const row of sources.main) add(row.keys, "visits", row.values[0] ?? 0);
          for (const row of sources.events) add(row.keys, "enquiries", row.values[0] ?? 0);
          for (const [month, rows] of byMonth) {
            const span = spanOf(months, month);
            if (span) records.push({ ...span, kind: "GA_SOURCES", rows: keepMost([...rows.values()]), ...(sources.cut ? { cut: true } : {}) });
          }
        }

        // People a month: people cannot be added up across days or pages, so Google counts each month whole.
        asks += 1;
        const people = await askAnalytics(opened.session, analytics.property, { ...base, startDate: months[0].from, dimensions: ["yearMonth"], metrics: ["totalUsers", "sessions"] });
        if (people.ok) {
          const rows = people.rows.map((row) => ({ key: monthOfGoogle(row.keys[0] ?? ""), people: row.values[0] ?? 0, visits: row.values[1] ?? 0 }));
          records.push({ kind: "GA_MONTHS", month: "", from: months[0].from, to: analytics.newestDay, rows: rows.sort((a, b) => a.key.localeCompare(b.key)) });
        } else {
          problems.push("Google Analytics refused people by month.");
        }
      }
    }

    if (days.size > 0) {
      const sorted = [...days.values()].filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.key)).sort((a, b) => a.key.localeCompare(b.key));
      if (sorted.length > 0) records.push({ kind: "DAYS", month: "", from: sorted[0].key, to: sorted[sorted.length - 1].key, rows: sorted });
    }
    await saveRecords(ctx, args.holdId, newest, records);
    return { records: records.length, asks, problems };
  },
});

/** Saved a few records a call: a month of pages is a few hundred kilobytes at most. */
const RECORDS_PER_SAVE = 4;

async function saveRecords(ctx: ActionCtx, holdId: Id<"companyWebsites">, newestDay: string, records: readonly HeldRecord[]) {
  for (let at = 0; at < records.length; at += RECORDS_PER_SAVE) {
    await ctx.runMutation(internal.insightHistory.saveHistory, { holdId, newestDay, records: records.slice(at, at + RECORDS_PER_SAVE) });
  }
  if (records.length === 0) await ctx.runMutation(internal.insightHistory.saveHistory, { holdId, newestDay, records: [] });
}
