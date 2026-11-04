import { appendFileSync } from "fs";
import { readFixture } from "@/src/test/readFixture";
import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import { findingWords, type Finding } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const overview = readFixture("moreHandlesOverview");
const channels = readFixture("moreHandlesChannels");
const organic = readFixture("moreHandlesOrganicSearch");
const campaigns = readFixture("moreHandlesCampaigns");
const funnel = readFixture("moreHandlesFunnel");
const allPages = readFixture("moreHandlesAllPages");
const cupboardHandles = readFixture("moreHandlesCupboardHandlesPage");
const organicPurchases = readFixture("moreHandlesOrganicPurchasePages");
const products = readFixture("moreHandlesProducts");
const live = readFixture("moreHandlesLive");

/**
 * Google Analytics' pages, each on its own rules, on every period the date menu offers, on More Handles' own figures as
 * saved on 3–4 November 2026 (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5; Anthony, 2026-11-03: "every page
 * we touch needs its own finding", "we have a date selection picker FFS … please add this to your tests"). Each page's
 * figures are built as the page builds them (its `AnalyticsSees` data and its `useSeesPart` parts), cut as the eye cuts
 * them (`pageDataFor`), then read by its rules. A page whose rules go quiet on one period, or speak of money, a browser's
 * market or Hakken's own housekeeping, fails here before anyone opens the eye. Visits is in `pageFindingsPeriods.test.ts`.
 * Live has no date menu: it is held to a busy and a quiet half hour, written by hand in the shape of Google's live answer
 * beside the usual half hour worked out from More Handles' saved October.
 */

const WHOLE = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
const BEGUN = ["thisWeek", "thisMonth"] as const;
const NAMES = en.googleAnalytics.eyeNames;
type Rows = Array<Record<string, unknown>>;
type Period = (typeof WHOLE)[number] | (typeof BEGUN)[number];

/** A page's figures as the eye reads them, and its findings in plain English. */
function said(screen: string, data: unknown): { findings: Finding[]; words: string[] } {
  const findings = pageFindings(screen, pageDataFor(data, screen));
  return { findings, words: findings.map(findingWords) };
}

/** With PRINT_FINDINGS set to a file, each page's findings are written there, to be read while the rules are tuned. */
const print = (title: string, words: readonly string[]) => {
  if (process.env.PRINT_FINDINGS) appendFileSync(process.env.PRINT_FINDINGS, `${title}\n  ${words.join("\n  ")}\n`);
};

/** Never money, a browser's market move, nor Hakken's own housekeeping (pages not sorted yet), on any Google Analytics page. */
function expectClean(words: readonly string[]) {
  const text = words.join("\n");
  expect(/£|\$|€|revenue|worth|value|money|spend/i.test(text), text).toBe(false);
  expect(/Not sorted|NOT_SORTED|\(not set\)/.test(text), text).toBe(false);
  expect(words.some((line) => /^(Chrome|Safari|Edge|Firefox)[^,]*: (visits|views) (up|down)/.test(line)), text).toBe(false);
}

/**
 * A page's checks on every period: its headline and four or more on a whole period (`least`), two or more on one just
 * begun (`begun`). Some pages hold too few figures for that on a short span, and say less rather than make trivia up: a
 * page's own screen (one page's visits: 34 started on /cupboard-handles.html in Last week), and the pages behind a
 * square (one event for one group: 63 visits from Google bought in Last week), whose span before is not kept yet; and
 * Campaigns two days into a week.
 */
function everyPeriod(screen: string, build: (period: Period) => unknown, headline: (words: readonly string[], findings: readonly Finding[]) => boolean, least: Partial<Record<Period, number>> = {}, begun = 2) {
  for (const period of WHOLE) {
    test(period, () => {
      const { findings, words } = said(screen, build(period));
      print(`${screen} · ${period}`, words);
      expect(words.length, words.join("\n")).toBeGreaterThanOrEqual(least[period] ?? 4);
      expect(headline(words, findings), words.join("\n")).toBe(true);
      expectClean(words);
    });
  }
  for (const period of BEGUN) {
    test(period, () => {
      const { words } = said(screen, build(period));
      print(`${screen} · ${period}`, words);
      expect(words.length, words.join("\n")).toBeGreaterThanOrEqual(begun);
      expectClean(words);
    });
  }
}

// Overview: its figures, its panels, Who visited in the reader's words, and the Channels table's rows (`channelsTable`).
const WHO_NAMES: Record<string, string> = { new: "New", returning: "Returning", mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", male: "Male", female: "Female" };
function overviewPage(period: Period) {
  const one = (overview as Record<string, { now: unknown; before: unknown; landingLeft: number | null; kinds: Rows; who: Rows; channels: Rows }>)[period];
  return {
    figures: { now: one.now, before: one.before },
    panels: { landing: { left: one.landingLeft }, kinds: { rows: one.kinds } },
    who: one.who.map((row) => ({ name: WHO_NAMES[String(row.label)] ?? row.label, kind: row.kind, nowPercent: (row.share as number) * 100, beforePercent: row.shareBefore === null || row.shareBefore === undefined ? null : (row.shareBefore as number) * 100 })),
    channelsTable: { rows: one.channels },
    names: NAMES,
  };
}

// Channels: its own read's figures, and the table's rows (`channelsTable`).
function channelsPage(period: Period) {
  const one = (channels as Record<string, { figures: unknown; rows: Rows }>)[period];
  return { ...{ figures: one.figures }, channelsTable: { rows: one.rows }, names: NAMES };
}

// A channel's own screen, Organic Search: its own read (`figures`), the channel's name as its title says it.
function channelPage(period: Period) {
  const one = (organic as Record<string, { figures: unknown; kinds: Rows; movers: Rows }>)[period];
  return { figures: { figures: one.figures, kinds: one.kinds, movers: one.movers }, names: { ...NAMES, channel: "Organic Search" } };
}

// Campaigns: the table's page, and every campaign for the eye (`campaignsAll`).
function campaignsPage(period: Period) {
  const one = (campaigns as Record<string, { rows: Rows; total: number; untagged: number | null }>)[period];
  return { rows: one.rows.slice(0, 25), total: one.total, untagged: one.untagged, campaignsAll: { rows: one.rows }, names: NAMES };
}

// Funnel: the table's page of landing pages, the whole website (`website`) and every landing page's leaving (`landingAll`).
function funnelPage(period: Period) {
  const one = (funnel as Record<string, { rows: Rows; total: number; website: unknown; landingLeft: number | null }>)[period];
  return { rows: one.rows, total: one.total, page: 1, pages: Math.ceil(one.total / 25), website: one.website, ...(one.landingLeft !== null ? { landingAll: { leftPercent: one.landingLeft * 100 } } : {}), names: NAMES };
}

// All pages: the website's views (`website`), the pages that gained, lost and lost conversions most, as the server sorts
// them with the shop's own pages left out, and how the rest stand, as its eye is handed them.
function allPagesPage(period: Period) {
  const one = (allPages as Record<string, { website: unknown; gained: Rows; lost: Rows; conversionsLost: Rows; bands: unknown; concentration: unknown; shop: unknown; classifications: Rows }>)[period];
  return {
    website: one.website, pagesGained: { rows: one.gained }, pagesLost: { rows: one.lost }, pagesConversionsLost: { rows: one.conversionsLost },
    bands: one.bands, concentration: one.concentration, shop: one.shop,
    classifications: one.classifications.map((row) => ({ name: row.name ?? (row.kind === "SHOP_PAGES" ? "Search, basket and account" : "Not sorted yet"), views: row.views, viewsBefore: row.viewsBefore, pages: row.pages, shop: row.kind === "SHOP_PAGES", sorted: row.kind !== "NOT_SORTED" })),
    names: NAMES,
  };
}

// A page's own screen, /cupboard-handles-knobs/cupboard-handles.html: its boxes, its channels' visits, who looks at it.
const DEVICES: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };
const GENDERS: Record<string, string> = { female: "Female", male: "Male" };
function pagePage(period: Period) {
  const one = (cupboardHandles as Record<string, { views: number; viewsBefore: number | null; started: Record<string, number>; read: number | null; groupRead: number | null; sale: Record<string, number> | null; devices: Rows; ages: Rows; genders: Rows; channels: Rows }>)[period];
  return {
    devices: one.devices.map((row) => ({ name: DEVICES[String(row.device)] ?? row.device, viewsShare: row.share, websiteViewsShare: row.websiteShare })),
    ages: one.ages.map((row) => ({ name: `Aged ${String(row.key).replace("-", " to ")}`, peopleShare: row.share, websitePeopleShare: row.websiteShare })),
    genders: one.genders.map((row) => ({ name: GENDERS[String(row.key)] ?? row.key, peopleShare: row.share, websitePeopleShare: row.websiteShare })),
    boxes: {
      views: one.views, viewsBefore: one.viewsBefore, visits: one.started.visits ?? null, visitsBefore: one.started.visitsBefore ?? null, websiteVisits: one.started.websiteVisits ?? null,
      ...(one.sale ? { boughtRate: one.sale.startedVisits > 0 ? one.sale.visits / one.sale.startedVisits : null, websiteBoughtRate: one.sale.websiteVisits > 0 ? one.sale.websiteEventVisits / one.sale.websiteVisits : null } : {}),
      scrolledToBottomRate: one.read, groupScrolledToBottomRate: one.groupRead,
    },
    visitorsByChannel: { channels: one.channels },
    names: NAMES,
  };
}

// The pages behind a square: Organic Search's purchases.
function conversionPagesPage(period: Period) {
  return { ...(organicPurchases as Record<string, unknown>)[period] as object, names: NAMES };
}

// Products: its boxes and steps, the table's page and the chart's lists, as its page and panels hand them.
type ProductsPeriod = { choice: { steps: string[]; sale: string | null }; events: Array<{ eventName: string; visits: number; visitsBefore: number | null }>; neverBought: { count: number; countBefore: number | null; of: number }; table: Rows; chart: { compared: boolean; more: Rows; less: Rows; left: Rows } };
const EVENT_NAMES: Record<string, string> = { add_to_cart: "Added to basket", begin_checkout: "Started checkout", purchase: "Bought", view_item: "Looked at a product" };
function productsPage(period: Period) {
  const one = (products as unknown as Record<string, ProductsPeriod>)[period];
  const figureOf = (eventName: string) => one.events.find((event) => event.eventName === eventName) ?? { eventName, visits: 0, visitsBefore: null };
  const steps = one.choice.steps.map(figureOf).sort((left, right) => right.visits - left.visits);
  const sale = one.choice.sale ? figureOf(one.choice.sale) : null;
  const leftAt = (eventName: string) => {
    const step = steps.slice(0, 2).find((each) => each.eventName === eventName);
    if (!step || !sale) return null;
    return { now: Math.max(0, step.visits - sale.visits), before: step.visitsBefore !== null && sale.visitsBefore !== null ? Math.max(0, step.visitsBefore - sale.visitsBefore) : null };
  };
  const baskets = leftAt("add_to_cart");
  const checkouts = leftAt("begin_checkout");
  const nameOf = (eventName: string) => EVENT_NAMES[eventName] ?? eventName;
  const listed = (rows: Rows) => ({ picked: true, rows });
  return {
    boxes: {
      ...(baskets ? { basketsLeft: baskets.now, basketsLeftBefore: baskets.before } : {}),
      ...(checkouts ? { checkoutsLeft: checkouts.now, checkoutsLeftBefore: checkouts.before } : {}),
      ...(sale ? { sale: nameOf(sale.eventName), visitsThatBought: sale.visits, visitsThatBoughtBefore: sale.visitsBefore } : {}),
      productsNeverBought: one.neverBought.count, productsNeverBoughtBefore: one.neverBought.countBefore, productsAdded: one.neverBought.of, neverBoughtName: en.googleAnalytics.products.neverBought,
    },
    steps: { picked: true, rows: steps.map((step) => ({ name: nameOf(step.eventName), visits: step.visits, visitsBefore: step.visitsBefore, visitsThatBought: sale ? Math.min(sale.visits, step.visits) : 0, visitsLeft: sale ? Math.max(0, step.visits - sale.visits) : step.visits })) },
    productsTable: { picked: true, rows: one.table, othersName: en.googleAnalytics.products.table.eyeOthers },
    productsChart: { view: "left", ...(one.chart.compared ? { sellingMore: listed(one.chart.more), sellingLess: listed(one.chart.less) } : {}), leftMost: listed(one.chart.left) },
  };
}

const startsWith = (prefix: string) => (words: readonly string[]) => words.some((line) => line.startsWith(prefix));

describe("Google Analytics' pages find the biggest things on every period the date menu offers (More Handles, 3–4 November 2026)", () => {
  describe("Overview: the whole website's visits first", () => everyPeriod("googleAnalytics.overview", overviewPage, startsWith(`${NAMES.website}: visits`)));
  describe("Channels: the whole website's visits, with its conversions beside them", () => everyPeriod("googleAnalytics.channelsPage", channelsPage, startsWith(`${NAMES.website}: visits`)));
  describe("A channel's own screen: the channel's visits beside the whole website's", () => everyPeriod("googleAnalytics.channelPage", channelPage, startsWith("Organic Search: visits")));
  // Two days in, no campaign has the hundred visits a campaign's own figures need to be trusted: its headline alone.
  describe("Campaigns: every campaign visit together", () => everyPeriod("googleAnalytics.campaigns", campaignsPage, startsWith(`${NAMES.tagged}: visits`), {}, 1));
  describe("Funnel: the landing pages that moved and that people leave", () => everyPeriod("googleAnalytics.landing", funnelPage, (_words, findings) => findings.some((one) => String(one.params.measure) === "leftWithoutAnotherPercent" || one.id.includes(":landing"))));
  describe("All pages: the whole website's views", () => everyPeriod("googleAnalytics.allPages", allPagesPage, startsWith(`${NAMES.website}: views`)));
  describe("A page's own screen: its views", () => everyPeriod("googleAnalytics.page", pagePage, startsWith(`${NAMES.thisPage}: views`), { lastWeek: 3 }));
  describe("The pages behind a square: the pages that made most of its conversions", () => everyPeriod("googleAnalytics.conversionPages", conversionPagesPage, (_words, findings) => findings.some((one) => one.kind === "holdsMost"), { lastWeek: 2, lastMonth: 3, last3Months: 3, last6Months: 3 }, 1));
  describe("Products: the step the shop loses most at", () => everyPeriod("googleAnalytics.products", productsPage, (_words, findings) => findings.some((one) => one.kind === "step")));
});

describe("All pages says when its ups and downs may not be real (More Handles' tag, 3 September 2026)", () => {
  test("first on dates that cross the change, and not on dates after it", () => {
    for (const period of ["last3Months", "last6Months", "last12Months"] as const) {
      expect(said("googleAnalytics.allPages", allPagesPage(period)).findings[0]?.kind, period).toBe("countedDifferently");
    }
    expect(said("googleAnalytics.allPages", allPagesPage("lastMonth")).findings.some((one) => one.kind === "countedDifferently")).toBe(false);
  });
});

describe("Live: right now against a usual half hour last month, from saved figures (More Handles' October)", () => {
  const page = (moment: keyof typeof live.moments) => ({ ...live.moments[moment], usual: live.usual, names: NAMES });
  test("a busy half hour: more people than usual, and a page holding far more of them than of last month's views", () => {
    const { findings, words } = said("googleAnalytics.live", page("busy"));
    print(`googleAnalytics.live · busy`, words);
    expect(findings[0]?.kind, words.join("\n")).toBe("rowAbove");
    expect(words[0], words.join("\n")).toContain(`${NAMES.rightNow}: people in the last 30 minutes 64`);
    expect(findings.some((one) => one.id.startsWith("rowAbove:pages:peopleSharePercent")), words.join("\n")).toBe(true);
    expect(words.length).toBeGreaterThanOrEqual(3);
    expectClean(words);
  });
  test("a quiet half hour: fewer people than usual, and no page said to be busy that is busy every day", () => {
    const { findings, words } = said("googleAnalytics.live", page("quiet"));
    print(`googleAnalytics.live · quiet`, words);
    expect(findings[0]?.kind, words.join("\n")).toBe("rowBelow");
    expect(findings.some((one) => one.id.startsWith("rowAbove:pages")), words.join("\n")).toBe(false);
    expect(words.length).toBeGreaterThanOrEqual(2);
    expectClean(words);
  });
  test("nothing without a usual half hour: never a guess", () => {
    expect(said("googleAnalytics.live", { ...live.moments.busy, names: NAMES }).findings).toEqual([]);
  });
});
