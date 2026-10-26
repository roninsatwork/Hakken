import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { factValidator } from "./utils/insightFacts";
import { clockValidator, pageSeenValidator } from "./utils/insightClock";
import { originOf } from "./utils/moneyPageChecks";

export const openFindingValidator = v.object({
  findingId: v.id("insightFindings"), specialist: v.string(),
  watch: v.object({ key: v.string(), direction: v.union(v.literal("UP"), v.literal("DOWN")) }),
  then: v.union(v.null(), factValidator), written: v.string(), checkInDays: v.number(),
  clock: v.union(v.null(), clockValidator), checkOn: v.union(v.string(), v.null()), pageSeen: v.union(v.null(), pageSeenValidator),
});

/** The same saved finding shape serves the existing reader and the paged worker. */
export function openFinding(finding: Doc<"insightFindings">): typeof openFindingValidator.type {
  const written = new Date(finding.createdAt).toISOString().slice(0, 10);
  return {
    findingId: finding._id, specialist: finding.specialist, watch: finding.watch!, then: finding.facts.find((fact) => fact.key === finding.watch!.key) ?? null,
    written, checkInDays: finding.checkOn ? Math.round((Date.parse(finding.checkOn) - Date.parse(written)) / 86_400_000) : 56,
    clock: finding.clock ?? null, checkOn: finding.checkOn ?? null, pageSeen: finding.pageSeen ?? null,
  };
}

const partArgs = { holdId: v.id("companyWebsites"), paginationOpts: paginationOptsValidator };

/** Filter each indexed page after reading it: closed recent findings cannot hide older open findings. */
export const openFindingPart = internalQuery({
  args: partArgs,
  returns: v.object({ origin: v.union(v.null(), v.string()), page: v.array(openFindingValidator), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    if (!hold || !website) return { origin: null, page: [], continueCursor: "", isDone: true };
    const console = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const part = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").paginate(args.paginationOpts);
    return { continueCursor: part.continueCursor, isDone: part.isDone, origin: originOf(website, console), page: part.page.filter((finding) => finding.status === "PUBLISHED" && !finding.outcome && finding.watch).map(openFinding) };
  },
});

/** Every retained page-change date is read, in bounded pages, rather than the first 300 changes. */
export const changePart = internalQuery({
  args: partArgs,
  returns: v.object({ page: v.array(v.object({ page: v.string(), day: v.string() })), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const part = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", args.holdId)).paginate(args.paginationOpts);
    return { continueCursor: part.continueCursor, isDone: part.isDone, page: part.page.flatMap((change) => change.from ? [{ page: change.from, day: change.day ?? change.week }] : []) };
  },
});

/** Previously removed pages are checked for restoration without a fixed row cap. */
export const removedPart = internalQuery({
  args: partArgs,
  returns: v.object({ page: v.array(v.string()), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const part = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", "REMOVED")).paginate(args.paginationOpts);
    return { continueCursor: part.continueCursor, isDone: part.isDone, page: part.page.flatMap((change) => change.from ? [change.from] : []) };
  },
});
