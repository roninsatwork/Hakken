import { ConvexError } from "convex/values";
import type { AppErrorData } from "./utils/appError";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { ask as askAnalytics, openSession } from "./googleAnalyticsCollect";
import type { GoogleFailure } from "./googleApi";
import type { ReportAsk, ReportRow, ReportSink } from "./googleAnalyticsApi";
import { askLive } from "./searchConsoleReads";
import { shiftDay } from "./utils/insightFacts";
import { SOURCE_JOIN, addUp, dayOfGoogle, fromGoogleSearch, historyMonths, keepMost, monthOfGoogle, monthsToFetch, pathOf, type HistoryKind, type HistoryMonth, type HistoryRow } from "./utils/insightHistory";
import { memoryMb } from "./utils/stepMemory";
import type { HistoryPiece } from "./utils/insightHistoryRun";

type HeldRecord = { kind: HistoryKind; month: string; from: string; to: string; rows: HistoryRow[]; cut?: boolean };

/** The held months of one kind, by month. */
function heldOf(held: ReadonlyArray<{ kind: HistoryKind; month: string; from: string; to: string }>, kind: HistoryKind) {
  return new Map(held.filter((record) => record.kind === kind).map((record) => [record.month, { from: record.from, to: record.to }]));
}

/** A month's span among the months asked, by its `YYYY-MM`. */
const spanOf = (months: readonly HistoryMonth[], month: string) => months.find((entry) => entry.month === month);

/** Source-heavy history work, run in the Node worker so large website answers have room. */
export async function fetchHistoryWork(ctx: ActionCtx, args: { holdId: Id<"companyWebsites">; piece?: HistoryPiece; runId?: Id<"agentRuns">; chainBooking?: number }): Promise<{ records: number; asks: number; problems: string[]; memoryMb?: number }> {
    const target = await ctx.runQuery(internal.insightHistory.historyTarget, { holdId: args.holdId });
    if (!target) return { records: 0, asks: 0, problems: ["The website is gone."] };
    if (args.piece?.newestDay) {
      if (args.piece.kind.startsWith("SC_") && target.console) target.console.newestDay = args.piece.newestDay;
      if (args.piece.kind.startsWith("GA_") && target.analytics) target.analytics.newestDay = args.piece.newestDay;
    }
    const held: Array<{ kind: HistoryKind; month: string; from: string; to: string }> = [];
    for (let cursor: string | null = null; ;) {
      const part: { page: typeof held; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.insightHistory.historyMetadataPart, { holdId: args.holdId, paginationOpts: { cursor, numItems: 4 } });
      held.push(...part.page);
      if (part.isDone) break;
      cursor = part.continueCursor;
    }
    const selected = (kind: HistoryPiece["kind"]) => !args.piece || args.piece.kind === kind;
    const wantedMonths = (kind: HistoryKind, months: HistoryMonth[]) => {
      if (!selected(kind as HistoryPiece["kind"])) return [];
      const wanted = args.piece?.month ? months.filter((month) => month.month === args.piece?.month) : monthsToFetch(months, heldOf(held, kind));
      return wanted;
    };
    const refused = (answer: GoogleFailure) => {
      if (args.piece && (answer.reason === "BUDGET" || (answer.reason === "BUSY" && /quota|hour|daily|limit|exhaust/i.test(answer.detail)))) throw new HistoryQuotaWait(answer.detail);
    };
    const problems: string[] = [];
    let written = 0;
    let asks = 0;
    let peakMb: number | null = null;
    const sampleMemory = () => { const current = memoryMb(); if (current !== null) peakMb = Math.max(peakMb ?? 0, current); };
    const days = new Map<string, HistoryRow>();
    let daySpan: { from: string; to: string } | null = null;
    const dayRow = (day: string) => {
      let row = days.get(day);
      if (!row) days.set(day, (row = { key: day }));
      return row;
    };
    const newest = [target.console?.newestDay, target.analytics?.newestDay].filter((day): day is string => Boolean(day)).sort().pop();
    if (!newest) return { records: 0, asks: 0, problems: ["Neither Search Console nor Google Analytics is connected."] };
    // Save completed records immediately: a later source failure cannot discard the history already fetched.
    const save = async (record: HeldRecord) => {
      await ctx.runMutation(internal.insightHistory.saveHistory, { holdId: args.holdId, runId: args.runId, chainBooking: args.chainBooking, newestDay: newest, records: [record], ...(args.piece && record.kind === "DAYS" ? { mergeDays: true, mergeDaySource: args.piece.kind.startsWith("SC_") ? "SC" as const : "GA" as const } : {}) });
      written += 1;
    };

    if (target.console) {
      const sc = target.console;
      const months = historyMonths(sc.newestDay);
      for (const month of wantedMonths("SC_PAGES", months)) {
        asks += 1;
        const answer = await askLive(ctx, sc, { startDate: month.from, endDate: month.to, type: "web", dimensions: ["page"] });
        if (!answer.ok) {
          if (args.piece && answer.problem === "GOOGLE_BUSY") throw new HistoryQuotaWait("Search Console is busy or has reached its allowance.");
          problems.push(`Search Console refused ${month.month}'s pages (${answer.problem}).`);
          continue;
        }
        const rows = addUp(answer.rows.map((row) => ({ key: pathOf(row.keys[0] ?? ""), clicks: row.clicks, impressions: row.impressions, positionSum: row.position * row.impressions })));
        await save({ ...month, kind: "SC_PAGES", rows: keepMost(rows) });
      }
      // Each search by the page Google showed for it, the last 90 days (phase 2, "the searches behind the enquiries"):
      // a page's enquiries from Google shared out over its searches by their clicks.
      if (selected("SC_SEARCH_PAGES")) {
      asks += 1;
      const searchFrom = shiftDay(sc.newestDay, -89);
      const searchPages = await askLive(ctx, sc, { startDate: searchFrom, endDate: sc.newestDay, type: "web", dimensions: ["query", "page"] });
      if (searchPages.ok) {
        const rows = addUp(searchPages.rows.filter((row) => row.clicks > 0).map((row) => ({ key: [row.keys[0] ?? "", pathOf(row.keys[1] ?? "")].join(SOURCE_JOIN), clicks: row.clicks, impressions: row.impressions, positionSum: row.position * row.impressions })));
        await save({ kind: "SC_SEARCH_PAGES", month: "", from: searchFrom, to: sc.newestDay, rows: keepMost(rows) });
      } else {
        if (args.piece && searchPages.problem === "GOOGLE_BUSY") throw new HistoryQuotaWait("Search Console is busy or has reached its allowance.");
        problems.push(`Search Console refused the searches by page (${searchPages.problem}).`);
      }
      }
      if (selected("SC_DAYS")) {
      // The website's own days, whole: a few hundred rows, asked each run so the newest settle.
      asks += 1;
      const span = months[0];
      const daily = await askLive(ctx, sc, { startDate: span.from, endDate: sc.newestDay, type: "web", dimensions: ["date"] });
      if (daily.ok) {
        daySpan = { from: span.from, to: sc.newestDay };
        for (const row of daily.rows) {
          const day = dayRow(row.keys[0] ?? "");
          day.clicks = row.clicks;
          day.impressions = row.impressions;
          day.positionSum = row.position * row.impressions;
        }
      } else {
        if (args.piece && daily.problem === "GOOGLE_BUSY") throw new HistoryQuotaWait("Search Console is busy or has reached its allowance.");
        problems.push(`Search Console refused the days (${daily.problem}).`);
      }
      }
    }

    if (target.analytics && (!args.piece || args.piece.kind.startsWith("GA_"))) {
      const analytics = target.analytics;
      const opened = await openSession(ctx, analytics.connectionId);
      if (!opened.ok) {
        problems.push(`Google Analytics could not be opened (${opened.problem}).`);
      } else {
        const months = historyMonths(analytics.newestDay);
        const base = { endDate: analytics.newestDay, hostNames: analytics.addresses, countries: [analytics.country] };
        const askReport = async (report: ReportAsk, sink?: ReportSink) => {
          const before = opened.session.requests;
          const answer = await askAnalytics(opened.session, analytics.property, report, sink);
          asks += opened.session.requests - before;
          return answer;
        };
        const perVisit = new Set(analytics.perVisit);
        /** An event's enquiries from its times and visits (`eventCount`, `sessions`), as the collection counts them (BT1). */
        const countOf = (eventName: string, values: readonly number[]) => (perVisit.has(eventName) ? values[1] : values[0]) ?? 0;
        const withEvents = async (from: string, dimensions: string[], metrics: string[], to: string, consume: (rows: ReportRow[], field: "visits" | "enquiries") => void) => {
          const main = await askReport({ ...base, startDate: from, endDate: to, dimensions, metrics }, (rows) => consume(rows, "visits"));
          if (!main.ok) { refused(main); return null; }
          if (analytics.counted.length === 0) return { cut: main.cut };
          const events = await askReport({
            ...base, startDate: from, endDate: to, dimensions: [...dimensions, "eventName"], metrics: ["eventCount", "sessions"], eventNames: analytics.counted,
          }, (rows) => consume(rows.map((row) => ({ ...row, values: [countOf(row.keys[dimensions.length] ?? "", row.values)] })), "enquiries"));
          if (!events.ok) { refused(events); return null; }
          return { cut: main.cut || events.cut };
        };
        const joinKey = (keys: readonly string[], width: number) => keys.slice(0, width).join(SOURCE_JOIN);

        // Main and event answers feed the same monthly accumulator page by page. Neither complete raw report is retained.
        const monthlyPages = async (kind: "GA_PAGES" | "GA_PAGE_SOURCES", dimensions: string[], keyOf: (keys: readonly string[]) => string, problem: string) => {
          for (const month of wantedMonths(kind, months)) {
            const rows = new Map<string, HistoryRow>();
            const consume = (page: ReportRow[], field: "visits" | "enquiries") => {
              for (const source of page) {
                if (monthOfGoogle(source.keys[0] ?? "") !== month.month) continue;
                const key = keyOf(source.keys);
                const row = rows.get(key) ?? { key, visits: 0, enquiries: 0 };
                row[field] = (row[field] ?? 0) + (source.values[0] ?? 0);
                rows.set(key, row);
              }
              sampleMemory();
            };
            const answer = await withEvents(month.from, dimensions, ["sessions"], month.to, consume);
            sampleMemory();
            if (answer) await save({ ...month, kind, rows: keepMost([...rows.values()]), ...(answer.cut ? { cut: true } : {}) });
            else problems.push(problem);
          }
        };
        await monthlyPages("GA_PAGES", ["yearMonth", "landingPage"], (keys) => pathOf(keys[1] ?? ""), "Google Analytics refused the landing pages by month.");
        await monthlyPages("GA_PAGE_SOURCES", ["yearMonth", "landingPage", "sessionDefaultChannelGroup", "sessionSource"], (keys) => [pathOf(keys[1] ?? ""), keys[2] ?? "", keys[3] ?? ""].join(SOURCE_JOIN), "Google Analytics refused the landing pages by source.");

        // Each event a month, counted as an enquiry or not (phase 2, "each kind of enquiry"): its times, and its enquiries
        // when it is one Hakken counts.
        if (selected("GA_EVENTS")) {
        const events = await askReport({ ...base, startDate: args.piece?.month ? spanOf(months, args.piece.month)!.from : months[0].from, endDate: args.piece?.month ? spanOf(months, args.piece.month)!.to : analytics.newestDay, dimensions: ["yearMonth", "eventName"], metrics: ["eventCount", "sessions"] });
        if (events.ok) {
          const counted = new Set(analytics.counted);
          const byMonth = new Map<string, HistoryRow[]>();
          for (const row of events.rows) {
            const month = monthOfGoogle(row.keys[0] ?? "");
            const name = row.keys[1] ?? "";
            const rows = byMonth.get(month) ?? [];
            rows.push({ key: name, times: row.values[0] ?? 0, enquiries: counted.has(name) ? countOf(name, row.values) : 0 });
            byMonth.set(month, rows);
          }
          for (const [month, rows] of byMonth) {
            const span = spanOf(months, month);
            if (span) await save({ ...span, kind: "GA_EVENTS", rows: keepMost(rows) });
          }
        } else {
          refused(events);
          problems.push("Google Analytics refused the events by month.");
        }

        }
        // The pages read in visits that ended in an enquiry, the last 90 days (phase 2, "pages read on the way"): each
        // page's visits, and of them the visits each counted event happened in, added up and never more than the page's
        // visits. Asked by event, not by Google's share of visits with a key event, which only a marked key event has (BT6).
        if (selected("GA_JOURNEY") && analytics.counted.length > 0) {
          const from = shiftDay(analytics.newestDay, -89);
          const visits = new Map<string, number>(), withEnquiry = new Map<string, number>();
          const read = await askReport({ ...base, startDate: from, dimensions: ["pagePath"], metrics: ["sessions"] }, (rows) => {
            for (const row of rows) visits.set(row.keys[0] ?? "", row.values[0] ?? 0);
            sampleMemory();
          });
          const enquired = await askReport({
            ...base, startDate: from, dimensions: ["pagePath", "eventName"], metrics: ["sessions"], eventNames: analytics.counted,
          }, (rows) => {
            for (const row of rows) withEnquiry.set(row.keys[0] ?? "", (withEnquiry.get(row.keys[0] ?? "") ?? 0) + (row.values[0] ?? 0));
            sampleMemory();
          });
          if (read.ok && enquired.ok) {
            const rows = [...visits].map(([page, sessions]) => ({ key: pathOf(page), visits: sessions, enquiries: Math.min(sessions, withEnquiry.get(page) ?? 0) }));
            await save({ kind: "GA_JOURNEY", month: "", from, to: analytics.newestDay, rows: keepMost(addUp(rows)) });
          } else {
            if (!read.ok) refused(read);
            if (!enquired.ok) refused(enquired);
            problems.push("Google Analytics refused the pages read before an enquiry.");
          }
        }

        // Each source a day, the whole sixteen months: the sources a month, and the days' visits beside Search Console's clicks.
        if (selected("GA_SOURCES")) {
        const sourceSpan = args.piece?.month ? spanOf(months, args.piece.month)! : { from: months[0].from, to: analytics.newestDay };
        const byMonth = new Map<string, Map<string, HistoryRow>>();
        const sourceDays = new Map<string, HistoryRow>();
        const consume = (page: ReportRow[], field: "visits" | "enquiries") => {
          for (const sourceRow of page) {
            const keys = sourceRow.keys, value = sourceRow.values[0] ?? 0;
            const day = dayOfGoogle(keys[0] ?? "");
            const channel = keys[1] ?? "", source = keys[2] ?? "";
            const daily = sourceDays.get(day) ?? { key: day };
            daily[field] = (daily[field] ?? 0) + value;
            if (field === "visits" && fromGoogleSearch(channel, source)) daily.googleVisits = (daily.googleVisits ?? 0) + value;
            sourceDays.set(day, daily);
            const month = day.slice(0, 7);
            let rows = byMonth.get(month);
            if (!rows) byMonth.set(month, (rows = new Map()));
            const key = joinKey([channel, source], 2);
            const row = rows.get(key) ?? { key, visits: 0, enquiries: 0 };
            row[field] = (row[field] ?? 0) + value;
            rows.set(key, row);
          }
          sampleMemory();
        };
        const sources = await withEvents(sourceSpan.from, ["date", "sessionDefaultChannelGroup", "sessionSource"], ["sessions"], sourceSpan.to, consume);
        if (!sources) problems.push("Google Analytics refused the sources by day.");
        else {
          daySpan = sourceSpan;
          for (const [day, row] of sourceDays) Object.assign(dayRow(day), row);
          for (const [month, rows] of byMonth) {
            const span = spanOf(months, month);
            if (span) await save({ ...span, kind: "GA_SOURCES", rows: keepMost([...rows.values()]), ...(sources.cut ? { cut: true } : {}) });
          }
        }
        }
        if (selected("GA_MONTHS")) {
        // People a month: people cannot be added up across days or pages, so Google counts each month whole.
        const people = await askReport({ ...base, startDate: months[0].from, dimensions: ["yearMonth"], metrics: ["totalUsers", "sessions"] });
        if (people.ok) {
          const rows = people.rows.map((row) => ({ key: monthOfGoogle(row.keys[0] ?? ""), people: row.values[0] ?? 0, visits: row.values[1] ?? 0 }));
          await save({ kind: "GA_MONTHS", month: "", from: months[0].from, to: analytics.newestDay, rows: rows.sort((a, b) => a.key.localeCompare(b.key)) });
        } else {
          refused(people);
          problems.push("Google Analytics refused people by month.");
        }
        }
      }
    }

    if (days.size > 0 || (args.piece && daySpan)) {
      const sorted = [...days.values()].filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.key)).sort((a, b) => a.key.localeCompare(b.key));
      if (sorted.length > 0 || daySpan) await save({ kind: "DAYS", month: "", from: args.piece && daySpan ? daySpan.from : sorted[0].key, to: args.piece && daySpan ? daySpan.to : sorted[sorted.length - 1].key, rows: sorted });
    }
    return { records: written, asks, problems, ...(peakMb === null ? {} : { memoryMb: peakMb }) };
}


/** A quota refusal yields to the watched worker; no quick retry spends the reserve. */
export class HistoryQuotaWait extends ConvexError<AppErrorData> {
  constructor(message: string) { super({ code: "UPSTREAM_FAILURE", message }); }
}
