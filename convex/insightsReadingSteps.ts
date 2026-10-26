"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { pageChanges as comparePages, changeKindValidator, changeResultValidator, type Change, type PageYear } from "./utils/insightTrack";

import type { PageYearPart } from "./insightsReading";

/** Read annual Analytics lists a part at a time, keeping every page and pinning each list's build. */
export const pageChanges = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({
    changes: v.array(v.object({ kind: changeKindValidator, from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()), day: v.optional(v.string()), before: v.number(), after: v.number(), result: changeResultValidator })),
    notRemoved: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<{ changes: Change[]; notRemoved: string[] }> => {
    const years = new Map<string, PageYear[]>();
    const removed: string[] = [];
    const snapshots: Array<{ which: "NOW" | "YEAR"; hash: string; slot: number }> = [];
    for (const which of ["NOW", "YEAR"] as const) {
      const rows: PageYear[] = [];
      let snapshot: { hash: string; slot: number } | undefined;
      for (let part = 0; ;) {
        const answer: PageYearPart | null = await ctx.runQuery(internal.insightsReading.pageYearPart, { ...args, which, part, ...snapshot });
        if (!answer) return { changes: [], notRemoved: [] };
        rows.push(...answer.rows);

        snapshot = { hash: answer.hash, slot: answer.slot };
        part += 1;
        if (part >= answer.parts) break;
      }
      snapshots.push({ which, ...snapshot! });
      years.set(which, rows);
    }
    // A concurrent rebuild must not combine different generations into one change calculation.
    for (const snapshot of snapshots) await ctx.runQuery(internal.insightsReading.pageYearPart, { ...args, ...snapshot, part: 0 });
    for (let cursor: string | null = null; ;) {
      const part: { page: string[]; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.insightsTrackParts.removedPart, { ...args, paginationOpts: { cursor, numItems: 100 } });
      removed.push(...part.page);
      if (part.isDone) break;
      cursor = part.continueCursor;
    }
    const now = years.get("NOW")!;
    const live = new Set(now.filter((page) => page.visits > 0).map((page) => page.path));
    return { changes: comparePages(now, years.get("YEAR")!), notRemoved: removed.filter((from) => live.has(from)) };
  },
});
