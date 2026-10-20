import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { decodePages, isPageRef } from "./holdPageRefs";
import { readPeriodUnnamed } from "./searchConsolePeriodReads";
import { BookNames } from "./searchConsolePeriodBooks";
import { curveRows, keywordFiguresOf } from "./searchConsoleKeywordList";
import { daysOf } from "./searchConsoleReads";
import { addUp, shiftDay } from "./searchConsoleDays";
import { slotKey } from "./googleAnalyticsCollect";
import { splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { connectionOf, conversionsOf, countedOf, readSlot } from "./googleAnalyticsReads";
import { normalisePage } from "./utils/pageClassification";
import { onWebsite } from "./utils/sitemapReading";
import {
  CLICK_SHOWN,
  CLICK_TOP,
  CONVERT_VISITS,
  FALL_FROM,
  HERO_KINDS,
  LEAVE_VISITS,
  PUSH_FROM,
  PUSH_SHOWN,
  PUSH_TO,
  STAGE_OF,
  bandOf,
  heroesOf,
  websiteRatesOf,
  type GoogleFigures,
  type HeroKind,
  type HeroPage,
  type HeroPageInput,
  type VisitFigures,
  type WebsiteRates,
} from "./utils/heroes";

/**
 * A landing page's own four stages from Google to conversions
 * (docs/plans/active/google-analytics-plan.md §13, §15 screen 7): Shown in
 * Google, Clicked, Visits and Conversions — Search Console's showings,
 * position and clicks joined to Google Analytics' visits, engagement,
 * conversions and value, over the last 30 days to each one's newest day —
 * with whether the page is one of the website's heroes, its problems and what
 * fixing each is worth (`utils/heroes.ts`). Read by a landing page's own
 * screen.
 *
 * The two are joined by the page's path, cleaned as every page of the hold is
 * (`normalisePage`): Search Console names a page by its whole address,
 * Analytics by its path on the website's own host, and both by the hold's one
 * page numbering (§4.6) — the path is what the numbering's addresses share.
 *
 * Read from the ready-made 30 days and the 30 days before, as every
 * Analytics screen is: Search Console's page list, Analytics' landing pages
 * and channels. Nothing is asked of Google, nothing written.
 */

/** The days every figure here covers: a month, so a fix's worth reads "a month". */
const DAYS = "30";
/** Search Console's lists are calendar periods (calendar-periods-plan.md, phase 4): last month stands for the 30 days. */
const CONSOLE_PERIOD = "lastMonth" as const;

/** Google's own search, as Analytics names its visits: Organic Search from google. */
function fromGoogle(key: string): boolean {
  const { channel, source } = splitChannelKey(key);
  return channel === "Organic Search" && source.trim().toLowerCase().startsWith("google");
}

type Reader = { db: QueryCtx["db"] };

/**
 * One page, however a source writes it: its cleaned path without a trailing
 * slash. Search Console names Ronins' guide `/hub/what-makes-a-good-app/` and
 * Analytics `/hub/what-makes-a-good-app`, and the two were one page split in
 * two. The path shown is the one Search Console gives, else Analytics'.
 */
export function pageKeyOf(address: string): string {
  const path = normalisePage(address);
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

type PageFacts = {
  /** Search Console's whole address for the page, for its screen there. */
  consoleAddress: string | null;
  /** Analytics' number for the page as a landing page, for its own screen here. */
  landingKey: string | null;
  /** The page's whole address, as Analytics or Search Console named it. */
  address: string;
};

type Journey = {
  state: "NOT_CONNECTED" | "PREPARING" | "READY";
  currency: string | null;
  consoleConnected: boolean;
  consoleTo: string | null;
  analyticsTo: string | null;
  pages: HeroPage[];
  facts: Map<string, PageFacts>;
  rates: WebsiteRates | null;
  /** The website's own figures, every visit: what a page's value is a share of. */
  website: VisitFigures;
  /** Visits Google's own search sent, whichever page they started on. */
  google: VisitFigures;
  /**
   * Search Console's own totals for the website over the days: Google leaves
   * some clicks off its page-by-page figures (Ronins, 30 days to 8 October:
   * 367 clicks in all, 189 across its pages), so the website's figures read
   * the totals and each page its own row.
   */
  consoleTotals: { shown: number; clicks: number; position: number } | null;
};

const NONE: VisitFigures = { visits: 0, engaged: 0, conversions: 0, value: 0 };

/** A list's rows added up into one page's figures, conversions and value worked out as every screen does. */
function visitFigures(rows: readonly ListRow[], counted: ReturnType<typeof countedOf>): VisitFigures {
  const figures = { ...NONE };
  for (const row of rows) {
    const { conversions, value } = conversionsOf(row, counted);
    figures.visits += row.visits;
    figures.engaged += row.engaged;
    figures.conversions += conversions;
    figures.value += value;
  }
  return figures;
}

const asGoogle = (page: { shown: number; clicks: number; positionSum: number } | undefined): GoogleFigures | null =>
  page && page.shown > 0 ? { shown: page.shown, clicks: page.clicks, position: page.positionSum / page.shown } : null;

/**
 * Which pages a read names. Every page's figures are read, but a page's
 * address only when it is needed: for one page's own view, that page alone,
 * by Analytics' number and Search Console's address, and every page with
 * value, which the heroes are worked out from; with no page in focus, every
 * page the rules could flag — Analytics' pages with visits enough for a rule
 * or any value, Search Console's in the top five or at 8 to 20 with showings
 * enough. Naming every page of a large website, from Analytics' numbering and
 * Search Console's book alike, read more than a query may (measured at five
 * times morehandles.co.uk, `googleAnalyticsHeroesLoad.test.ts`).
 */
export type Focus = { page: null } | { page: { ref: string | null; consoleAddress: string | null } };

/** Whether Analytics' figures could set off a rule, or make a hero: worth naming the page. */
function visitsMatter(now: ListRow | undefined, before: ListRow | undefined, counted: ReturnType<typeof countedOf>): boolean {
  return (now?.visits ?? 0) >= Math.min(LEAVE_VISITS, CONVERT_VISITS)
    || (before?.visits ?? 0) >= FALL_FROM
    || (now ? conversionsOf(now, counted).value > 0 : false);
}

/** Whether Search Console's figures could set off a rule: in the top five, or at 8 to 20 shown often enough. */
function showingsMatter(row: { impressions: number; positionSum: number }): boolean {
  if (row.impressions <= 0) return false;
  const position = Math.round(row.positionSum / row.impressions);
  return (position <= CLICK_TOP && row.impressions >= CLICK_SHOWN) || (position >= PUSH_FROM && position <= PUSH_TO && row.impressions >= PUSH_SHOWN);
}

/** An address as Search Console may write it: as it is, and with and without its last slash. */
function addressForms(address: string): string[] {
  const bare = address.replace(/\/+$/, "");
  return [...new Set([address, bare, `${bare}/`])];
}

/** Search Console's page list for the days: each page named by its book's text, only the rows `keep` takes, folded by page. */
async function consolePages(
  ctx: Reader,
  holdId: Id<"companyWebsites">,
  host: string,
  which: "NOW" | "BEFORE",
  pick: { all: true } | { tokensOf: (names: BookNames) => Promise<Set<string>> },
) {
  const period = await readPeriodUnnamed(ctx, holdId, "web", "page", CONSOLE_PERIOD, which);
  const pages = new Map<string, { shown: number; clicks: number; positionSum: number; address: string }>();
  if (!period) return { pages, to: null };
  const names = period.book ? new BookNames(ctx, period.book) : null;
  const wanted = "tokensOf" in pick && names ? await pick.tokensOf(names) : null;
  const rows = period.rows.filter((row) => (wanted ? wanted.has(row.key) : showingsMatter(row)));
  const texts = names ? await names.textsOf(rows.map((row) => row.key)) : null;
  for (const row of rows) {
    const address = texts?.get(row.key) ?? row.key;
    if (!address || !onWebsite(address, host)) continue;
    const path = pageKeyOf(address);
    const page = pages.get(path) ?? { shown: 0, clicks: 0, positionSum: 0, address };
    page.shown += row.impressions;
    page.clicks += row.clicks;
    page.positionSum += row.positionSum;
    pages.set(path, page);
  }
  return { pages, to: period.to };
}

/** Search Console and Analytics joined page by page: the one page in focus, or every page the rules could flag. */
export async function journeyOf(ctx: Reader, holdId: Id<"companyWebsites">, host: string, focus: Focus = { page: null }): Promise<Journey> {
  const connection = await connectionOf(ctx, holdId);
  const empty = (state: Journey["state"]): Journey => ({
    state, currency: connection?.currency ?? null, consoleConnected: false, consoleTo: null, analyticsTo: null,
    pages: [], facts: new Map(), rates: null, website: NONE, google: NONE, consoleTotals: null,
  });
  if (!connection?.newestDay || connection.status === "CHOOSING" || connection.status === "COUNTING") return empty("NOT_CONNECTED");
  const counted = countedOf(connection);
  const [landing, landingBefore, channels] = await Promise.all([
    readSlot(ctx, holdId, slotKey("landing", DAYS, "NOW", "")),
    readSlot(ctx, holdId, slotKey("landing", DAYS, "BEFORE", "")),
    readSlot(ctx, holdId, slotKey("channel", DAYS, "NOW", "")),
  ]);
  if (!landing || !channels) return empty("PREPARING");

  // Every landing page's value, by its number: the heroes are a share of it all.
  const beforeOf = new Map((landingBefore?.rows ?? []).map((row) => [row.key, row]));
  const totalValue = landing.rows.reduce((sum, row) => sum + (row.key === "(not set)" ? 0 : conversionsOf(row, counted).value), 0);
  // Analytics' pages named: the ones that could matter, every hero among them; or the one in focus.
  const nowOf = new Map(landing.rows.map((row) => [row.key, row]));
  const named = focus.page
    ? [...new Set([...(focus.page.ref ? [focus.page.ref] : []), ...landing.rows.filter((row) => conversionsOf(row, counted).value > 0).map((row) => row.key)])]
    : [...new Set([...landing.rows.map((row) => row.key), ...beforeOf.keys()])].filter((key) => visitsMatter(nowOf.get(key), beforeOf.get(key), counted));
  const refs = named.filter(isPageRef);
  const addresses = await decodePages(ctx, holdId, refs);
  const addressOf = new Map(refs.map((key, index) => [key, addresses[index]]));
  const byPath = (keys: readonly string[], rowOf: (key: string) => ListRow | undefined) => {
    const pages = new Map<string, { rows: ListRow[]; key: string; address: string }>();
    for (const key of keys) {
      const row = rowOf(key);
      const address = addressOf.get(key) ?? key;
      if (!row || address === "(not set)" || isPageRef(address)) continue;
      const path = pageKeyOf(address);
      const page = pages.get(path) ?? { rows: [], key, address };
      page.rows.push(row);
      pages.set(path, page);
    }
    return pages;
  };
  const visitsNow = byPath(named, (key) => nowOf.get(key));
  const visitsBefore = byPath(named, (key) => beforeOf.get(key));

  // Search Console's pages, when the website's own Search Console is connected with figures.
  const console = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
  const consoleConnected = console?.status === "CONNECTED" && !console.clearing && Boolean(console.newestDay);
  // One page's own view: its Search Console row by the address it is known by, and by Analytics' address for it.
  const focusForms = focus.page
    ? [...new Set([...(focus.page.consoleAddress ? addressForms(focus.page.consoleAddress) : []), ...[...visitsNow.values()].filter((page) => page.key === (focus.page as { ref: string | null }).ref).flatMap((page) => addressForms(page.address))])]
    : [];
  const tokensOf = async (names: BookNames) => new Set(await Promise.all(focusForms.map((form) => names.tokenOf("page", form))));
  const shownNow = consoleConnected ? await consolePages(ctx, holdId, host, "NOW", focus.page ? { tokensOf } : { all: true }) : null;
  // The days before only for one page's view.
  const shownBefore = consoleConnected && focus.page ? await consolePages(ctx, holdId, host, "BEFORE", { tokensOf }) : null;
  const consoleTo = shownNow?.to ?? null;
  const totals = consoleTo ? addUp(await daysOf(ctx, holdId, "web", shiftDay(consoleTo, -(Number(DAYS) - 1)), consoleTo)) : null;

  const facts = new Map<string, PageFacts>();
  const inputs: HeroPageInput[] = [];
  for (const key of new Set([...visitsNow.keys(), ...(shownNow?.pages.keys() ?? [])])) {
    const visits = visitsNow.get(key);
    const shown = shownNow?.pages.get(key);
    // The path as Search Console writes it, else as Analytics does.
    const path = normalisePage(shown?.address ?? visits?.address ?? key);
    facts.set(path, { consoleAddress: shown?.address ?? null, landingKey: visits?.key ?? null, address: visits?.address ?? shown?.address ?? path });
    const before = visitsBefore.get(key);
    inputs.push({
      page: path,
      google: asGoogle(shown),
      googleBefore: asGoogle(shownBefore?.pages.get(key)),
      visits: visits ? visitFigures(visits.rows, counted) : null,
      visitsBefore: before ? visitFigures(before.rows, counted) : null,
    });
  }
  const website = visitFigures(channels.rows, counted);
  const google = visitFigures(channels.rows.filter((row) => fromGoogle(row.key)), counted);
  // The click rate at each position from the website's searches, as Search Console's Click rate by position reads it.
  const searches = consoleConnected ? await keywordFiguresOf(ctx, holdId, "web", CONSOLE_PERIOD, undefined) : null;
  const rates = websiteRatesOf(website, curveRows(searches), totalValue);
  return {
    state: "READY",
    currency: connection.currency ?? null,
    consoleConnected,
    consoleTo,
    analyticsTo: landing.to,
    pages: heroesOf(inputs, rates),
    facts,
    rates,
    website,
    google,
    consoleTotals: totals && totals.impressions > 0 ? { shown: totals.impressions, clicks: totals.clicks, position: totals.position } : null,
  };
}

// ---------------------------------------------------------------------------
// A landing page's four stages (§15, screen 7)
// ---------------------------------------------------------------------------

const kindValidator = v.union(...HERO_KINDS.map((kind) => v.literal(kind)));

/** Tasks a person sets are few: the limit's highest choice is 100, and paused ones are kept. */
const TASKS_READ = 300;

/** The paths of this website's pages one of the reader's Hakken tasks watches. */
async function watchedPages(ctx: Reader & { userId?: Id<"users"> }, companyId: Id<"companies">, holdId: Id<"companyWebsites">): Promise<Set<string>> {
  if (!ctx.userId) return new Set();
  const userId = ctx.userId;
  const tasks = await ctx.db.query("hakkenTasks").withIndex("by_owner", (q) => q.eq("userId", userId).eq("companyId", companyId)).take(TASKS_READ);
  return new Set(tasks.filter((task) => task.state !== "DELETED" && task.target?.companyWebsiteId === holdId && task.target.page).map((task) => pageKeyOf(task.target!.page!)));
}

const figuresValidator = v.union(v.null(), v.object({ shown: v.number(), clicks: v.number(), position: v.number() }));
const visitsValidator = v.union(v.null(), v.object({ visits: v.number(), engaged: v.number(), conversions: v.number(), value: v.number() }));

export const heroPageValidator = v.object({
  page: v.string(),
  address: v.string(),
  /** Search Console's address for it, for its searches there; null when Google showed it nowhere. */
  consoleAddress: v.union(v.string(), v.null()),
  /** Analytics' number for it as a landing page, for its own screen; null when no visit started on it. */
  landingKey: v.union(v.string(), v.null()),
  google: figuresValidator,
  googleBefore: figuresValidator,
  visits: visitsValidator,
  visitsBefore: visitsValidator,
  hero: v.boolean(),
  /** Its problems, worth most first; then whether it is a hero. */
  problems: v.array(v.object({
    kind: kindValidator,
    worth: v.union(v.number(), v.null()),
    gain: v.union(v.number(), v.null()),
    expected: v.optional(v.number()),
  })),
  /** The stage where it loses most: 0 Shown in Google, 1 Clicked, 2 Visits, 3 Conversions; null with nothing to say. */
  marked: v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3), v.null()),
  /** The website's figures each problem's words quote. */
  website: v.object({
    conversionRate: v.union(v.number(), v.null()),
    value: v.number(),
    clickRateAt: v.union(v.number(), v.null()),
  }),
  task: v.boolean(),
});

/**
 * One page's four stages from Google to money and its problems. A landing
 * page's own screen asks by Analytics' number alone; a page may also be asked
 * by its path, with Analytics' number and Search Console's address for it.
 * Read for that page alone.
 */
export const analyticsHeroPage = tenantQuery({
  args: { siteId: v.id("companyWebsites"), page: v.string(), ref: v.optional(v.string()), console: v.optional(v.string()) },
  returns: v.object({
    state: v.union(v.literal("NOT_CONNECTED"), v.literal("PREPARING"), v.literal("READY")),
    currency: v.union(v.string(), v.null()),
    consoleConnected: v.boolean(),
    consoleTo: v.union(v.string(), v.null()),
    analyticsTo: v.union(v.string(), v.null()),
    found: v.union(v.null(), heroPageValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const ref = isPageRef(args.page) ? args.page : args.ref ?? null;
    const journey = await journeyOf(ctx, site.hold._id, site.website.host, { page: { ref, consoleAddress: args.console ?? null } });
    // A landing page's own screen names its page by Analytics' number.
    const key = pageKeyOf(isPageRef(args.page) ? (await decodePages(ctx, site.hold._id, [args.page]))[0] : args.page);
    const page = journey.pages.find((one) => pageKeyOf(one.page) === key) ?? null;
    const facts = page ? journey.facts.get(page.page) : undefined;
    const watched = page ? await watchedPages(ctx, site.hold.companyId, site.hold._id) : new Set<string>();
    const kinds: HeroKind[] = page ? [...page.problems.map((problem) => problem.kind), ...(page.hero ? ["hero" as const] : [])] : [];
    const found = page && facts ? {
      page: page.page,
      address: facts.address,
      consoleAddress: facts.consoleAddress,
      landingKey: facts.landingKey,
      google: page.google,
      googleBefore: page.googleBefore,
      visits: page.visits,
      visitsBefore: page.visitsBefore,
      hero: page.hero,
      problems: page.problems.map((problem) => ({
        kind: problem.kind,
        worth: problem.worth === null ? null : Math.round(problem.worth),
        gain: problem.gain === null ? null : Math.round(problem.gain),
        ...(problem.expected !== undefined ? { expected: Math.round(problem.expected) } : {}),
      })),
      marked: kinds.length > 0 ? STAGE_OF[kinds[0]] : null,
      website: {
        conversionRate: journey.rates?.conversionRate ?? null,
        value: journey.website.value,
        clickRateAt: page.google && journey.rates ? journey.rates.clickRates[bandOf(page.google.position)] : null,
      },
      task: watched.has(key),
    } : null;
    return {
      state: journey.state,
      currency: journey.currency,
      consoleConnected: journey.consoleConnected,
      consoleTo: journey.consoleTo,
      analyticsTo: journey.analyticsTo,
      found,
    };
  },
});

