import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { packDays, packFigures, unpackDays, unpackFigureRows } from "./utils/packedColumns";

/**
 * The links a website gained and lost each week, from DataForSEO's own count
 * (`backlinks_new_lost`), kept as one packed record a website
 * (core-data-normalisation-plan.md §6.3, 2026-10-08): one row a week was 1,190
 * rows on dev, each its website, time and id beside six small counts. A later
 * answer about the same week replaces the earlier, as before.
 */

export const CHANGE_FIGURES = [
  "newBacklinks", "lostBacklinks", "newReferringDomains", "lostReferringDomains", "newMainDomains", "lostMainDomains",
] as const;

export type LinkChange = { day: string } & Record<(typeof CHANGE_FIGURES)[number], number>;

const KEYS = { numbers: CHANGE_FIGURES, days: [] as const, required: CHANGE_FIGURES };

function changesOf(record: { days: string | Array<string | null> } & Record<(typeof CHANGE_FIGURES)[number], string | Array<number | null>>): LinkChange[] {
  const days = unpackDays(record.days);
  return unpackFigureRows(days.length, record, KEYS).map((figures, at) => ({ day: days[at]!, ...(figures as Record<(typeof CHANGE_FIGURES)[number], number>) }));
}

/** A website's weeks of links gained and lost, oldest first. */
export async function readLinkChanges(ctx: { db: QueryCtx["db"] }, websiteId: Id<"websites">): Promise<LinkChange[]> {
  const record = await ctx.db.query("siteLinkWeeks").withIndex("by_website", (q) => q.eq("websiteId", websiteId)).unique();
  return record ? changesOf(record) : [];
}

/** These weeks filed over the website's own, a later count of a week replacing the earlier. */
export async function writeLinkChanges(ctx: MutationCtx, websiteId: Id<"websites">, rows: readonly LinkChange[]): Promise<void> {
  const record = await ctx.db.query("siteLinkWeeks").withIndex("by_website", (q) => q.eq("websiteId", websiteId)).unique();
  const byDay = new Map((record ? changesOf(record) : []).map((row) => [row.day, row]));
  for (const row of rows) byDay.set(row.day, row);
  const weeks = [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
  const fields = { websiteId, days: packDays(weeks.map((row) => row.day)), ...packFigures(weeks, CHANGE_FIGURES), updatedAt: Date.now() };
  if (record) await ctx.db.replace(record._id, fields);
  else await ctx.db.insert("siteLinkWeeks", fields);
}

/**
 * Dev's weeks kept one a row before 2026-10-08 moved into one record a website
 * (`2026-10-08-link-weeks`), a website at a time; done when no row is left.
 */
export async function packLinkDayRows(ctx: MutationCtx): Promise<{ cursor: null; isDone: boolean; processed: number; updated: number }> {
  const first = await ctx.db.query("siteLinkDays").first();
  if (!first) return { cursor: null, isDone: true, processed: 0, updated: 0 };
  const rows = await ctx.db.query("siteLinkDays").withIndex("by_site_day", (q) => q.eq("websiteId", first.websiteId)).take(2_000);
  await writeLinkChanges(ctx, first.websiteId, rows.map(({ _id, _creationTime, websiteId, updatedAt, ...week }) => week));
  for (const row of rows) await ctx.db.delete(row._id);
  return { cursor: null, isDone: false, processed: rows.length, updated: rows.length };
}
