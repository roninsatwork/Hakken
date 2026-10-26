"use node";

import { appError } from "./utils/appError";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { fetchHistoryWork } from "./insightHistoryWork";

import { internal } from "./_generated/api";
import { insightsStepArgs } from "./insightsAsk";
import { historyMonths, monthsToFetch } from "./utils/insightHistory";
import { historyPieceValidator, historyStateValidator, type HistoryPiece } from "./utils/insightHistoryRun";
import { HistoryQuotaWait } from "./insightHistoryWork";
import { failureSummary } from "./roleRuns";
import { afterTheHour } from "./googleAnalyticsBudget";

/** Insights history uses the same Node worker pattern as the source collectors. */
export const fetchHistory = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({ records: v.number(), asks: v.number(), problems: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const { memoryMb: _memoryMb, ...done } = await fetchHistoryWork(ctx, args);
    return done;
  },
});

/** Fix the source dates and the months due before booking the first piece. */
export const planForRun = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(historyPieceValidator),
  handler: async (ctx, args): Promise<HistoryPiece[]> => {
    const target = await ctx.runQuery(internal.insightHistory.historyTarget, args);
    if (!target) throw appError("NOT_FOUND", "The website is gone.");
    const held: Array<{ kind: string; month: string; from: string; to: string }> = [];
    for (let cursor: string | null = null; ;) {
      const part: { page: typeof held; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.insightHistory.historyMetadataPart, { ...args, paginationOpts: { cursor, numItems: 4 } });
      held.push(...part.page);
      if (part.isDone) break;
      cursor = part.continueCursor;
    }
    const pieces: HistoryPiece[] = [];
    const monthly = (kind: HistoryPiece["kind"], newestDay: string, missingOnly: boolean) => {
      const all = historyMonths(newestDay);
      const months = missingOnly ? monthsToFetch(all, new Map(held.filter((row) => row.kind === kind).map((row) => [row.month, row]))) : all;
      for (const month of months) pieces.push({ kind, month: month.month, newestDay });
    };
    if (target.console) {
      const newestDay = target.console.newestDay;
      monthly("SC_PAGES", newestDay, true);
      pieces.push({ kind: "SC_SEARCH_PAGES", newestDay }, { kind: "SC_DAYS", newestDay });
    }
    if (target.analytics) {
      const newestDay = target.analytics.newestDay;
      monthly("GA_PAGES", newestDay, true);
      monthly("GA_PAGE_SOURCES", newestDay, true);
      monthly("GA_EVENTS", newestDay, false);
      monthly("GA_SOURCES", newestDay, false);
      pieces.push({ kind: "GA_MONTHS", newestDay });
      if (target.analytics.counted.length > 0) pieces.push({ kind: "GA_JOURNEY", newestDay });
    }
    // Bring useful recent months into view first, then finish every older month. This changes booking order only.
    const rank = (kind: HistoryPiece["kind"]) => ["SC_DAYS", "GA_MONTHS", "GA_SOURCES", "SC_PAGES", "GA_PAGES", "GA_PAGE_SOURCES", "GA_EVENTS", "SC_SEARCH_PAGES", "GA_JOURNEY"].indexOf(kind);
    return pieces.sort((a, b) => {
      const phase = (piece: HistoryPiece) => piece.month ? 1 : piece.kind === "SC_DAYS" || piece.kind === "GA_MONTHS" ? 0 : 2;
      if (phase(a) !== phase(b)) return phase(a) - phase(b);
      if (!a.month || !b.month) return rank(a.kind) - rank(b.kind);
      return b.month.localeCompare(a.month) || rank(a.kind) - rank(b.kind);
    });
  },
});

/** A single source/kind/month finishes before the next is booked; the collection watch owns recovery. */
export const fillForRun = internalAction({
  args: { ...insightsStepArgs, watchId: v.id("_scheduled_functions"), pagesChanged: v.array(v.object({ kind: v.string(), page: v.string() })), history: historyStateValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { history, watchId, pagesChanged, ...run } = args;
    const piece = history.pieces[history.at];
    let next = { ...history };
    let delayMs = 0;
    let memoryMb: number | undefined;
    if (piece) {
      try {
        const done = await fetchHistoryWork(ctx, { holdId: run.holdId, runId: run.runId, chainBooking: run.chainBooking, piece });
        memoryMb = done.memoryMb;
        next = { ...next, at: next.at + 1, records: next.records + done.records, asks: next.asks + done.asks, problems: [...next.problems, ...done.problems], attempt: 0 };
      } catch (error) {
        if (error instanceof HistoryQuotaWait && history.waits < 26) {
          delayMs = afterTheHour(Date.now()) - Date.now();
          next.waits += 1;
          await ctx.runMutation(internal.roleRuns.logRunLine, { runId: run.runId, companyId: run.companyId, heading: "History waiting", detail: `${piece.kind} ${piece.month ?? ""}: ${failureSummary(error)}. Saved history is kept; this run carries on after the allowance refreshes.`, failed: false });
        } else if (!(error instanceof HistoryQuotaWait) && history.attempt < 1) {
          next.attempt += 1;
          delayMs = 5_000;
        } else {
          next.at += 1;
          next.attempt = 0;
          next.problems = [...next.problems, `${piece.kind} ${piece.month ?? ""}: ${failureSummary(error)}`];
        }
      }
    }
    if (next.at < next.pieces.length) {
      await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...run, step: "HISTORY", cancelWatchId: watchId, pagesChanged, history: next, delayMs, ...(memoryMb === undefined ? {} : { memoryMb }) });
    } else {
      await ctx.runMutation(internal.insightsRunSteps.recordStage, { runId: run.runId, companyId: run.companyId, stage: "History", detail: `Kept ${next.records} history records from ${next.asks} asks to Google.${next.problems.length ? ` Unfinished: ${next.problems.join(" ")}` : ""}`.slice(0, 900), failed: next.problems.length > 0 });
      await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...run, step: "PICK", cancelWatchId: watchId, pagesChanged, ...(memoryMb === undefined ? {} : { memoryMb }) });
    }
    return null;
  },
});
