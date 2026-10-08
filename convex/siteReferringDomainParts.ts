import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { packCodes, packColumn, packDays, unpackCodes, unpackColumn, unpackDays } from "./utils/packedColumns";

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
export const DOMAIN_PART_ROWS = 1_000;

const STATUSES = ["LIVE", "NEW", "LOST"] as const;
type Status = (typeof STATUSES)[number];

/** A linking website as a check's list says of it. */
export type ReferringDomainFigures = {
  domain: string;
  rank: number;
  backlinks: number;
  firstSeen?: string;
  lostDate?: string;
  status: Status;
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
    rank: packColumn(rows.map((row) => row.rank)),
    backlinks: packColumn(rows.map((row) => row.backlinks)),
    spamScore: packColumn(rows.map((row) => row.spamScore)),
    brokenBacklinks: packColumn(rows.map((row) => row.brokenBacklinks)),
    referringPages: packColumn(rows.map((row) => row.referringPages)),
    nofollowPages: packColumn(rows.map((row) => row.nofollowPages)),
    firstSeen: packDays(rows.map((row) => row.firstSeen)),
    lostDate: packDays(rows.map((row) => row.lostDate)),
    status: packCodes(rows.map((row) => row.status), STATUSES),
  });
}

/** A record's linking websites, as rows. */
export function rowsOfPart(part: Doc<"siteReferringDomainParts">): ReferringDomainRow[] {
  const rank = unpackColumn(part.rank);
  const backlinks = unpackColumn(part.backlinks);
  const spamScore = unpackColumn(part.spamScore);
  const brokenBacklinks = unpackColumn(part.brokenBacklinks);
  const referringPages = unpackColumn(part.referringPages);
  const nofollowPages = unpackColumn(part.nofollowPages);
  const firstSeen = unpackDays(part.firstSeen);
  const lostDate = unpackDays(part.lostDate);
  const status = unpackCodes(part.status, STATUSES);
  return part.domains.map((domain, at) => {
    const row: ReferringDomainRow = {
      websiteId: part.websiteId, pullId: part.pullId, day: part.day, _creationTime: part._creationTime,
      domain, rank: rank[at] ?? 0, backlinks: backlinks[at] ?? 0, status: status[at],
    };
    if (firstSeen[at] !== undefined) row.firstSeen = firstSeen[at];
    if (lostDate[at] !== undefined) row.lostDate = lostDate[at];
    if (spamScore[at] !== undefined) row.spamScore = spamScore[at];
    if (brokenBacklinks[at] !== undefined) row.brokenBacklinks = brokenBacklinks[at];
    if (referringPages[at] !== undefined) row.referringPages = referringPages[at];
    if (nofollowPages[at] !== undefined) row.nofollowPages = nofollowPages[at];
    return row;
  });
}

/** Records a website's lists may run to: a few thousand linking websites, and a list being replaced beside its successor. */
const PARTS_READ = 64;

/**
 * Every linking website a website's lists hold, strongest first and, among
 * equals, the newest list first and the later in a list first — the order the
 * rows were read in by rank, newest first (`by_site_rank`, descending).
 */
export async function readReferringDomains(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">): Promise<ReferringDomainRow[]> {
  const parts = await ctx.db
    .query("siteReferringDomainParts")
    .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId))
    .take(PARTS_READ);
  const placed = parts
    .sort((left, right) => right._creationTime - left._creationTime)
    .flatMap((part, partAt) => rowsOfPart(part).map((row, at) => ({ row, partAt, at })));
  return placed
    .sort((left, right) => right.row.rank - left.row.rank || left.partAt - right.partAt || right.at - left.at)
    .map((entry) => entry.row);
}

/** A linking website's newest row by its domain, or null. */
export async function referringDomainNamed(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">, domain: string): Promise<ReferringDomainRow | null> {
  const parts = await ctx.db
    .query("siteReferringDomainParts")
    .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId))
    .take(PARTS_READ);
  for (const part of parts.sort((left, right) => right._creationTime - left._creationTime)) {
    const at = part.domains.lastIndexOf(domain);
    if (at !== -1) return rowsOfPart(part)[at];
  }
  return null;
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

/**
 * Dev's rows kept one a linking website before 2026-10-08, a check's at a
 * time, into records (`2026-10-08-pack-referring-domains`): the oldest check
 * first, so a newer list's record is newer, as its rows were, and each list's
 * rows in the order they were filed. Done when no row is left.
 */
export async function packReferringDomainRows(ctx: MutationCtx): Promise<{ cursor: null; isDone: boolean; processed: number; updated: number }> {
  const oldest = await ctx.db.query("siteReferringDomains").first();
  if (!oldest) return { cursor: null, isDone: true, processed: 0, updated: 0 };
  const rows = await ctx.db.query("siteReferringDomains").withIndex("by_pull", (q) => q.eq("pullId", oldest.pullId)).take(MOVED_A_CHECK);
  for (let start = 0; start < rows.length; start += DOMAIN_PART_ROWS) {
    const chunk = rows.slice(start, start + DOMAIN_PART_ROWS);
    await writeReferringDomainPart(ctx, { websiteId: oldest.websiteId, pullId: oldest.pullId, day: oldest.day }, chunk.map((row) => ({
      domain: row.domain, rank: row.rank, backlinks: row.backlinks, status: row.status,
      ...(row.firstSeen !== undefined ? { firstSeen: row.firstSeen } : {}),
      ...(row.lostDate !== undefined ? { lostDate: row.lostDate } : {}),
      ...(row.spamScore !== undefined ? { spamScore: row.spamScore } : {}),
      ...(row.brokenBacklinks !== undefined ? { brokenBacklinks: row.brokenBacklinks } : {}),
      ...(row.referringPages !== undefined ? { referringPages: row.referringPages } : {}),
      ...(row.nofollowPages !== undefined ? { nofollowPages: row.nofollowPages } : {}),
    })));
  }
  for (const row of rows) await ctx.db.delete(row._id);
  return { cursor: null, isDone: false, processed: rows.length, updated: rows.length };
}

/** One check's rows moved a call: a list's page is a thousand, and a call may make 4,096 reads. */
const MOVED_A_CHECK = 3_000;
