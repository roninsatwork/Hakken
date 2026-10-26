import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { appError } from "./utils/appError";
import { countedOf, conversionsOf } from "./googleAnalyticsRows";
import { EVERY_DEVICE, slotKey, unpackPart, type PackedPart } from "./googleAnalyticsLists";
import { decodePages } from "./holdPageRefs";
import type { PageYear } from "./utils/insightTrack";

/** A page's path, for words: the address without its scheme and host. */
export function pathOf(address: string): string {
  try {
    const url = new URL(address);
    return `${url.pathname}${url.search}`;
  } catch {
    return address;
  }
}

const holdArgs = { holdId: v.id("companyWebsites") };

export type PageYearPart = { rows: PageYear[]; slot: number; hash: string; parts: number; removed: string[] };

export const pageYearPart = internalQuery({
  args: { ...holdArgs, which: v.union(v.literal("NOW"), v.literal("YEAR")), part: v.number(), hash: v.optional(v.string()), slot: v.optional(v.number()) },
  returns: v.union(v.null(), v.object({
    rows: v.array(v.object({ path: v.string(), visits: v.number(), enquiries: v.number() })),
    slot: v.number(), hash: v.string(), parts: v.number(),
    removed: v.array(v.string()),
  })),
  handler: async (ctx, args): Promise<PageYearPart | null> => {
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection?.property) return null;
    const key = slotKey("landing", "365", args.which, EVERY_DEVICE);
    const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("key", key)).first();
    if (!slot) return null;
    if ((args.hash !== undefined && args.hash !== slot.hash) || (args.slot !== undefined && args.slot !== slot.slot)) {
      throw appError("CONFLICT", "Analytics changed while the page changes were being read; try this stage again.");
    }
    const stored = await ctx.db.query("googleAnalyticsPeriods").withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", args.holdId).eq("key", key).eq("slot", slot.slot).eq("part", args.part)).first();
    if (!stored && args.part < slot.parts) throw appError("UPSTREAM_FAILURE", "The saved Analytics list is incomplete; try this stage again.");
    const rows = stored ? unpackPart(stored as PackedPart) : [];
    const addresses = await decodePages(ctx, args.holdId, rows.map((row) => row.key));
    const counted = countedOf(connection);
    return {
      rows: rows.map((row, index) => ({ path: pathOf(addresses[index]), visits: row.visits, enquiries: conversionsOf(row, counted).conversions })),
      slot: slot.slot, hash: slot.hash, parts: slot.parts,
      removed: [],
    };
  },
});
