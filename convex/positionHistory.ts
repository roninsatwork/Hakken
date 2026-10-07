import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { SEO_KEYWORD_CHECK_OPERATION } from "./dataForSeoRegistry";
import { dailyPositionsKeptFrom } from "./seoCollectionPolicy";
import { appError } from "./utils/appError";

/**
 * A keyword's positions as a graph line (docs/plans/active/keep-less-history-plan.md,
 * part 1): one record a website, keyword, place and month
 * (`keywordPositionMonths`, `positionHistorySchema.ts`), read and written only
 * here, so its layout is known in one place.
 *
 * A point is one day's position from one place, and what filed it: a keyword
 * list or a check of the search. A later sighting the same day replaces the
 * earlier, whatever filed it. Which purchase filed it is not kept (Decision
 * 10): a point is found by keyword, day and kind.
 *
 * Coarser with age (Decision 1): each point for 90 days; each week's last of
 * each kind to a year — the point a week's step of a chart already shows; the
 * month's last of each kind to two years; nothing older (`coarsenPositions`).
 */

export type PositionKind = "LIST" | "CHECK";

export type PositionPoint = {
  day: string;
  position: number | null;
  pagePosition: number | null;
  url: string | null;
  kind: PositionKind;
};

export type SearchKey = { websiteId: Id<"websites">; keyword: string; locationCode: number };

type MonthRecord = Doc<"keywordPositionMonths">;
type Grain = MonthRecord["grain"];

const KIND_CODE: Record<PositionKind, number> = { LIST: 0, CHECK: 1 };

/** A month's records read for a search's points between two days: two years of months and room to spare. */
const MONTHS_READ = 30;

/** Records coarsened or cleared per step of the sweep. */
const COARSEN_BATCH = 100;

export const monthOf = (day: string) => day.slice(0, 7);

const dayInMonth = (month: string, day: number) => `${month}-${String(day).padStart(2, "0")}`;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The month `count` months before `month`, `YYYY-MM`. */
export function monthsBefore(month: string, count: number): string {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) - count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The days a week's point stands for: its week, Monday to Sunday, inside its month (as a chart's weeks are). */
export function weekSpanOf(day: string): { from: string; to: string } {
  const date = Date.parse(`${day}T00:00:00Z`);
  const weekday = (new Date(date).getUTCDay() + 6) % 7;
  const monday = isoDay(date - weekday * 86_400_000);
  const sunday = isoDay(date + (6 - weekday) * 86_400_000);
  const monthStart = `${day.slice(0, 7)}-01`;
  const at = new Date(date);
  const monthEnd = isoDay(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0));
  return { from: monday < monthStart ? monthStart : monday, to: sunday > monthEnd ? monthEnd : sunday };
}

/** A record's points, oldest first. */
export function pointsOf(record: MonthRecord): PositionPoint[] {
  return record.days.map((day, index) => {
    const ref = record.pageRefs[index];
    return {
      day: dayInMonth(record.month, day),
      position: record.positions[index],
      pagePosition: record.pagePositions[index],
      url: ref >= 0 ? record.pages[ref] ?? null : null,
      kind: record.kinds[index] === KIND_CODE.CHECK ? "CHECK" : "LIST",
    };
  });
}

/** Points packed back into a record's lists, oldest first; each address kept once, and only while a point names it. */
function packed(points: readonly PositionPoint[]) {
  const sorted = [...points].sort((left, right) => left.day.localeCompare(right.day));
  const pages: string[] = [];
  const refOf = new Map<string, number>();
  const pageRefs = sorted.map((point) => {
    if (point.url === null) return -1;
    let ref = refOf.get(point.url);
    if (ref === undefined) {
      ref = pages.length;
      pages.push(point.url);
      refOf.set(point.url, ref);
    }
    return ref;
  });
  return {
    days: sorted.map((point) => Number(point.day.slice(8, 10))),
    positions: sorted.map((point) => point.position),
    pagePositions: sorted.map((point) => point.pagePosition),
    kinds: sorted.map((point) => KIND_CODE[point.kind]),
    pages,
    pageRefs,
  };
}

/** The points a grain keeps: every one for a day's grain, else the last of each kind in each week or in the month. */
export function coarsened(points: readonly PositionPoint[], grain: Grain): PositionPoint[] {
  if (grain === "DAY") return [...points];
  const last = new Map<string, PositionPoint>();
  for (const point of [...points].sort((left, right) => left.day.localeCompare(right.day))) {
    const span = grain === "WEEK" ? weekSpanOf(point.day).from : monthOf(point.day);
    last.set(`${span}\u0000${point.kind}`, point);
  }
  return [...last.values()].sort((left, right) => left.day.localeCompare(right.day));
}

async function recordOf(ctx: Pick<QueryCtx, "db">, key: SearchKey, month: string): Promise<MonthRecord | null> {
  return await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_website_keyword_place_month", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode).eq("month", month))
    .unique();
}

/** What filed a purchase's positions: a check of the search, or a keyword list. */
export async function kindOfPull(ctx: Pick<QueryCtx, "db">, pullId: Id<"seoDataPulls">): Promise<PositionKind> {
  return (await ctx.db.get(pullId))?.operationId === SEO_KEYWORD_CHECK_OPERATION ? "CHECK" : "LIST";
}

/**
 * Points of one month of a search from one place filed together: each
 * replaces the day's point held, whatever filed it — the same search measured
 * twice on one day from one place is one fact, as `replaceSameDayPosition`
 * keeps it — and of two given for one day the later stands. The record keeps
 * its grain: a point filed late into a coarsened month is coarsened with it.
 */
export async function mergePoints(ctx: MutationCtx, key: SearchKey & { month: string }, incoming: readonly PositionPoint[]): Promise<void> {
  if (incoming.length === 0) return;
  const record = await recordOf(ctx, key, key.month);
  const fresh = new Map<string, PositionPoint>();
  for (const point of incoming) {
    if (monthOf(point.day) !== key.month) throw appError("INVALID_INPUT", `A point of ${point.day} filed into ${key.month}.`);
    fresh.set(point.day, point);
  }
  const held = record ? pointsOf(record).filter((point) => !fresh.has(point.day)) : [];
  const grain: Grain = record?.grain ?? "DAY";
  const points = coarsened([...held, ...fresh.values()], grain);
  if (record) {
    await ctx.db.patch(record._id, packed(points));
    return;
  }
  await ctx.db.insert("keywordPositionMonths", {
    websiteId: key.websiteId,
    keyword: key.keyword,
    locationCode: key.locationCode,
    month: key.month,
    grain,
    ...packed(points),
  });
}

/** One day's position of a search from one place: replaces the day's point, whatever filed it. */
export async function setPoint(
  ctx: MutationCtx,
  key: SearchKey & { day: string },
  point: { position?: number; pagePosition?: number; url?: string; kind: PositionKind },
): Promise<void> {
  await mergePoints(ctx, { ...key, month: monthOf(key.day) }, [{
    day: key.day,
    position: point.position ?? null,
    pagePosition: point.pagePosition ?? null,
    url: point.url ?? null,
    kind: point.kind,
  }]);
}

/** The point held for a search on exactly this day, if any. */
export async function pointAt(ctx: Pick<QueryCtx, "db">, key: SearchKey & { day: string }): Promise<PositionPoint | null> {
  const record = await recordOf(ctx, key, monthOf(key.day));
  return record ? pointsOf(record).find((point) => point.day === key.day) ?? null : null;
}

/** Take a day's point away — only one of `kind` when named; a record left empty goes. */
export async function removePoint(ctx: MutationCtx, key: SearchKey & { day: string }, kind?: PositionKind): Promise<boolean> {
  const record = await recordOf(ctx, key, monthOf(key.day));
  if (!record) return false;
  const points = pointsOf(record);
  const kept = points.filter((point) => point.day !== key.day || (kind !== undefined && point.kind !== kind));
  if (kept.length === points.length) return false;
  if (kept.length === 0) await ctx.db.delete(record._id);
  else await ctx.db.patch(record._id, packed(kept));
  return true;
}

/** A search's points from one place between two days, oldest first; at most `limit`. */
export async function pointsBetween(
  ctx: Pick<QueryCtx, "db">,
  key: SearchKey,
  from: string,
  to: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<PositionPoint[]> {
  const records = await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_website_keyword_place_month", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode)
        .gte("month", monthOf(from)).lte("month", monthOf(to)))
    .take(MONTHS_READ);
  return records
    .flatMap(pointsOf)
    .filter((point) => point.day >= from && point.day <= to)
    .slice(0, limit);
}

/** A search's newest points from one place, newest first; at most `count`. */
export async function newestPoints(ctx: Pick<QueryCtx, "db">, key: SearchKey, count: number): Promise<PositionPoint[]> {
  const out: PositionPoint[] = [];
  const records = ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_website_keyword_place_month", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode))
    .order("desc");
  for await (const record of records) {
    out.push(...pointsOf(record).reverse());
    if (out.length >= count) break;
  }
  return out.slice(0, count);
}

/**
 * Where a search stood on a day: that day's point; or, for a day past the 90
 * days kept day by day, the last point of the week — or, past a year, of the
 * month — it falls in: the one kept for it.
 */
export async function pointOnDay(
  ctx: Pick<QueryCtx, "db">,
  key: SearchKey & { day: string; today: string },
): Promise<PositionPoint | null> {
  const record = await recordOf(ctx, key, monthOf(key.day));
  if (!record) return null;
  const points = pointsOf(record);
  const onDay = points.find((point) => point.day === key.day);
  if (onDay || key.day >= dailyPositionsKeptFrom(key.today)) return onDay ?? null;
  const span = record.grain === "MONTH"
    ? { from: `${record.month}-01`, to: `${record.month}-31` }
    : weekSpanOf(key.day);
  const within = points.filter((point) => point.day >= span.from && point.day <= span.to);
  return within.length > 0 ? within[within.length - 1] : null;
}

/** A website's newest month records from one place, newest month first: at most `take`. */
export async function newestRecordsOfWebsite(
  ctx: Pick<QueryCtx, "db">,
  websiteId: Id<"websites">,
  locationCode: number,
  take: number,
): Promise<Array<{ keyword: string; points: PositionPoint[] }>> {
  const records = await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_website_place_month", (q) => q.eq("websiteId", websiteId).eq("locationCode", locationCode))
    .order("desc")
    .take(take);
  return records.map((record) => ({ keyword: record.keyword, points: pointsOf(record) }));
}

/** A batch of a website's records gone, every place: how many. */
export async function clearWebsitePositions(ctx: MutationCtx, websiteId: Id<"websites">, batch: number): Promise<number> {
  const records = await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_website_place_month", (q) => q.eq("websiteId", websiteId))
    .take(batch);
  for (const record of records) await ctx.db.delete(record._id);
  return records.length;
}

/**
 * A search's checks on one day from one place, taken away from every website
 * `take` records at a time: when its check's results are cleared. A record
 * keeps its other days, so a pass carries on after the last website it
 * reached — `after`, null once none is left.
 */
export async function removeChecksOfSearch(
  ctx: MutationCtx,
  search: { keyword: string; locationCode: number; day: string },
  from: { after: Id<"websites"> | null; take: number },
): Promise<{ removed: number; after: Id<"websites"> | null }> {
  const records = await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_keyword_place_month_website", (q) => {
      const month = q.eq("keyword", search.keyword).eq("locationCode", search.locationCode).eq("month", monthOf(search.day));
      return from.after === null ? month : month.gt("websiteId", from.after);
    })
    .take(from.take);
  let removed = 0;
  for (const record of records) {
    const removedOne = await removePoint(ctx, {
      websiteId: record.websiteId, keyword: record.keyword, locationCode: record.locationCode, day: search.day,
    }, "CHECK");
    if (removedOne) removed += 1;
  }
  return { removed, after: records.length === from.take ? records[records.length - 1].websiteId : null };
}

/**
 * One step of the hourly coarsening: a month wholly past the 90 days kept day
 * by day keeps each week's last of each kind; past a year, the month's last
 * of each kind; past two years, nothing. Answers whether a step more is
 * waiting.
 */
export async function coarsenPositions(ctx: MutationCtx, now: number): Promise<{ more: boolean }> {
  const today = isoDay(now);
  const thisMonth = monthOf(today);
  const weeklyBefore = monthOf(dailyPositionsKeptFrom(today));
  const monthlyBefore = monthsBefore(thisMonth, 12);
  const goneBefore = monthsBefore(thisMonth, 24);
  let more = false;

  for (const grain of ["DAY", "WEEK", "MONTH"] as const) {
    const gone = await ctx.db
      .query("keywordPositionMonths")
      .withIndex("by_grain_month", (q) => q.eq("grain", grain).lt("month", goneBefore))
      .take(COARSEN_BATCH);
    for (const record of gone) await ctx.db.delete(record._id);
    if (gone.length === COARSEN_BATCH) more = true;
  }

  const toMonth = await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_grain_month", (q) => q.eq("grain", "WEEK").lt("month", monthlyBefore))
    .take(COARSEN_BATCH);
  const dayToMonth = await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_grain_month", (q) => q.eq("grain", "DAY").lt("month", monthlyBefore))
    .take(COARSEN_BATCH);
  for (const record of [...toMonth, ...dayToMonth]) {
    await ctx.db.patch(record._id, { grain: "MONTH" as const, ...packed(coarsened(pointsOf(record), "MONTH")) });
  }
  if (toMonth.length === COARSEN_BATCH || dayToMonth.length === COARSEN_BATCH) more = true;

  const toWeek = await ctx.db
    .query("keywordPositionMonths")
    .withIndex("by_grain_month", (q) => q.eq("grain", "DAY").lt("month", weeklyBefore))
    .take(COARSEN_BATCH);
  for (const record of toWeek) {
    await ctx.db.patch(record._id, { grain: "WEEK" as const, ...packed(coarsened(pointsOf(record), "WEEK")) });
  }
  if (toWeek.length === COARSEN_BATCH) more = true;

  return { more };
}
