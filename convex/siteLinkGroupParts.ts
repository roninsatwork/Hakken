import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { subnetOf } from "./dataForSeoLinkParsers";
import { packCodes, packDayFigures, packFigures, unpackCodes, unpackFigureRows } from "./utils/packedColumns";
import { LINK_PARTS_READ, LINK_STATUSES, newestNamed, strongestFirst, type LinkStatus } from "./utils/linkListParts";

/**
 * The words other websites link to a website with, and the servers those links
 * come from, each check's list packed (core-data-normalisation-plan.md §6.3,
 * 2026-10-08) as its linking websites are (`siteReferringDomainParts.ts`).
 * Held one row an anchor or server, dev's 2,617 came to 0.9 MB beside ten
 * indexes and two search indexes; packed, a check's list is a record of up to
 * a thousand. A server's network is worked out from its address (`subnetOf`),
 * and the networks chart counts the servers held (`networksOf`) rather than a
 * table of its own written beside them.
 */

const NUMBERS = ["rank", "backlinks", "referringDomains", "spamScore"] as const;
const DAYS = ["firstSeen", "lostDate"] as const;
const KEYS = { numbers: NUMBERS, days: DAYS, required: ["rank", "backlinks", "referringDomains"] as const };

/** An anchor or a server as a check's list says of it. */
export type LinkGroupFigures = {
  rank: number;
  backlinks: number;
  referringDomains: number;
  firstSeen?: string;
  lostDate?: string;
  status: LinkStatus;
  spamScore?: number;
};

/** The list a row came in, and its record's time: which list is newer (`newestPerKey`). */
type ListOf = { websiteId: Id<"websites">; pullId: Id<"seoDataPulls">; day: string; _creationTime: number };

export type AnchorRow = LinkGroupFigures & ListOf & { anchor: string };
export type ReferringIpRow = LinkGroupFigures & ListOf & { ip: string; subnet: string };

type List = { websiteId: Id<"websites">; pullId: Id<"seoDataPulls">; day: string };
type GroupPart = Doc<"siteAnchorParts"> | Doc<"siteReferringIpParts">;

function packGroup(rows: readonly LinkGroupFigures[]) {
  return {
    ...packFigures(rows, NUMBERS),
    ...packDayFigures(rows, DAYS),
    status: packCodes(rows.map((row) => row.status), LINK_STATUSES),
  };
}

function figuresOf(part: GroupPart, count: number): Array<LinkGroupFigures & ListOf> {
  const status = unpackCodes(part.status, LINK_STATUSES);
  return unpackFigureRows(count, part, KEYS).map((figures, at) => ({
    websiteId: part.websiteId, pullId: part.pullId, day: part.day, _creationTime: part._creationTime,
    ...(figures as Omit<LinkGroupFigures, "status">),
    status: status[at],
  }));
}

/** A record's anchors, as rows. */
export function anchorsOfPart(part: Doc<"siteAnchorParts">): AnchorRow[] {
  return figuresOf(part, part.anchors.length).map((row, at) => ({ ...row, anchor: part.anchors[at] }));
}

/** A record's servers, as rows, each with its network. */
export function serversOfPart(part: Doc<"siteReferringIpParts">): ReferringIpRow[] {
  return figuresOf(part, part.ips.length).map((row, at) => ({ ...row, ip: part.ips[at], subnet: subnetOf(part.ips[at]) }));
}

/** A check's anchors, a thousand at a time, as one record each. */
export async function writeAnchorPart(ctx: MutationCtx, list: List, rows: ReadonlyArray<LinkGroupFigures & { anchor: string }>): Promise<void> {
  if (rows.length === 0) return;
  await ctx.db.insert("siteAnchorParts", { ...list, anchors: rows.map((row) => row.anchor), ...packGroup(rows) });
}

/** A check's servers, a thousand at a time, as one record each. */
export async function writeServerPart(ctx: MutationCtx, list: List, rows: ReadonlyArray<LinkGroupFigures & { ip: string }>): Promise<void> {
  if (rows.length === 0) return;
  await ctx.db.insert("siteReferringIpParts", { ...list, ips: rows.map((row) => row.ip), ...packGroup(rows) });
}

function anchorParts(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">) {
  return ctx.db.query("siteAnchorParts").withIndex("by_site_day", (q) => q.eq("websiteId", websiteId)).take(LINK_PARTS_READ);
}

function serverParts(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">) {
  return ctx.db.query("siteReferringIpParts").withIndex("by_site_day", (q) => q.eq("websiteId", websiteId)).take(LINK_PARTS_READ);
}

/** Every anchor a website's lists hold, most links first, the newest list first among equals. */
export async function readAnchors(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">): Promise<AnchorRow[]> {
  return strongestFirst(await anchorParts(ctx, websiteId), anchorsOfPart, (row) => row.backlinks);
}

/** Every server a website's lists hold, most links first, the newest list first among equals. */
export async function readServers(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">): Promise<ReferringIpRow[]> {
  return strongestFirst(await serverParts(ctx, websiteId), serversOfPart, (row) => row.backlinks);
}

/** An anchor's newest row by its words, or null. */
export async function anchorNamed(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">, anchor: string): Promise<AnchorRow | null> {
  return newestNamed(await anchorParts(ctx, websiteId), (part) => part.anchors, anchorsOfPart, anchor);
}

/** A network's servers counted: how many, their links and their linking websites. */
export type NetworkRow = { subnet: string; ips: number; backlinks: number; referringDomains: number };

/** The networks of these servers, most linking websites first: the Referring IPs chart, counted from the list it sits over. */
export function networksOf(servers: readonly ReferringIpRow[]): NetworkRow[] {
  const networks = new Map<string, NetworkRow>();
  for (const server of servers) {
    const held = networks.get(server.subnet) ?? { subnet: server.subnet, ips: 0, backlinks: 0, referringDomains: 0 };
    held.ips += 1;
    held.backlinks += server.backlinks;
    held.referringDomains += server.referringDomains;
    networks.set(server.subnet, held);
  }
  return [...networks.values()].sort((left, right) => right.referringDomains - left.referringDomains);
}

/** A website's anchor and server records from lists before a day (every one, when `day` is null), a page at a time: true once none is left. */
export async function removeGroupPartsBefore(
  ctx: MutationCtx,
  table: "siteAnchorParts" | "siteReferringIpParts",
  websiteId: Id<"websites">,
  day: string | null,
  most: number,
): Promise<boolean> {
  const parts = table === "siteAnchorParts"
    ? await ctx.db.query("siteAnchorParts")
      .withIndex("by_site_day", (q) => (day === null ? q.eq("websiteId", websiteId) : q.eq("websiteId", websiteId).lt("day", day)))
      .take(most)
    : await ctx.db.query("siteReferringIpParts")
      .withIndex("by_site_day", (q) => (day === null ? q.eq("websiteId", websiteId) : q.eq("websiteId", websiteId).lt("day", day)))
      .take(most);
  for (const part of parts) await ctx.db.delete(part._id);
  return parts.length < most;
}
