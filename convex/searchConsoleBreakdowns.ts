import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";
import { UNKNOWN } from "./searchConsoleFacts";
import { getActiveCompanyId } from "./authz";
import { tenantAction, tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { askLive, checkedRange, countryFilters } from "./searchConsoleReads";
import { askGoogle } from "./searchConsoleLiveAsks";
import { piecesOf } from "./searchConsoleLongLists";
import { GOOGLE_MOST_ROWS } from "./searchConsoleApi";
import { checkedLongest } from "./searchConsoleLimits";
import { connectionOf } from "./searchConsoleListSources";
import { checkedCountry, countryScope } from "./searchConsoleCountries";
import { periodValidator, searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { monthStart, pack, type Row } from "./utils/searchConsolePacks";
import { ctrCurve, type CurvePoint } from "./utils/searchConsoleViews";
import { shiftDay } from "./searchConsoleDays";

/**
 * What Search Console's Breakdowns read beside the kept lists, since their redo on 20 November 2026
 * (search-console-breakdowns-plan-2026-11-20.md): Click rate by position on mobile and on desktop, and Rich results month by
 * month. Each is kept as the periods are built (`buildSitePeriods`), so the screens read it ready-made, and asked of Google
 * from the screen only for dates or a country not kept ready.
 */

// ---------------------------------------------------------------------------
// Click rate by position, on each device
// ---------------------------------------------------------------------------

/** The devices Click rate by position sets side by side, and the list each one's positions are kept in. */
export const DEVICE_CURVES = [["mobileCurve", "MOBILE"], ["desktopCurve", "DESKTOP"]] as const;
export type DeviceCurveList = (typeof DEVICE_CURVES)[number][0];

type Google = { connectionId: Id<"searchConsoleConnections">; property: string };

/**
 * A device's keywords asked of Google for a span, in the scope the build or the screen reads, as each position's figures, or
 * null when Google won't answer. Google's own keyword figures, each search once (fix 1, 21 November 2026), as the whole
 * website's list now is: until then both were added up from Google's pairs of a keyword and a page, which counted a search
 * once for each page shown — 2.45% at position 1 where Google's own keyword figures give 6.36% (October 2026, More
 * Handles). Google gives at most 50,000 rows an ask: `cut` when it gave as many, the keywords with fewest impressions left
 * out. `pairs` is the rows Google gave, as before.
 */
async function askDeviceCurve(ctx: ActionCtx, google: Google, searchType: SearchType, span: { from: string; to: string }, country: string | undefined, device: string, positions: number): Promise<{ points: CurvePoint[]; pairs: number; cut: boolean } | null> {
  const answer = await askGoogle(ctx, google, searchType, "query", span.from, span.to, [{ dimension: "device", key: device }, ...(country === undefined ? [] : [{ dimension: "country" as const, key: country }])]);
  if (!answer.ok) return null;
  const keywords = answer.rows.map((row) => ({ clicks: row.clicks, impressions: row.impressions, position: row.impressions > 0 ? row.positionSum / row.impressions : 0 }));
  return { points: ctrCurve(keywords, positions), pairs: answer.rows.length, cut: answer.cut };
}

/**
 * A period's positions on one device, as the build keeps them: a row a whole position ("1" to the website's limit) with its
 * clicks and impressions, and its keywords as the row's count. Nothing kept splits keywords by device, so it's one ask of
 * Google a period and device, beside the asks the build makes for each kind of rich result.
 */
export type DeviceCurve = { rows: Row[]; counts: Map<string, { count: number; top: string }>; cut: boolean };

/** Asks of Google at once while the build counts the devices: as the long lists' (`searchConsoleLongLists.ts`). */
const ASKS_AT_ONCE = 4;

/**
 * Each span's positions on one device, as the build keeps them: a row a whole position ("1" to the website's limit) with
 * its clicks and impressions, and its keywords as the row's count. Nothing kept splits keywords by device, so Google's own
 * keyword figures are asked on the device a week at a time (`piecesOf`: Google gives at most 50,000 rows an ask), each week
 * once for every span it falls in, and added up keyword by keyword — exact, as a search's weeks add up to its period
 * (fix 1, 21 November 2026). Null when Google won't answer for any week; `cut` when it gave its most for one.
 */
export async function deviceCurvesOf(ctx: ActionCtx, google: Google, searchType: SearchType, spans: ReadonlyArray<{ from: string; to: string }>, country: string | undefined, device: string, positions: number): Promise<Map<string, DeviceCurve> | null> {
  type Sum = { clicks: number; impressions: number; positionSum: number };
  const sums = new Map(spans.map((span) => [`${span.from}|${span.to}`, { keywords: new Map<string, Sum>(), cut: false }]));
  const pieces = piecesOf(spans);
  const filters = [{ dimension: "device" as const, key: device }, ...(country === undefined ? [] : [{ dimension: "country" as const, key: country }])];
  for (let at = 0; at < pieces.length; at += ASKS_AT_ONCE) {
    const chunk = pieces.slice(at, at + ASKS_AT_ONCE);
    const answers = await Promise.all(chunk.map(async (piece) => ({ piece, answer: await askGoogle(ctx, google, searchType, "query", piece.from, piece.to, filters) })));
    for (const { piece, answer } of answers) {
      if (!answer.ok) return null;
      for (const span of spans) {
        if (piece.from < span.from || piece.to > span.to) continue;
        const held = sums.get(`${span.from}|${span.to}`)!;
        if (answer.cut) held.cut = true;
        for (const row of answer.rows) {
          const one = held.keywords.get(row.key) ?? { clicks: 0, impressions: 0, positionSum: 0 };
          one.clicks += row.clicks;
          one.impressions += row.impressions;
          one.positionSum += row.positionSum;
          held.keywords.set(row.key, one);
        }
      }
    }
  }
  return new Map([...sums.entries()].map(([key, held]) => {
    const points = ctrCurve([...held.keywords.values()].map((one) => ({ clicks: one.clicks, impressions: one.impressions, position: one.impressions > 0 ? one.positionSum / one.impressions : 0 })), positions);
    return [key, {
      rows: points.map((point) => ({ key: String(point.position), clicks: point.clicks, impressions: point.impressions, positionSum: point.position * point.impressions })),
      counts: new Map(points.map((point) => [String(point.position), { count: point.keywords, top: "" }])),
      cut: held.cut,
    }];
  }));
}

/** A kept device list's `shown`: this when Google gave its most for one of its weeks, nought when it didn't. */
export const DEVICE_PAIRS_CUT = GOOGLE_MOST_ROWS;

/**
 * Click rate by position's mobile and desktop lists for the periods a build names, in a job of its own scheduled once the
 * build is done (`buildSitePeriods`): about 120 asks for a year of weeks on two devices, which ran a settle past its time.
 * Written as the build's own lists (its `builtAt`), each period's list replacing the one before. Google not answering for a
 * device leaves that device's lists as they were; the screen asks Google itself where there are none.
 */
export const keepDeviceCurves = internalAction({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    connectionId: v.id("searchConsoleConnections"),
    property: v.string(),
    curvePositions: v.number(),
    builtAt: v.number(),
    slots: v.array(v.object({ period: periodValidator, from: v.string(), to: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const google = { connectionId: args.connectionId, property: args.property };
    const spans = [...new Map(args.slots.map((slot) => [`${slot.from}|${slot.to}`, { from: slot.from, to: slot.to }])).values()];
    const scope = { companyWebsiteId: args.companyWebsiteId, ...(args.country === undefined ? {} : { country: args.country }), searchType: args.searchType };
    for (const [list, device] of DEVICE_CURVES) {
      const curves = await deviceCurvesOf(ctx, google, args.searchType, spans, args.country, device, args.curvePositions);
      if (!curves) continue;
      for (const slot of args.slots) {
        const curve = curves.get(`${slot.from}|${slot.to}`);
        if (!curve) continue;
        // A list of at most the website's positions (20 by default): one part.
        const [packed] = pack(curve.rows, false);
        await ctx.runMutation(internal.searchConsolePeriods.writePeriodPart, {
          ...scope, list, period: slot.period, which: "NOW", part: 0, from: slot.from, to: slot.to,
          ...(packed ?? { keys: [], clicks: [], impressions: [], positionSums: [] }),
          counts: (packed?.keys ?? []).map((key) => curve.counts.get(key)?.count ?? 0),
          tops: (packed?.keys ?? []).map(() => ""),
          // Whether Google gave its most for one of the weeks, so the screen can say some small keywords aren't in.
          shown: curve.cut ? DEVICE_PAIRS_CUT : 0,
          builtAt: args.builtAt,
        });
        while (await ctx.runMutation(internal.searchConsolePeriods.clearPeriodSlot, { ...scope, list, period: slot.period, which: "NOW", before: args.builtAt })) { /* until none is left */ }
      }
    }
    return null;
  },
});

/** A kept device list's rows as the screen's positions. */
export function curveOfRows(rows: ReadonlyArray<{ key: string; clicks: number; impressions: number; count?: number }>): CurvePoint[] {
  return rows
    .map((row) => ({ position: Number(row.key), keywords: row.count ?? 0, impressions: row.impressions, clicks: row.clicks, ctr: row.impressions > 0 ? row.clicks / row.impressions : 0 }))
    .filter((point) => Number.isInteger(point.position) && point.position > 0)
    .sort((left, right) => left.position - right.position);
}

const pointValidator = v.object({ position: v.number(), keywords: v.number(), impressions: v.number(), clicks: v.number(), ctr: v.number() });
/** `cut`: the most pairs Google gives (50,000), when it gave as many for a device: its keywords with fewest impressions aren't in. */
export const devicesValidator = v.object({ mobile: v.array(pointValidator), desktop: v.array(pointValidator), cut: v.optional(v.union(v.number(), v.null())) });

/**
 * Click rate by position on mobile and on desktop for dates or a country not kept ready: asked of Google when the screen
 * opens, two asks, and only each position's figures sent back, never the keywords (a month's were 13 and 18 MB).
 */
export const searchConsoleLiveDeviceCurve = tenantAction({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, from: v.string(), to: v.string(), country: v.optional(v.string()) },
  returns: v.union(
    v.object({ ok: v.literal(true), devices: devicesValidator }),
    v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
  ),
  handler: async (ctx, args): Promise<{ ok: true; devices: { mobile: CurvePoint[]; desktop: CurvePoint[]; cut: number | null } } | { ok: false; problem: "NOT_CONNECTED" | "GOOGLE_REFUSED" | "GOOGLE_BUSY" }> => {
    checkedRange(args.from, args.to);
    checkedCountry(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: null });
    if (!target) return { ok: false, problem: "NOT_CONNECTED" };
    checkedLongest(args.from, args.to, target.limits);
    const [mobile, desktop] = await Promise.all(DEVICE_CURVES.map(([, device]) => askDeviceCurve(ctx, target, args.searchType, args, args.country, device, target.limits.curvePositions)));
    if (!mobile || !desktop) return { ok: false, problem: "GOOGLE_BUSY" };
    return { ok: true, devices: { mobile: mobile.points, desktop: desktop.points, cut: mobile.cut || desktop.cut ? GOOGLE_MOST_ROWS : null } };
  },
});

// ---------------------------------------------------------------------------
// Rich results, month by month
// ---------------------------------------------------------------------------

/**
 * Rich results' pages for each kind (moved here from `searchConsolePeriods.ts` on 20 November 2026, as it passed a thousand
 * lines): how many of the website's pages Google showed in each kind of rich result
 * over a period — in one country, for a country kept ready. Google will not
 * list a kind beside its pages, so each kind is asked on its own: here, once
 * after each collection, so Rich results reads it ready-made rather than
 * asking each time it opens (drift fixes, 2026-10-03). Null when Google
 * refuses or is busy for any of them: the page then asks for them itself.
 */
export async function pagesPerAppearance(
  ctx: ActionCtx,
  google: Google | null,
  searchType: SearchType,
  span: { from: string; to: string },
  country: string | undefined,
  rows: readonly Row[],
  kindsCounted: number,
): Promise<Map<string, { count: number; top: string }> | null> {
  if (!google) return null;
  const ordered = [...rows].sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions);
  const asked = ordered.slice(0, kindsCounted).map((row) => row.key);
  // Kinds past the limit (`consoleRichResultKinds`) are counted as unknown, never as no pages.
  const counts: Map<string, { count: number; top: string }> = new Map(ordered.slice(kindsCounted).map((row) => [row.key, { count: UNKNOWN, top: "" }]));
  for (let at = 0; at < asked.length; at += ASKS_AT_ONCE) {
    const answers = await Promise.all(asked.slice(at, at + ASKS_AT_ONCE).map(async (kind) => ({
      kind,
      answer: await askLive(ctx, google, {
        startDate: span.from,
        endDate: span.to,
        type: searchType,
        dimensions: ["page"],
        dimensionFilterGroups: [{ filters: [{ dimension: "searchAppearance", operator: "equals", expression: kind }, ...countryFilters(country)] }],
      }),
    })));
    for (const { kind, answer } of answers) {
      if (!answer.ok) return null;
      counts.set(kind, { count: answer.rows.length, top: "" });
    }
  }
  return counts;
}


/** The months Rich results draws: the newest day's month and the five before it. */
export const LOOK_MONTHS = 6;

/** Each of the last six months to the newest day, oldest first: its first day, and its last held (the newest day for this month). */
export function lookMonthSpans(newest: string): Array<{ month: string; from: string; to: string; finished: boolean }> {
  const spans: Array<{ month: string; from: string; to: string; finished: boolean }> = [];
  let first = monthStart(newest);
  for (let at = 0; at < LOOK_MONTHS; at += 1) {
    const next = monthStart(shiftDay(first, 32));
    const last = shiftDay(next, -1);
    spans.unshift({ month: first, from: first, to: last < newest ? last : newest, finished: last < newest });
    first = monthStart(shiftDay(first, -1));
  }
  return spans;
}

const lookValidator = v.object({ key: v.string(), clicks: v.number(), impressions: v.number() });
export type Look = typeof lookValidator.type;

/** The months whose rich results are kept already, so a finished month is asked of Google once and never again. */
export const monthsWithLooks = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator, from: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => (await monthRows(ctx, args.companyWebsiteId, args.country, args.searchType, args.from))
    .filter((row) => row.looks !== undefined)
    .map((row) => row.week),
});

/** A month's rich results onto its chart row (`searchConsoleWeeks`, grain MONTH); nothing when the month has no row. */
export const writeMonthLooks = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator, month: v.string(), looks: v.array(lookValidator) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = (await monthRows(ctx, args.companyWebsiteId, args.country, args.searchType, args.month)).find((one) => one.week === args.month);
    if (!row) return false;
    await ctx.db.patch(row._id, { looks: args.looks });
    return true;
  },
});

async function monthRows(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, country: string | undefined, searchType: SearchType, from: string) {
  return (await ctx.db
    .query("searchConsoleWeeks")
    .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType).gte("week", from))
    .take(400)).filter((row) => row.grain === "MONTH");
}

/**
 * Rich results' months kept as the periods are built: a month inside the days kept added up from them (`sums`), every
 * build; a finished month before them asked of Google once, one ask, and kept. Google not answering leaves the month as
 * it was, for the next build.
 */
export async function keepLookMonths(
  ctx: ActionCtx,
  scope: { companyWebsiteId: Id<"companyWebsites">; country?: string; searchType: SearchType },
  google: Google | null,
  newest: string,
  dayLine: string,
  sums: ((span: { from: string; to: string }) => readonly Row[] | null),
): Promise<void> {
  const months = lookMonthSpans(newest);
  const kept = new Set(await ctx.runQuery(internal.searchConsoleBreakdowns.monthsWithLooks, { ...scope, from: months[0].month }));
  for (const month of months) {
    const inDays = month.from >= dayLine;
    const summed = inDays ? sums(month) : null;
    let looks: Look[] | null = summed ? summed.map((row) => ({ key: row.key, clicks: row.clicks, impressions: row.impressions })) : null;
    if (!looks && !inDays && !(month.finished && kept.has(month.month)) && google) {
      const answer = await askLive(ctx, google, {
        startDate: month.from,
        endDate: month.to,
        type: scope.searchType,
        dimensions: ["searchAppearance"],
        ...(scope.country === undefined ? {} : { dimensionFilterGroups: [{ filters: countryFilters(scope.country) }] }),
      });
      looks = answer.ok ? answer.rows.map((row) => ({ key: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions })) : null;
    }
    if (looks) await ctx.runMutation(internal.searchConsoleBreakdowns.writeMonthLooks, { ...scope, month: month.month, looks });
  }
}

const monthValidator = v.object({ month: v.string(), days: v.number(), clicks: v.number(), looks: v.union(v.null(), v.array(lookValidator)) });

/**
 * Rich results' last six months, for the country chosen: each month's clicks (every click, from the day totals) and its rich
 * results where they're kept. A country not kept ready has none (`notReady`), as Brand and non-brand's chart.
 */
export const searchConsoleLookMonths = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, country: v.optional(v.string()) },
  returns: v.object({ months: v.array(monthValidator), notReady: v.boolean() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return await readLookMonths(ctx, site.hold, args);
  },
});

/** Rich results' months for a website: the screen's read, and Ask Hakken's. */
export async function readLookMonths(ctx: { db: QueryCtx["db"] }, hold: Doc<"companyWebsites">, args: { searchType: SearchType; country?: string }): Promise<{ months: Array<typeof monthValidator.type>; notReady: boolean }> {
  {
    const site = { hold };
    const connection = await connectionOf(ctx, site.hold._id);
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    if (scope.read === "LIVE") return { months: [], notReady: true };
    const newest = scope.read === "KEPT" ? scope.newestDay : connection?.newestDay;
    if (!newest) return { months: [], notReady: false };
    const country = scope.read === "KEPT" ? scope.country : undefined;
    const spans = lookMonthSpans(newest);
    const rows = await monthRows(ctx, site.hold._id, country, args.searchType, spans[0].month);
    const days = await ctx.db
      .query("searchConsoleDays")
      .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", site.hold._id).eq("country", country).eq("searchType", args.searchType).gte("day", spans[0].from).lte("day", newest))
      .take(LOOK_MONTHS * 31 + 1);
    const months = spans.map((span) => {
      const inMonth = days.filter((day) => day.day >= span.from && day.day <= span.to);
      const row = rows.find((one) => one.week === span.month);
      return { month: span.month, days: inMonth.length, clicks: inMonth.reduce((sum, day) => sum + day.clicks, 0), looks: row?.looks ?? null };
    });
    return { months, notReady: false };
  }
}
