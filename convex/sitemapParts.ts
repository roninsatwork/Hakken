import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { packColumn, unpackColumn } from "./utils/packedColumns";

/**
 * A sitemap reading's pages, a thousand a record (core-data-normalisation-
 * plan.md §6.3, 2026-10-08): one row a page was 4,966 rows on dev, each its
 * website, reading, id and time beside its address — and its listing file's
 * name, the same few names over and over. A record keeps each file once.
 */

/** Pages a record holds. */
export const SITEMAP_PART_PAGES = 1_000;

/** A page as a sitemap listed it. */
export type SitemapPageRow = { page: string; file: string; lastmod?: string };

/** A reading's pages as one record. */
export async function writeSitemapPart(ctx: MutationCtx, reading: { websiteId: Id<"websites">; readAt: number }, rows: readonly SitemapPageRow[]): Promise<void> {
  if (rows.length === 0) return;
  const files = [...new Set(rows.map((row) => row.file))];
  const placeOf = new Map(files.map((file, at) => [file, at]));
  await ctx.db.insert("siteSitemapParts", {
    ...reading,
    pages: rows.map((row) => row.page),
    files,
    fileOf: packColumn(rows.map((row) => placeOf.get(row.file))),
    lastmods: rows.map((row) => row.lastmod ?? null),
  });
}

/** A record's pages, as rows, in the order listed. */
export function pagesOfPart(part: Doc<"siteSitemapParts">): SitemapPageRow[] {
  const fileOf = unpackColumn(part.fileOf);
  return part.pages.map((page, at) => {
    const lastmod = part.lastmods[at];
    return { page, file: part.files[fileOf[at] ?? 0], ...(lastmod !== null ? { lastmod } : {}) };
  });
}

/** Records read a request: two thousand pages, as the rows were read. */
const PARTS_A_READ = 2;

/** One batch of a reading's pages, in the order listed. */
export async function sitemapPagesPage(
  ctx: { db: QueryCtx["db"] },
  args: { websiteId: Id<"websites">; readAt: number; cursor: string | null },
): Promise<{ rows: SitemapPageRow[]; cursor: string; isDone: boolean }> {
  const result = await ctx.db
    .query("siteSitemapParts")
    .withIndex("by_website_read", (q) => q.eq("websiteId", args.websiteId).eq("readAt", args.readAt))
    .paginate({ cursor: args.cursor, numItems: PARTS_A_READ });
  return { rows: result.page.flatMap(pagesOfPart), cursor: result.continueCursor, isDone: result.isDone };
}

/**
 * Dev's sitemap pages kept one a row before 2026-10-08 moved into records
 * (`2026-10-08-sitemap-parts`), a reading's at a time in the order listed;
 * done when no row is left.
 */
export async function packSitemapPageRows(ctx: MutationCtx): Promise<{ cursor: null; isDone: boolean; processed: number; updated: number }> {
  const first = await ctx.db.query("siteSitemapPages").first();
  if (!first) return { cursor: null, isDone: true, processed: 0, updated: 0 };
  const rows = await ctx.db
    .query("siteSitemapPages")
    .withIndex("by_website_read", (q) => q.eq("websiteId", first.websiteId).eq("readAt", first.readAt))
    .take(SITEMAP_PART_PAGES * 3);
  const reading = { websiteId: first.websiteId, readAt: first.readAt };
  // A reading longer than one call's rows is moved over several, each to its own records.
  for (let start = 0; start < rows.length; start += SITEMAP_PART_PAGES) {
    await writeSitemapPart(ctx, reading, rows.slice(start, start + SITEMAP_PART_PAGES).map((row) => ({
      page: row.page, file: row.file, ...(row.lastmod !== undefined ? { lastmod: row.lastmod } : {}),
    })));
  }
  for (const row of rows) await ctx.db.delete(row._id);
  return { cursor: null, isDone: false, processed: rows.length, updated: rows.length };
}
