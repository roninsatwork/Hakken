"use node";

import { memoryNow } from "./utils/stepMemory";
import { appError } from "./utils/appError";

import { v } from "convex/values";
import { insightsStepArgs, rulesFor } from "./insightsAsk";
import { weekOf } from "./insightsTeam";
import { failureSummary } from "./roleRuns";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { COMPETING_ROLE, competingForRun, competingFromSources, type CompetingLists, type GroupsForRun } from "./insightCompeting";
import { competingGroupValidator } from "./utils/insightCompeting";
import { bookOfParts, rowsOfPart, withTokens, type ReadPeriod, type PeriodRow } from "./searchConsolePeriodReads";
import { wholeBookFromAction, type BookScope } from "./searchConsolePeriodBooks";
import { tokenPlace } from "./utils/searchConsoleTerms";
import { unpackedPart } from "./utils/searchConsolePacks";
import type { HistoryRecord, PageKind } from "./insightsPeriodData";

type HistoryPart = { page: HistoryRecord[]; continueCursor: string; isDone: boolean };
type PageData = { path: string; kind: PageKind; title: string | null };

/** The same cannibalisation calculation, supplied by bounded database reads in the Node runtime. */
export const groupsForRun = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    from: v.string(), to: v.string(), groups: v.array(competingGroupValidator), websiteRate: v.union(v.number(), v.null()),
    titles: v.array(v.object({ path: v.string(), title: v.string() })),
  })),
  handler: async (ctx, args): Promise<GroupsForRun | null> => {
    const target = await ctx.runQuery(internal.insightCompeting.groupTarget, args);
    if (!target) return null;
    const lists = new Map<CompetingLists, ReadPeriod>();
    const books = new Map<string, Promise<string[]>>();
    const book = async (scope: BookScope, kind: "query" | "page") => {
      const key = `${scope.builtAt}|${kind}`;
      let held = books.get(key);
      if (!held) { held = wholeBookFromAction(ctx, scope, kind); books.set(key, held); }
      return await held;
    };
    const names = async (list: ReadPeriod, values: string[]) => {
      if (!list.book) return new Map(values.map((value) => [value, value]));
      const [queries, pages] = await Promise.all([book(list.book, "query"), book(list.book, "page")]);
      return new Map([...new Set(values)].map((value) => {
        const at = tokenPlace(value);
        return [value, at ? (at.kind === "query" ? queries : pages)[at.place] ?? "" : value];
      }));
    };
    const readList = async (list: CompetingLists): Promise<ReadPeriod | null> => {
      const rows: PeriodRow[] = [];
      let first: Doc<"searchConsolePeriods"> | null = null;
      for (let part = 0; ;) {
        const stored: Doc<"searchConsolePeriods"> | null = await ctx.runQuery(internal.insightCompeting.groupListPart, { ...args, list, part, ...(first ? { builtAt: first.builtAt } : {}) });
        if (!stored) break;
        first ??= stored;
        rowsOfPart(unpackedPart(withTokens(stored)), rows);
        part += 1;
      }
      if (!first) return null;
      const result: ReadPeriod = { from: first.from, to: first.to, builtAt: first.builtAt, shown: first.shown ?? null, rows, book: bookOfParts([first]) };
      if (list === "page" && result.book) {
        const named = await names(result, rows.map((row) => row.key));
        for (const row of rows) row.key = named.get(row.key) ?? row.key;
      }
      lists.set(list, result);
      return result;
    };
    const pageData = new Map<string, PageData>();
    const loadPages = async (paths: string[]) => {
      const missing = [...new Set(paths)].filter((path) => !pageData.has(path));
      for (let at = 0; at < missing.length; at += 25) {
        const data: PageData[] = await ctx.runQuery(internal.insightCompeting.groupPageData, { ...args, paths: missing.slice(at, at + 25) });
        for (const row of data) pageData.set(row.path, row);
      }
    };
    const searchData = async (searches: string[], kind: "volume" | "difficulty") => {
      const found = new Map<string, number | null>();
      for (let at = 0; at < searches.length; at += 25) {
        const data: Array<{ search: string; value: number | null }> = await ctx.runQuery(internal.insightCompeting.groupSearchData, { ...args, kind, searches: searches.slice(at, at + 25) });
        for (const row of data) found.set(row.search, row.value);
      }
      return found;
    };
    const result = await competingFromSources({
      list: readList,
      names,
      history: async () => {
        const records: HistoryRecord[] = [];
        for (let cursor: string | null = null; ;) {
          const part: HistoryPart = await ctx.runQuery(internal.insightHistory.historyDataPart, { ...args, paginationOpts: { cursor, numItems: 4 } });
          records.push(...part.page);
          if (part.isDone) break;
          cursor = part.continueCursor;
        }
        return records;
      },
      kinds: async (paths) => {
        await loadPages(paths);
        return (path) => {
          const held = pageData.get(path);
          if (!held) throw appError("UPSTREAM_FAILURE", `Page classification missing from its batch: ${path}`);
          return held.kind;
        };
      },
      places: async () => target.places,
      volumes: async (searches) => await searchData(searches, "volume"),
      difficulties: async (searches) => await searchData(searches, "difficulty"),
    }, target.host);
    if (!result) {
      if (target.connected) throw appError("CONFLICT", "Search Console has no completed competing-page list to analyse yet. Previous completed results are kept.");
      return null;
    }
    // Pin all list builds through the calculation, rather than silently joining a rebuild halfway through.
    for (const [list, held] of lists) await ctx.runQuery(internal.insightCompeting.groupListPart, { ...args, list, part: 0, builtAt: held.builtAt });
    const paths = [...new Set(result.groups.flatMap((group) => group.pages.map((page) => page.path)))];
    await loadPages(paths);
    const titles = paths.flatMap((path) => pageData.get(path)?.title ? [{ path, title: pageData.get(path)!.title! }] : []);
    return { ...result, titles };
  },
});


/** Prepare no more than one parallel batch of paid specialist answers before handing on. */
export const prepareGroups = internalAction({
  args: { ...insightsStepArgs, watchId: v.id("_scheduled_functions"), pagesChanged: v.array(v.object({ kind: v.string(), page: v.string() })), competingAttempt: v.optional(v.number()), competingAt: v.optional(v.number()), competingSignature: v.optional(v.string()), competingProblems: v.optional(v.array(v.string())) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { watchId, pagesChanged, competingAttempt = 0, competingAt = 0, competingSignature, competingProblems = [], ...run } = args;
    let problems = competingProblems;
    try {
      const setup = await ctx.runQuery(internal.insightsTeam.teamSetup, {});
      const member = setup.members.find((entry) => entry.role === COMPETING_ROLE && entry.isActive) ?? setup.members.find((entry) => entry.role === INSIGHTS_LEAD_ROLE && entry.isActive);
      const shop = await ctx.runQuery(internal.insightsReading.isShopInternal, { holdId: run.holdId });
      const done = await competingForRun(ctx, run, weekOf(Date.now()), rulesFor({ ...run, shop }), member, { at: competingAt, most: 8, signature: competingSignature });
      if (done.problems.length > 0 && competingAttempt === 0) {
        await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...memoryNow(), ...run, step: "GROUPS", cancelWatchId: watchId, pagesChanged, competingAt, competingSignature: done.batch.signature, competingProblems, competingAttempt: 1, delayMs: 5_000 });
        return null;
      }
      problems = [...problems, ...done.problems];
      if (!done.batch.complete) {
        await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...memoryNow(), ...run, step: "GROUPS", cancelWatchId: watchId, pagesChanged, competingAt: done.batch.next, competingAttempt: 0, competingSignature: done.batch.signature, competingProblems: problems });
        return null;
      }
    } catch (error) { problems = [...problems, failureSummary(error)]; }
    if (problems.length > 0) await ctx.runMutation(internal.insightsRunSteps.recordStage, { runId: run.runId, companyId: run.companyId, stage: "Keyword cannibalisation", detail: problems.join("; "), failed: true });
    await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...memoryNow(), ...run, step: "DECIDE", cancelWatchId: watchId, pagesChanged });
    return null;
  },
});
