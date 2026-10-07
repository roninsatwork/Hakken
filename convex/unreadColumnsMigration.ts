import type { MutationCtx } from "./_generated/server";

/**
 * Columns written and never read, cleared from the rows already held before
 * they leave the schema (docs/plans/active/keep-less-history-plan.md, 5.6):
 * Convex refuses a schema without a field while any row still carries it, so
 * the writes stop first, this clears what was written, and the fields go
 * after it has run (`2026-10-07-clear-unread-columns`).
 *
 * - The latest rankings: the search box's text (the keyword search reads the
 *   table's copy), when the row was last written, the 0–1 advert competition
 *   (the keyword screen shows its level), and DataForSEO's own previous place
 *   and move (the screens show Hakken's).
 * - Each page's rankings: its search text, its volume (the folders add theirs
 *   up while the pages are built) and when it was written.
 * - A keyword's search features: the address (readers use the page) and when
 *   it was written.
 * - Your pages: when the row was built (the list's copy says when).
 * - The sitemap's pages: the day read (the reading's own stamp says when).
 */
export const UNREAD_COLUMNS = [
  { table: "siteKeywordRanks", fields: ["searchText", "updatedAt", "competition", "previousPositionDfs", "movementDfs"] },
  { table: "sitePageRanks", fields: ["searchText", "volumeSum", "updatedAt"] },
  { table: "siteKeywordFeatures", fields: ["url", "updatedAt"] },
  { table: "holdPages", fields: ["builtAt"] },
  { table: "siteSitemapPages", fields: ["day"] },
] as const;

type Step = { cursor: string | null; isDone: boolean; processed: number; updated: number };

/**
 * One page of one table, the tables in turn: `<table's place>:<its cursor>`.
 * A row already clear is passed over, so a second run changes nothing.
 */
export async function clearUnreadColumns(ctx: MutationCtx, cursor: string | null, batchSize: number): Promise<Step> {
  const split = cursor ? cursor.indexOf(":") : -1;
  const at = split >= 0 ? Number(cursor!.slice(0, split)) : 0;
  const inner = split >= 0 ? cursor!.slice(split + 1) : "";
  const step = UNREAD_COLUMNS[at];
  if (!step) return { cursor: null, isDone: true, processed: 0, updated: 0 };

  const page = await ctx.db.query(step.table).paginate({ cursor: inner || null, numItems: batchSize });
  let updated = 0;
  for (const row of page.page) {
    const held = step.fields.filter((field) => (row as Record<string, unknown>)[field] !== undefined);
    if (held.length === 0) continue;
    // A field set to undefined is removed from the row.
    await ctx.db.patch(row._id, Object.fromEntries(held.map((field) => [field, undefined])) as never);
    updated += 1;
  }
  const next = !page.isDone ? `${at}:${page.continueCursor}` : at + 1 < UNREAD_COLUMNS.length ? `${at + 1}:` : null;
  return { cursor: next, isDone: next === null, processed: page.page.length, updated };
}
