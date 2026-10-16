import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { clarityDays, periodFor, readClarityPeriod, readPageRows, type ClarityPeriodRead } from "./clarity";
import { classifierFor } from "./googleAnalyticsChannelReads";
import { titlesOf } from "./pageTitles";
import { listOrder, listPageArgs, listPageResult, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { CLARITY_FEW_VISITS, clarityMeasuresValidator, measuresOf, sumTotals, type ClarityMeasures, type ClarityTotals, type ClarityTotalsRow } from "./utils/clarityRows";
import { addUpBy, unpackTotals } from "./utils/clarityPacks";
import { clarityRecordingKindValidator } from "./utils/clarityRecordings";
import { shiftDay } from "./utils/insightFacts";

/**
 * Microsoft Clarity's screens, read (docs/plans/active/agents-and-clarity-plan.md,
 * Part 4, CS1–CS9, drawn on "Hakken — Microsoft Clarity"): the Overview, Pages,
 * a page's own screen, Errors and Recordings. Every figure is Clarity's own,
 * set against the same days before it, the whole website, a page group or a
 * device (CS1) — never another source's. Each read is of the ready-made
 * periods worked out each morning (`clarity.ts`), by the caller's own hold.
 *
 * `device` narrows every figure to Clarity's devices — "PC", "Mobile",
 * "Tablet" — except the comparison of the devices themselves. `days` says how
 * many days Clarity recorded, so a screen never says 30 days of four (CF3).
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;

const nullableNumber = v.union(v.number(), v.null());
const screenArgs = { siteId: v.id("companyWebsites"), days: v.number(), device: v.optional(v.string()) };

/** The days a screen's figures cover, and the same number of days before them, as Clarity recorded them. */
const spanValidator = v.object({ from: v.string(), to: v.string(), days: v.number() });
/**
 * `firstDay`: the first day Clarity recorded a visit. `countedFrom`: the first
 * day errors, people and pages a visit were kept, when the days shown begin
 * before it — days kept before 2026-10-16 hold none, and are left out of
 * those figures rather than counted as none.
 */
const periodValidator = v.object({
  now: v.union(spanValidator, v.null()),
  before: v.union(spanValidator, v.null()),
  firstDay: v.union(v.string(), v.null()),
  countedFrom: v.union(v.string(), v.null()),
  /** The days that hold each page's own figures, where fewer than the days shown. */
  pages: v.union(v.null(), v.object({ days: v.number(), from: v.union(v.string(), v.null()) })),
  /** Days whose pages Clarity cut at its 1,000 rows: quieter pages may be missing ("Large websites"). */
  cutDays: v.number(),
});

const spanOf = (read: ClarityPeriodRead | null) => (read ? { from: read.first.from, to: read.first.to, days: read.first.days } : null);
const onDevice = (device: string | undefined) => (row: ClarityTotalsRow) => !device || row.device === device;

/** A record's website rows on the device chosen, added up. */
const siteOf = (read: ClarityPeriodRead | null, device: string | undefined): ClarityTotals => sumTotals(read ? unpackTotals(read.first.site).filter(onDevice(device)) : []);

/** A period's pages on the device chosen, each across its devices. */
const pagesOf = (read: ClarityPeriodRead | null, device: string | undefined): Map<string, ClarityTotals> => addUpBy(read?.pages ?? [], (row) => (onDevice(device)(row) ? row.page ?? "" : null));

/**
 * The same number of days before the days shown, only when Clarity recorded
 * as many of them: like is set against like, never 30 days against 4
 * (`stats-need-comparisons`). Until then a screen says why it compares nothing.
 */
async function readBefore(ctx: Reader, holdId: HoldId, days: number, now: ClarityPeriodRead | null, withPages = true): Promise<ClarityPeriodRead | null> {
  const before = await readClarityPeriod(ctx, holdId, days, { before: true, withPages });
  return before && now && before.first.days >= now.first.days ? before : null;
}

/** The first day Clarity recorded a visit, from the 90 days' days, for "4 days so far, since 12 Oct"; the connection's first day kept while none is. */
async function firstDayOf(ctx: Reader, holdId: HoldId): Promise<string | null> {
  const ninety = await readClarityPeriod(ctx, holdId, 90, { withPages: false });
  const first = ninety ? clarityDays(ninety.first).find((day) => day.totals.visits + day.totals.bots > 0)?.day : undefined;
  if (first) return first;
  const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
  return connection?.oldestDay ?? null;
}

/** A day with visits and no people counted: kept before 2026-10-16, when errors, people and pages a visit were not read. */
const uncounted = (totals: ClarityTotals) => totals.visits > 0 && totals.users === 0;

/** The first day after the last day kept without errors, people and pages a visit, when there is one among the days shown. */
function countedFromOf(read: ClarityPeriodRead | null): string | null {
  const days = read ? clarityDays(read.first) : [];
  const last = days.filter((day) => uncounted(day.totals)).at(-1);
  if (!last) return null;
  return days.find((day) => day.day > last.day && day.totals.visits > 0)?.day ?? shiftDay(last.day, 1);
}

/** The period's figures and when its counted ones start: errors, people and pages a visit taken over the days that hold them. */
async function periodOf(ctx: Reader, holdId: HoldId, now: ClarityPeriodRead | null, before: ClarityPeriodRead | null) {
  const pages = now && now.first.pageDays !== undefined ? { days: now.first.pageDays, from: now.first.pagesFrom ?? null } : null;
  return { now: spanOf(now), before: spanOf(before), firstDay: await firstDayOf(ctx, holdId), countedFrom: countedFromOf(now), pages, cutDays: now?.first.cutDays ?? 0 };
}

/** The website's measures on the device chosen, with errors, people and pages a visit over the days that hold them. */
function websiteOf(read: ClarityPeriodRead | null, device: string | undefined): ClarityMeasures {
  const all = measuresOf(siteOf(read, device));
  const from = countedFromOf(read);
  if (!read || !from) return all;
  const counted = measuresOf(sumTotals(clarityDays(read.first, device).filter((day) => day.day >= from).map((day) => day.totals)));
  return { ...all, users: counted.users, pagesPerVisit: counted.pagesPerVisit, shares: { ...all.shares, errors: counted.shares.errors, errorClicks: counted.shares.errorClicks } };
}

/** A page as every list shows it: its measures now, its scroll before, its group and its title. */
const pageLineValidator = v.object({
  page: v.string(),
  title: v.union(v.string(), v.null()),
  kind: v.string(),
  kindName: v.union(v.string(), v.null()),
  now: clarityMeasuresValidator,
  scrollBefore: nullableNumber,
  visitsBefore: v.number(),
});
type PageLine = { page: string; title: string | null; kind: string; kindName: string | null; now: ClarityMeasures; scrollBefore: number | null; visitsBefore: number };

async function pageLines(ctx: Reader, holdId: HoldId, now: ClarityPeriodRead | null, before: ClarityPeriodRead | null, device: string | undefined): Promise<PageLine[]> {
  const classifier = await classifierFor(ctx, holdId);
  const earlier = pagesOf(before, device);
  return [...pagesOf(now, device)]
    .filter(([page, totals]) => page !== "" && totals.visits > 0)
    .map(([page, totals]) => {
      const kind = classifier.kindOf(page);
      const was = earlier.get(page);
      const then = was ? measuresOf(was) : null;
      return { page, title: null, kind, kindName: classifier.nameOf(kind), now: measuresOf(totals), scrollBefore: then?.scroll ?? null, visitsBefore: then?.visits ?? 0 };
    })
    .sort((a, b) => b.now.visits - a.now.visits || a.page.localeCompare(b.page));
}

/** Titles for the rows a screen shows: one read a page, only for those (`pageTitles.ts`). */
async function titled<Row extends { page: string; title: string | null }>(ctx: Reader, holdId: HoldId, rows: readonly Row[]): Promise<Row[]> {
  const titles = await titlesOf(ctx, holdId, rows.map((row) => row.page));
  return rows.map((row) => ({ ...row, title: titles.get(row.page) ?? null }));
}

/** A day's figures for a chart: visits, scroll, the visits with an error, on the device chosen. */
/** A day kept without errors read has none to show: null, never nought. */
const dayValidator = v.object({ day: v.string(), visits: v.number(), scroll: nullableNumber, errors: nullableNumber, errorClicks: nullableNumber });
const daysOf = (read: ClarityPeriodRead | null, device: string | undefined) => {
  const unread = new Set((read ? clarityDays(read.first) : []).filter((day) => uncounted(day.totals)).map((day) => day.day));
  return (read ? clarityDays(read.first, device) : []).map(({ day, totals }) => {
    const measures = measuresOf(totals);
    return { day, visits: measures.visits, scroll: measures.scroll, errors: unread.has(day) ? null : measures.errors, errorClicks: unread.has(day) ? null : measures.errorClicks };
  });
};

/** A split's rows — a device, a source, a browser — each with its measures, the most visits first. */
const splitLineValidator = v.object({ name: v.string(), now: clarityMeasuresValidator, scrollBefore: nullableNumber });
function splitLines(rows: readonly ClarityTotalsRow[], nameOf: (row: ClarityTotalsRow) => string | null, before: readonly ClarityTotalsRow[] = []) {
  const earlier = addUpBy(before, nameOf);
  return [...addUpBy(rows, nameOf)]
    .filter(([, totals]) => totals.visits > 0)
    .map(([name, totals]) => ({ name, now: measuresOf(totals), scrollBefore: earlier.has(name) ? measuresOf(earlier.get(name)!).scroll : null }))
    .sort((a, b) => b.now.visits - a.now.visits || a.name.localeCompare(b.name));
}

/** Where a page's errors mostly happen: the browser and device with the most visits with an error on it, from the browsers by page. */
function mostlyOn(browsers: ClarityPeriodRead | null, device: string | undefined): Map<string, { browser: string; device: string }> {
  const best = new Map<string, { browser: string; device: string; errors: number }>();
  for (const row of browsers?.pages ?? []) {
    if (!onDevice(device)(row) || !row.page || row.errors + row.errorClicks === 0) continue;
    const held = best.get(row.page);
    const errors = row.errors + row.errorClicks;
    if (!held || errors > held.errors) best.set(row.page, { browser: row.split ?? "Other", device: row.device, errors });
  }
  return new Map([...best].map(([page, { browser, device: on }]) => [page, { browser, device: on }]));
}

/** A recording as the screens list it. */
const recordingValidator = v.object({
  kind: clarityRecordingKindValidator,
  link: v.string(),
  day: v.string(),
  startedAt: v.number(),
  activeSeconds: v.number(),
  totalSeconds: v.number(),
  pages: v.number(),
  clicks: v.number(),
  page: v.string(),
  title: v.union(v.string(), v.null()),
  visited: v.array(v.string()),
  referrer: v.union(v.string(), v.null()),
});
type RecordingRow = Omit<Doc<"clarityRecordings">, "_id" | "_creationTime" | "companyWebsiteId" | "createdAt"> & { title: string | null };

/** The order recordings are shown in: what went wrong first, as the Collector asks for them, the newest within each. */
const KIND_ORDER = ["ERRORS", "ERROR_CLICKS", "RAGE", "DEAD", "QUICK_BACK", "LONGEST"] as const;
/** Recordings read for a screen at most: about ten a morning, kept 30 days, so some 300 are ever held. */
const RECORDINGS_READ = 500;

/** The recordings picked over the days a screen covers, those about a page alone when it is given. */
async function recordingsOf(ctx: Reader, holdId: HoldId, from: string | null, to: string | null, page?: string): Promise<RecordingRow[]> {
  if (!from || !to) return [];
  const rows = await ctx.db.query("clarityRecordings").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).gte("day", from).lte("day", to)).take(RECORDINGS_READ);
  const byLink = new Map<string, RecordingRow>();
  const ordered = rows
    .filter((row) => !page || row.page === page || row.visited.includes(page))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.startedAt - a.startedAt);
  // One visit picked for two reasons is listed once, for the first.
  for (const { _id, _creationTime, companyWebsiteId, createdAt, ...row } of ordered) {
    if (!byLink.has(row.link)) byLink.set(row.link, { ...row, title: null });
  }
  return [...byLink.values()];
}

/** A recording of a visit that hit an error on a page, or clicked something there that failed: the first picked. */
const errorRecordingOf = (recordings: readonly RecordingRow[], page: string) => recordings.find((row) => (row.kind === "ERRORS" || row.kind === "ERROR_CLICKS") && row.page === page)?.link ?? null;

/** The span a screen's recordings are read over: the period's days, or the last days chosen while nothing is kept. */
function recordingSpan(now: ClarityPeriodRead | null, days: number, newest: string | null): { from: string | null; to: string | null } {
  if (now) return { from: now.first.from, to: now.first.to };
  return newest ? { from: shiftDay(newest, -(days - 1)), to: newest } : { from: null, to: null };
}

async function newestOf(ctx: Reader, holdId: HoldId): Promise<string | null> {
  const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
  return connection?.newestDay ?? null;
}

// ---------------------------------------------------------------- Overview (CS3)

export const clarityOverview = tenantQuery({
  args: screenArgs,
  returns: v.object({
    period: periodValidator,
    now: clarityMeasuresValidator,
    before: v.union(clarityMeasuresValidator, v.null()),
    byDay: v.array(dayValidator),
    beforeByDay: v.array(dayValidator),
    pages: v.object({ count: v.number(), low: v.number(), few: v.number(), top: v.array(pageLineValidator), worst: v.union(pageLineValidator, v.null()) }),
    groups: v.array(v.object({ kind: v.string(), name: v.union(v.string(), v.null()), now: clarityMeasuresValidator, scrollBefore: nullableNumber })),
    devices: v.array(splitLineValidator),
    sources: v.union(v.null(), v.object({ days: v.number(), rows: v.array(splitLineValidator) })),
    errors: v.object({ pages: v.array(v.object({ line: pageLineValidator, mostly: v.union(v.null(), v.object({ browser: v.string(), device: v.string() })), recording: v.union(v.string(), v.null()) })), pageCount: v.number() }),
    stuck: v.object({ quickBackPage: v.union(v.null(), v.object({ page: v.string(), visits: v.number() })) }),
    recordings: v.object({ total: v.number(), top: v.array(recordingValidator) }),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const now = await readClarityPeriod(ctx, holdId, args.days);
    const before = await readBefore(ctx, holdId, args.days, now);
    const sources = await readClarityPeriod(ctx, holdId, args.days, { kind: "SOURCES", withPages: false });
    const browsers = await readClarityPeriod(ctx, holdId, args.days, { kind: "BROWSERS" });
    const lines = await pageLines(ctx, holdId, now, before, args.device);
    const judged = lines.filter((line) => line.now.visits >= CLARITY_FEW_VISITS && line.now.scroll !== null);
    const worst = [...judged].sort((a, b) => (a.now.scroll ?? 0) - (b.now.scroll ?? 0))[0] ?? null;
    const groups = new Map<string, { kind: string; name: string | null; now: ClarityTotals; before: ClarityTotals }>();
    const earlier = pagesOf(before, args.device);
    const lineOf = new Map(lines.map((line) => [line.page, line]));
    for (const [page, totals] of pagesOf(now, args.device)) {
      const line = lineOf.get(page);
      if (!line) continue;
      const held = groups.get(line.kind) ?? { kind: line.kind, name: line.kindName, now: sumTotals([]), before: sumTotals([]) };
      groups.set(line.kind, { ...held, now: sumTotals([held.now, totals]), before: sumTotals([held.before, earlier.get(page) ?? sumTotals([])]) });
    }
    const mostly = mostlyOn(browsers, args.device);
    const errorLines = lines.filter((line) => line.now.errors + line.now.errorClicks > 0).sort((a, b) => b.now.errors + b.now.errorClicks - (a.now.errors + a.now.errorClicks));
    const quickest = [...lines].sort((a, b) => b.now.quickBack - a.now.quickBack)[0];
    const span = recordingSpan(now, args.days, await newestOf(ctx, holdId));
    const recordings = await recordingsOf(ctx, holdId, span.from, span.to);
    const shown = await titled(ctx, holdId, [...lines.slice(0, 4), ...(worst ? [worst] : []), ...errorLines.slice(0, 5)]);
    const titleOf = new Map(shown.map((line) => [line.page, line.title]));
    const withTitle = (line: PageLine): PageLine => ({ ...line, title: titleOf.get(line.page) ?? null });
    return {
      period: await periodOf(ctx, holdId, now, before),
      now: websiteOf(now, args.device),
      before: before ? websiteOf(before, args.device) : null,
      byDay: daysOf(now, args.device),
      beforeByDay: daysOf(before, args.device),
      pages: {
        count: lines.length,
        low: judged.filter((line) => (line.now.scroll ?? 100) < 25).length,
        few: lines.length - lines.filter((line) => line.now.visits >= CLARITY_FEW_VISITS).length,
        top: lines.slice(0, 4).map(withTitle),
        worst: worst ? withTitle(worst) : null,
      },
      groups: [...groups.values()]
        .filter((group) => group.now.visits > 0)
        .map((group) => ({ kind: group.kind, name: group.name, now: measuresOf(group.now), scrollBefore: group.before.visits > 0 ? measuresOf(group.before).scroll : null }))
        .sort((a, b) => b.now.visits - a.now.visits),
      devices: splitLines(now ? unpackTotals(now.first.site) : [], (row) => row.device, before ? unpackTotals(before.first.site) : []),
      sources: sources ? { days: sources.first.days, rows: splitLines(unpackTotals(sources.first.site).filter(onDevice(args.device)), (row) => row.split ?? null) } : null,
      errors: { pages: errorLines.slice(0, 5).map((line) => ({ line: withTitle(line), mostly: mostly.get(line.page) ?? null, recording: errorRecordingOf(recordings, line.page) })), pageCount: errorLines.length },
      stuck: { quickBackPage: quickest && quickest.now.quickBack > 0 ? { page: quickest.page, visits: quickest.now.quickBack } : null },
      recordings: { total: recordings.length, top: recordings.slice(0, 3) },
    };
  },
});

// ---------------------------------------------------------------- Pages (CS4)

type PageSort = "page" | "visits" | "scroll" | "change" | "time" | "quickBack" | "errors";
const PAGE_SORTS: ListSorts<PageLine, PageSort> = {
  page: { value: (row) => row.page, first: "asc" },
  visits: { value: (row) => row.now.visits, first: "desc" },
  scroll: { value: (row) => row.now.scroll, first: "asc" },
  change: { value: (row) => (row.now.scroll !== null && row.scrollBefore !== null ? row.now.scroll - row.scrollBefore : null), first: "asc" },
  time: { value: (row) => row.now.activeSeconds, first: "asc" },
  quickBack: { value: (row) => row.now.shares.quickBack, first: "desc" },
  errors: { value: (row) => row.now.shares.errors, first: "desc" },
};
const pageSortValidator = v.union(...(Object.keys(PAGE_SORTS) as PageSort[]).map((key) => v.literal(key)));
/** Pages in the chart of the busiest. */
const BUSIEST = 10;

const pageListArgs = {
  ...screenArgs,
  q: v.optional(v.string()),
  group: v.optional(v.string()),
  scrolled: v.optional(v.literal("LOW")),
  sort: v.optional(pageSortValidator),
  direction: sortDirectionArg,
};

/** The pages a search, a page group and "scrolled less than a quarter" leave, in the order a heading asked for, over the whole list. */
function listedPages(lines: readonly PageLine[], args: { q?: string; group?: string; scrolled?: "LOW"; sort?: PageSort; direction?: "asc" | "desc" }): PageLine[] {
  const matches = args.q ? wordStartMatcher(args.q.toLowerCase()) : null;
  return lines
    .filter((line) => !matches || matches(line.page))
    .filter((line) => !args.group || line.kind === args.group)
    .filter((line) => args.scrolled !== "LOW" || (line.now.scroll ?? 100) < 25)
    .sort(listOrder(PAGE_SORTS, args.sort ?? "visits", args.direction, (row) => row.page));
}

export const clarityPagesList = tenantQuery({
  args: { ...pageListArgs, ...listPageArgs },
  returns: v.object({
    ...listPageResult(pageLineValidator).fields,
    period: periodValidator,
    website: clarityMeasuresValidator,
    count: v.number(),
    low: v.number(),
    few: v.number(),
    lowest: v.array(v.string()),
    furthest: v.union(pageLineValidator, v.null()),
    worst: v.union(pageLineValidator, v.null()),
    busiest: v.array(pageLineValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const now = await readClarityPeriod(ctx, holdId, args.days);
    const before = await readBefore(ctx, holdId, args.days, now);
    const lines = await pageLines(ctx, holdId, now, before, args.device);
    const judged = lines.filter((line) => line.now.visits >= CLARITY_FEW_VISITS && line.now.scroll !== null);
    const lowLines = judged.filter((line) => (line.now.scroll ?? 100) < 25);
    const page = pageOfList(listedPages(lines, args), args.page, args.rows);
    const furthest = [...judged].sort((a, b) => (b.now.scroll ?? 0) - (a.now.scroll ?? 0))[0] ?? null;
    const worst = [...judged].sort((a, b) => (a.now.scroll ?? 0) - (b.now.scroll ?? 0))[0] ?? null;
    return {
      ...page,
      rows: await titled(ctx, holdId, page.rows),
      period: await periodOf(ctx, holdId, now, before),
      website: websiteOf(now, args.device),
      count: lines.length,
      low: lowLines.length,
      few: lines.filter((line) => line.now.visits < CLARITY_FEW_VISITS).length,
      lowest: lowLines.slice(0, 2).map((line) => line.page),
      furthest,
      worst,
      busiest: lines.slice(0, BUSIEST),
    };
  },
});

/** Every page the list shows, for its download: the same pages in the same order, without titles, which are read a page at a time. */
export const clarityPagesAll = tenantQuery({
  args: pageListArgs,
  returns: v.object({ rows: v.array(pageLineValidator) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const now = await readClarityPeriod(ctx, site.hold._id, args.days);
    const before = await readBefore(ctx, site.hold._id, args.days, now);
    return { rows: listedPages(await pageLines(ctx, site.hold._id, now, before, args.device), args) };
  },
});

// ---------------------------------------------------------------- A page's own screen (CS5)

export const clarityPage = tenantQuery({
  args: { ...screenArgs, page: v.string() },
  returns: v.object({
    period: periodValidator,
    title: v.union(v.string(), v.null()),
    kind: v.string(),
    kindName: v.union(v.string(), v.null()),
    now: clarityMeasuresValidator,
    before: v.union(clarityMeasuresValidator, v.null()),
    website: clarityMeasuresValidator,
    group: v.union(clarityMeasuresValidator, v.null()),
    byDay: v.array(v.object({ day: v.string(), page: nullableNumber, website: nullableNumber, visits: v.number() })),
    errors: v.array(splitLineValidator),
    browsersDays: v.union(v.number(), v.null()),
    devices: v.array(splitLineValidator),
    sources: v.union(v.null(), v.object({ days: v.number(), rows: v.array(splitLineValidator), cutDays: v.number() })),
    recordings: v.array(recordingValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    // Every page of the period, for the page's group beside it; everything else is the page's own rows, each read from the part that holds them.
    const now = await readClarityPeriod(ctx, holdId, args.days);
    const before = await readBefore(ctx, holdId, args.days, now, false);
    const lines = await pageLines(ctx, holdId, now, null, args.device);
    const classifier = await classifierFor(ctx, holdId);
    const kind = lines.find((one) => one.page === args.page)?.kind ?? classifier.kindOf(args.page);
    const others = lines.filter((one) => one.kind === kind && one.page !== args.page);
    const ownOn = (rows: readonly ClarityTotalsRow[]) => rows.filter(onDevice(args.device));
    const totalsNow = pagesOf(now, args.device);
    const beforeRows = before ? ownOn(await readPageRows(ctx, holdId, periodFor(args.days, true), undefined, before.first.key, args.page)) : [];
    const websiteDays = daysOf(now, args.device);
    const byDay = [];
    for (const day of websiteDays) {
      const measures = measuresOf(sumTotals(ownOn(await readPageRows(ctx, holdId, "DAY", undefined, day.day, args.page))));
      byDay.push({ day: day.day, page: measures.scroll, website: day.scroll, visits: measures.visits });
    }
    const browsers = await readClarityPeriod(ctx, holdId, args.days, { kind: "BROWSERS", withPages: false });
    const sources = await readClarityPeriod(ctx, holdId, args.days, { kind: "SOURCES", withPages: false });
    const browserRows = browsers ? ownOn(await readPageRows(ctx, holdId, periodFor(args.days), "BROWSERS", browsers.first.key, args.page)) : [];
    const sourceRows = sources ? ownOn(await readPageRows(ctx, holdId, periodFor(args.days), "SOURCES", sources.first.key, args.page)) : [];
    const span = recordingSpan(now, args.days, await newestOf(ctx, holdId));
    return {
      period: await periodOf(ctx, holdId, now, before),
      title: (await titlesOf(ctx, holdId, [args.page])).get(args.page) ?? null,
      kind,
      kindName: classifier.nameOf(kind),
      now: measuresOf(totalsNow.get(args.page) ?? sumTotals([])),
      before: before && beforeRows.length > 0 ? measuresOf(sumTotals(beforeRows)) : null,
      website: websiteOf(now, args.device),
      group: others.length > 0 ? measuresOf(sumTotals(others.flatMap((one) => totalsNow.get(one.page) ?? []))) : null,
      byDay,
      errors: splitLines(browserRows, (row) => `${row.split ?? "Other"}|${row.device}`).filter((row) => row.now.errors + row.now.errorClicks > 0),
      browsersDays: browsers ? browsers.first.days : null,
      // Every device on the page, whichever is chosen: this is the comparison of them.
      devices: splitLines((now?.pages ?? []).filter((row) => row.page === args.page), (row) => row.device),
      sources: sources ? { days: sources.first.days, rows: splitLines(sourceRows, (row) => row.split ?? null), cutDays: sources.first.cutDays ?? 0 } : null,
      recordings: await recordingsOf(ctx, holdId, span.from, span.to, args.page),
    };
  },
});

// ---------------------------------------------------------------- Errors (CS6)

export const clarityErrors = tenantQuery({
  args: screenArgs,
  returns: v.object({
    period: periodValidator,
    now: clarityMeasuresValidator,
    before: v.union(clarityMeasuresValidator, v.null()),
    byDay: v.array(dayValidator),
    browsers: v.union(v.null(), v.object({ days: v.number(), rows: v.array(splitLineValidator), cutDays: v.number() })),
    pages: v.array(v.object({ line: pageLineValidator, mostly: v.union(v.null(), v.object({ browser: v.string(), device: v.string() })), recording: v.union(v.string(), v.null()) })),
    pagesWithVisits: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const now = await readClarityPeriod(ctx, holdId, args.days);
    const before = await readBefore(ctx, holdId, args.days, now);
    const browsers = await readClarityPeriod(ctx, holdId, args.days, { kind: "BROWSERS" });
    const lines = await pageLines(ctx, holdId, now, before, args.device);
    const errorLines = lines.filter((line) => line.now.errors + line.now.errorClicks > 0).sort((a, b) => b.now.errors + b.now.errorClicks - (a.now.errors + a.now.errorClicks));
    const mostly = mostlyOn(browsers, args.device);
    const span = recordingSpan(now, args.days, await newestOf(ctx, holdId));
    const recordings = await recordingsOf(ctx, holdId, span.from, span.to);
    const shown = await titled(ctx, holdId, errorLines);
    return {
      period: await periodOf(ctx, holdId, now, before),
      now: websiteOf(now, args.device),
      before: before ? websiteOf(before, args.device) : null,
      byDay: daysOf(now, args.device),
      browsers: browsers ? { days: browsers.first.days, rows: splitLines(unpackTotals(browsers.first.site).filter(onDevice(args.device)), (row) => row.split ?? null), cutDays: browsers.first.cutDays ?? 0 } : null,
      pages: shown.map((line) => ({ line, mostly: mostly.get(line.page) ?? null, recording: errorRecordingOf(recordings, line.page) })),
      pagesWithVisits: lines.length,
    };
  },
});

// ---------------------------------------------------------------- Recordings (CM2)

export const clarityRecordingsList = tenantQuery({
  args: { siteId: v.id("companyWebsites"), days: v.number() },
  returns: v.object({ period: periodValidator, recordings: v.array(recordingValidator) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const now = await readClarityPeriod(ctx, holdId, args.days, { withPages: false });
    const span = recordingSpan(now, args.days, await newestOf(ctx, holdId));
    const recordings = await recordingsOf(ctx, holdId, span.from, span.to);
    const titles = await titlesOf(ctx, holdId, [...new Set(recordings.map((row) => row.page))]);
    return {
      period: await periodOf(ctx, holdId, now, null),
      recordings: recordings.map((row) => ({ ...row, title: titles.get(row.page) ?? null })),
    };
  },
});
