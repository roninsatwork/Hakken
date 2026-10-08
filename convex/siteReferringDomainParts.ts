import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { packCodes, packDayFigures, packFigures, unpackCodes, unpackFigureRows } from "./utils/packedColumns";
import { LINK_PART_ROWS, LINK_PARTS_READ, LINK_STATUSES, newestNamed, strongestFirst, type LinkStatus } from "./utils/linkListParts";

/**
 * The websites linking to a website, each check's list packed
 * (core-data-normalisation-plan.md §6.3, 2026-10-08). Held one row a linking
 * website, dev's 22,709 came to 8.3 MB — a row's website, check, id and time
 * more than its domain and figures — and six indexes beside. Packed, a
 * check's list is a record of up to `DOMAIN_PART_ROWS`, each figure a column.
 *
 * Read back as the rows were (`ReferringDomainRow`), in the order the screens
 * read them: strongest first, newest first among equals, so the newest list
 * is read over an older one still standing (`newestPerKey`) exactly as before.
 */

/** Linking websites a record holds: a check's list, at most a thousand a page. */
export const DOMAIN_PART_ROWS = LINK_PART_ROWS;

const NUMBERS = ["rank", "backlinks", "spamScore", "brokenBacklinks", "referringPages", "nofollowPages"] as const;
const DAYS = ["firstSeen", "lostDate"] as const;
const KEYS = { numbers: NUMBERS, days: DAYS, required: ["rank", "backlinks"] as const };

/** A linking website as a check's list says of it. */
export type ReferringDomainFigures = {
  domain: string;
  rank: number;
  backlinks: number;
  firstSeen?: string;
  lostDate?: string;
  status: LinkStatus;
  spamScore?: number;
  brokenBacklinks?: number;
  referringPages?: number;
  nofollowPages?: number;
};

/** A linking website as its screens read it: its figures, and the list it came in. */
export type ReferringDomainRow = ReferringDomainFigures & {
  websiteId: Id<"websites">;
  pullId: Id<"seoDataPulls">;
  day: string;
  /** Its list's record's time: which list is newer (`newestPerKey`). */
  _creationTime: number;
};

/** A check's list, a thousand at a time, as one record each. */
export async function writeReferringDomainPart(
  ctx: MutationCtx,
  list: { websiteId: Id<"websites">; pullId: Id<"seoDataPulls">; day: string },
  rows: readonly ReferringDomainFigures[],
): Promise<void> {
  if (rows.length === 0) return;
  await ctx.db.insert("siteReferringDomainParts", {
    ...list,
    domains: rows.map((row) => row.domain),
    ...packFigures(rows, NUMBERS),
    ...packDayFigures(rows, DAYS),
    status: packCodes(rows.map((row) => row.status), LINK_STATUSES),
  });
}

/** A record's linking websites, as rows. */
export function rowsOfPart(part: Doc<"siteReferringDomainParts">): ReferringDomainRow[] {
  const status = unpackCodes(part.status, LINK_STATUSES);
  return unpackFigureRows(part.domains.length, part, KEYS).map((figures, at) => ({
    websiteId: part.websiteId, pullId: part.pullId, day: part.day, _creationTime: part._creationTime,
    domain: part.domains[at],
    ...(figures as Omit<ReferringDomainFigures, "domain" | "status">),
    status: status[at],
  }));
}

function partsOf(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">) {
  return ctx.db.query("siteReferringDomainParts").withIndex("by_site_day", (q) => q.eq("websiteId", websiteId)).take(LINK_PARTS_READ);
}

/**
 * Every linking website a website's lists hold, strongest first and, among
 * equals, the newest list first and the later in a list first — the order the
 * rows were read in by rank, newest first (`by_site_rank`, descending).
 */
export async function readReferringDomains(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">): Promise<ReferringDomainRow[]> {
  return strongestFirst(await partsOf(ctx, websiteId), rowsOfPart, (row) => row.rank);
}

/** A linking website's newest row by its domain, or null. */
export async function referringDomainNamed(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">, domain: string): Promise<ReferringDomainRow | null> {
  return newestNamed(await partsOf(ctx, websiteId), (part) => part.domains, rowsOfPart, domain);
}

/** A check's records, a page at a time: as many removed as `most`, the count returned. */
export async function removeReferringDomainsOfPull(ctx: MutationCtx, pullId: Id<"seoDataPulls">, most: number): Promise<number> {
  const parts = await ctx.db.query("siteReferringDomainParts").withIndex("by_pull", (q) => q.eq("pullId", pullId)).take(most);
  for (const part of parts) await ctx.db.delete(part._id);
  return parts.length;
}

/** A website's records from lists before a day, a page at a time: true once none is left. */
export async function removeReferringDomainsBefore(ctx: MutationCtx, websiteId: Id<"websites">, day: string | null, most: number): Promise<boolean> {
  const parts = await ctx.db
    .query("siteReferringDomainParts")
    .withIndex("by_site_day", (q) => (day === null ? q.eq("websiteId", websiteId) : q.eq("websiteId", websiteId).lt("day", day)))
    .take(most);
  for (const part of parts) await ctx.db.delete(part._id);
  return parts.length < most;
}
