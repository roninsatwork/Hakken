import { appendFileSync } from "fs";
import { readFixture } from "@/src/test/readFixture";
import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import { cameFromWords, campaignForEye, campaignNameWords } from "../campaignNames";
import { funnelFigures } from "../landingFlowFigures";
import { findingWords, type Finding } from "./findings";
import { overviewFigures, type OverviewSplitAnswer, type OverviewSplitName } from "./overviewFigures";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";
import { OWN_FINDINGS } from "./pageOwnFindings";

const overview = readFixture("moreHandlesOverview");
const hurtwoodOverview = readFixture("hurtwoodHouseOverview");
const roninsOverview = readFixture("roninsOverview");
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
 * Live has no date menu: it is held to a busy, a quiet and an empty half hour, written by hand in the shape of Google's live answer, and to one real one (10:15 on 6 November 2026)
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

// Overview: the page's figures as `overviewFigures` builds them for the eye, on a shop, a service business and a small website.
type OverviewFixture = Record<Period, { figures: { now: never; before: never }; chart: never; before: never; splits: Record<OverviewSplitName, OverviewSplitAnswer>; pages: { rows: never } }>;
const eventWords = (name: string) => (en.googleAnalytics.events as Record<string, string>)[name] ?? name.replace(/[_-]+/g, " ").replace(/^./, (first) => first.toUpperCase());
const VISITOR_WORDS: Record<string, string> = { new: "New", returning: "Returning", mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };
function overviewOf(fixture: unknown, shop: boolean, cells: number) {
  return (period: Period) => {
    const one = (fixture as OverviewFixture)[period];
    const figures = overviewFigures({
      shop, cells, now: one.figures.now, before: one.figures.before, chart: one.chart, daysBefore: one.before, splits: one.splits, pages: one.pages.rows,
      rowName: (split, row) => (split === "kind" ? row.name ?? row.key : VISITOR_WORDS[row.key] ?? row.key), eventName: eventWords,
    });
    return { ...figures, eventCodes: Object.fromEntries(one.splits.channel.events.map((event) => [eventWords(event.name), event.name])), locale: "en-GB", names: NAMES };
  };
}
const overviewPage = overviewOf(overview, true, 100);
const hurtwoodOverviewPage = overviewOf(hurtwoodOverview, false, 1000);
const roninsOverviewPage = overviewOf(roninsOverview, false, 1000);

// Channels (channels-new-page-plan-2026-11-06.md, step 8): every channel, Google's own total for the website, the squares by Classification and
// by device, and the steps, as the page hands them. October is real; `moreHandlesChannels.json` says how the other periods were made.
function channelsPage(period: Period) {
  const one = (channels as unknown as Record<string, { website: Record<string, number>; rows: Rows; channelSquares: { rows: Rows }; channelDevices: { rows: Rows }; channelSteps: Record<string, unknown> }>)[period];
  const words = en.googleAnalytics.channelsPage.steps;
  return {
    names: NAMES, sells: true, website: one.website, rows: one.rows, channelSquares: one.channelSquares, channelDevices: one.channelDevices,
    channelSteps: { ...one.channelSteps, steps: { arrived: words.arrived, stayed: words.stayed, basket: words.basket, checkout: words.checkout, bought: words.bought } },
  };
}

// A channel's own screen, Organic Search: its own read (`figures`), the channel's name as its title says it.
function channelPage(period: Period) {
  const one = (organic as Record<string, { figures: unknown; kinds: Rows; movers: Rows }>)[period];
  return { figures: { figures: one.figures, kinds: one.kinds, movers: one.movers }, names: { ...NAMES, channel: "Organic Search" } };
}

// Campaigns: every campaign in the page's names, the list's totals, the whole website, and what people did, as `CampaignsSees` and the squares hand them.
const DID: Record<string, string> = en.googleAnalytics.campaigns.squares.did;
function campaignsPage(period: Period) {
  const one = (campaigns as Record<string, { rows: Rows; total: number; untagged: number | null; totals: unknown; website: unknown; events: string[]; actions: Array<{ label: string; cameFrom: string; visits: number; times: number[]; visitsDid: Array<number | null> }> }>)[period];
  const thing = (event: string) => DID[event] ?? event;
  return {
    rows: one.rows.map((row) => campaignForEye(row as never, campaignNameWords(String(row.label), String(row.cameFrom)), cameFromWords(String(row.cameFrom)))),
    total: one.total, untagged: one.untagged, totals: one.totals, website: one.website, sells: true, names: NAMES,
    whatPeopleDid: {
      things: one.events.map(thing),
      unit: "visits",
      campaigns: one.actions.map((row) => ({ name: campaignNameWords(row.label, row.cameFrom), visits: row.visits, ...Object.fromEntries(one.events.map((event, at) => [thing(event), row.visitsDid[at] ?? 0])) })),
    },
  };
}

// Funnel: the table's page of landing pages, the whole website (`website`), every landing page's leaving (`landingAll`), and
// the route chart's figures (`funnel`), as `FunnelSees` hands them, from the chart's own read.
function funnelPage(period: Period) {
  const one = (funnel as Record<string, { rows: Rows; total: number; website: unknown; landingLeft: number | null; flow: Parameters<typeof funnelFigures>[0] | null }>)[period];
  return {
    rows: one.rows, total: one.total, page: 1, pages: Math.ceil(one.total / 25), website: one.website, names: NAMES,
    ...(one.landingLeft !== null ? { landingAll: { leftPercent: one.landingLeft } } : {}),
    ...(one.flow ? { funnel: funnelFigures(one.flow, { shop: "Search and basket", notSorted: "Not sorted yet", otherPages: "Other pages", otherGroups: (count) => `${count} other groups`, pageNotKnown: "Page not known" }) } : {}),
  };
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

describe("Campaigns says what a person would miss (More Handles' October; campaigns-new-page-plan-2026-11-05.md, step 8)", () => {
  const { words } = said("googleAnalytics.campaigns", campaignsPage("lastMonth"));

  test("campaigns sell more than their share of visits", () => {
    expect(words).toContain("All campaign visits: share of everything bought 54.3%, against 44% for their share of all visits.");
  });

  test("a busy campaign that sold nothing, however easy it is to miss in a table of 34", () => {
    expect(words).toContain("Facebook ad with no name: bought for every 100 visits 0, against 4.2 for All campaign visits.");
  });

  test("two campaigns account for the whole fall", () => {
    expect(words).toContain("Performance Max > Top Performing Products, Performance Max > Listing Only - High Target ROAS: visits lost 1193, against 1118 for All campaign visits.");
  });

  test("the headline counts all 34 campaigns' dates before, not only those with visits now", () => {
    expect(words).toContain("All campaign visits: visits down 6.6%, to 15732 from 16850 the span before; Bought: down 6.7%.");
  });

  test("what people did is weighed in visits, so a rate is a true share", () => {
    const page = campaignsPage("lastMonth");
    expect(page.whatPeopleDid.unit).toBe("visits");
    const zombies = page.whatPeopleDid.campaigns.find((one) => one.name === "Performance Max > Zombies") as Record<string, unknown>;
    expect(zombies["Added to basket"]).toBe(715);
  });
});

describe("Google Analytics' pages find the biggest things on every period the date menu offers (More Handles, 3–4 November 2026)", () => {
  describe("Overview, a shop: the whole website's visits, with what was bought", () => everyPeriod("googleAnalytics.overview", overviewPage, startsWith(`${NAMES.website}: visits`)));
  describe("Overview, a service business: the whole website's visits, with its events", () => everyPeriod("googleAnalytics.overview", hurtwoodOverviewPage, startsWith(`${NAMES.website}: visits`)));
  // A small website still says something true, on every date.
  describe("Overview, a small website", () => everyPeriod("googleAnalytics.overview", roninsOverviewPage, startsWith(`${NAMES.website}: visits`), { lastWeek: 3 }));
  describe("Channels: the whole website's visits, by Google's own total, with what was bought beside them", () => everyPeriod("googleAnalytics.channelsPage", channelsPage, startsWith(`${NAMES.website}: visits`)));
  describe("A channel's own screen: the channel's visits beside the whole website's", () => everyPeriod("googleAnalytics.channelPage", channelPage, startsWith("Organic Search: visits")));
  // Early in a week, few campaigns have the hundred visits a campaign's own figures need to be trusted.
  describe("Campaigns: every campaign visit together", () => everyPeriod("googleAnalytics.campaigns", campaignsPage, startsWith(`${NAMES.tagged}: visits`), {}, 1));
  describe("Funnel: the whole website's visits, and never the shop's own pages as a page that moved", () => everyPeriod("googleAnalytics.landing", funnelPage, (words) => startsWith(`${NAMES.website}: visits`)(words) && !words.some((line) => /\/checkout|\/catalogsearch/.test(line) || /^(Basket|Checkout|Search results|Log in|Your account)[^:]*:/.test(line))));
  describe("All pages: the whole website's views", () => everyPeriod("googleAnalytics.allPages", allPagesPage, startsWith(`${NAMES.website}: views`)));
  describe("A page's own screen: its views", () => everyPeriod("googleAnalytics.page", pagePage, startsWith(`${NAMES.thisPage}: views`), { lastWeek: 3 }));
  describe("The pages behind a square: the pages that made most of its conversions", () => everyPeriod("googleAnalytics.conversionPages", conversionPagesPage, (_words, findings) => findings.some((one) => one.kind === "holdsMost"), { lastWeek: 2, lastMonth: 3, last3Months: 3, last6Months: 3 }, 1));
  describe("Products: the step the shop loses most at", () => everyPeriod("googleAnalytics.products", productsPage, (_words, findings) => findings.some((one) => one.kind === "step")));
});

describe("Channels finds what a person scanning the page would miss, on More Handles' October (channels-new-page-plan-2026-11-06.md, step 8)", () => {
  // Every finding its rules can make, not only the six the panel shows.
  const screen = "googleAnalytics.channelsPage";
  const findings = OWN_FINDINGS[screen].find(pageDataFor(channelsPage("lastMonth"), screen) as Record<string, unknown>) as Finding[];
  const words = findings.map(findingWords);
  const all = words.join("\n");
  const found = (id: string) => findings.some((one) => one.id === id);
  print("googleAnalytics.channelsPage · October, all", words);

  test("a fall one channel explains: what it lost beside the whole website, by Google's own total, and what the others gained", () => {
    // The list's own fall, as Google counts each list on its own: never against the whole website's total.
    expect(words.join("\n")).toMatch(/Cross-network: visits lost 1917, against \d{3} for All the channels together\./);
    expect(words).toContain("All the other channels: visits gained 1158, against 1917 for Cross-network.");
  });
  test("a rise hiding a fall: a channel up a little, and one Classification up by far more", () => {
    expect(all).toContain("Organic Search, Brand: visits up 129.9%, to 2035 from 885 the span before; Organic Search: up 2.8%.");
  });
  test("the channel that sells best, and why", () => {
    expect(all).toContain("Paid Search: bought for every 100 visits 9.1, against 3.4 for The whole website.");
    expect(found("rowAbove:squares:bestWhere:shareOfChannelBought:Paid Search, Brand")).toBe(true);
  });
  test("big, but sells less", () => {
    expect(all).toContain("Organic Search: share of everything bought 23.5%, against 36.8% for their share of all visits.");
  });
  test("a Classification people read and don't buy from", () => {
    expect(all).toContain("Organic Search, Blog: bought for every 100 visits 0.1, against 2.2 for Organic Search.");
  });
  test("busy, and nobody bought: against the whole website, and how many left", () => {
    expect(all).toContain("Paid Social: bought for every 100 visits 0, against 3.4 for The whole website.");
    expect(all).toContain("Paid Social: share of visits that left at once");
  });
  test("a step far from the rest, each visit counted once", () => {
    expect(all).toContain("Referral, In basket to At checkout: went on to the next step 12.4%, against 42.8% for The whole website.");
  });
  test("a gap between devices, on enough visits to trust", () => {
    expect(findings.some((one) => one.id.startsWith("rowAbove:devices:gap:boughtPerHundred:") || one.id.startsWith("rowBelow:devices:gap:boughtPerHundred:"))).toBe(true);
  });
  test("the visits with no page recorded", () => {
    expect(found("holdsMost:channels:noPage:visits:No page recorded")).toBe(true);
  });
  test("and it speaks of nothing the page doesn't: no money, no cost, no conversions as if they were visits", () => {
    expectClean(words);
    expect(all).not.toMatch(/cost|paid for itself|%.*conversions? rate/i);
    expect(all).not.toMatch(/conversions for every 100 visits/);
  });
});

describe("Channels hands the eye all of it, whichever the dates", () => {
  for (const period of [...WHOLE, ...BEGUN]) {
    test(`${period}: every channel fits, with a chart's 92 points each side`, () => {
      const page = channelsPage(period);
      const day = (at: number) => ({ day: `2026-08-${String((at % 28) + 1).padStart(2, "0")}`, ...Object.fromEntries((page.rows as Array<{ name: string }>).map((row) => [row.name, 1234])) });
      const days = Array.from({ length: 92 }, (_, at) => day(at));
      const handed = pageDataFor({ ...page, channelsByDay: { days, daysBefore: days } }, "googleAnalytics.channelsPage") as { rows: unknown[]; channelSquares: { rows: unknown[] } };
      expect(handed.rows).toHaveLength(page.rows.length);
      expect(handed.channelSquares.rows).toHaveLength(page.channelSquares.rows.length);
    });
  }
});

describe("Channels on the websites unlike More Handles", () => {
  const row = (name: string, visits: number, visitsBefore: number, conversions: number, conversionsBefore: number, bounceRate = 0.4) => ({ name, visits, visitsBefore, purchases: 0, purchasesBefore: 0, conversions, conversionsBefore, bounceRate, engaged: Math.round(visits * (1 - bounceRate)), addedToBasket: 0, startedCheckout: 0 });
  // Ronins' October, near enough: 245 visits and a handful of events, on a website with nothing bought.
  const few = { names: NAMES, sells: false, website: { visits: 245, visitsBefore: 301, engaged: 150, conversions: 9, conversionsBefore: 6, bought: 0, boughtBefore: 0 }, rows: [row("Organic Search", 150, 170, 6, 2), row("Direct", 60, 90, 2, 3), row("Referral", 35, 41, 1, 1)] };

  test("a website with few visits and nothing bought still says something true, and speaks of events", () => {
    const { findings, words } = said("googleAnalytics.channelsPage", few);
    const all = words.join("\n");
    expect(words[0]).toContain("The whole website: visits down");
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(all).not.toMatch(/purchases|bought/i);
    expect(all).not.toMatch(/conversions/i);
    expect(all).toContain("Events: up");
    expect(all).toMatch(/events for every 100 visits|share of all events|events lost/);
    expectClean(words);
  });
  test("with nothing to set it against, it says who brought the most", () => {
    const { words } = said("googleAnalytics.channelsPage", { ...few, website: { visits: 245, engaged: 150, conversions: 9, bought: 0 }, rows: [{ ...few.rows[0], visitsBefore: null, conversionsBefore: null }, { ...few.rows[1], visitsBefore: null, conversionsBefore: null }] });
    expect(words.join("\n")).toContain("Organic Search holds 61.2% of the list's visits.");
  });
  test("a channel that stopped altogether is still named", () => {
    const { words } = said("googleAnalytics.channelsPage", { ...few, gone: [{ name: "Email", visits: 0, visitsBefore: 90, purchases: 0, purchasesBefore: 0, conversions: 0, conversionsBefore: 4 }] });
    expect(words.join("\n")).toMatch(/Email: visits lost 90, against \d+ for All the channels together\./);
  });
  test("no visits at all: only that, and nothing broken", () => {
    const { findings, words } = said("googleAnalytics.channelsPage", { names: NAMES, sells: false, website: { visits: 0, visitsBefore: 12, engaged: 0, conversions: 0, conversionsBefore: 0, bought: 0, boughtBefore: 0 }, rows: [] });
    expect(findings.map((one) => one.kind)).toEqual(["movedDown"]);
    expectClean(words);
  });
  test("nothing held at all: nothing made up", () => {
    expect(said("googleAnalytics.channelsPage", { names: NAMES, rows: [] }).findings).toEqual([]);
  });
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
  test("a busy half hour: more people than usual, and a page holding far more of the views than of last month's", () => {
    const { findings, words } = said("googleAnalytics.live", page("busy"));
    print(`googleAnalytics.live · busy`, words);
    expect(findings[0]?.kind, words.join("\n")).toBe("rowAbove");
    expect(words[0], words.join("\n")).toContain(`${NAMES.rightNow}: people in the last 30 minutes 64`);
    expect(findings.some((one) => one.id.startsWith("rowAbove:pages:viewsSharePercent")), words.join("\n")).toBe(true);
    expect(words.length).toBeGreaterThanOrEqual(3);
    expectClean(words);
  });
  test("a quiet half hour: fewer people than usual, and no page said to be busy on a handful of views", () => {
    const { findings, words } = said("googleAnalytics.live", page("quiet"));
    print(`googleAnalytics.live · quiet`, words);
    expect(findings[0]?.kind, words.join("\n")).toBe("rowBelow");
    expect(findings.some((one) => one.id.startsWith("rowAbove:pages")), words.join("\n")).toBe(false);
    expect(words.length).toBeGreaterThanOrEqual(2);
    expectClean(words);
  });
  test("a real half hour, 10:15 on Friday 6 November: finds what a person scanning the page would miss", () => {
    const { findings, words } = said("googleAnalytics.live", page("real"));
    print(`googleAnalytics.live · real`, words);
    const all = words.join("\n");
    // Conversions against this time of the week, where the even spread says 18.
    expect(all).toContain(NAMES.usualThisTime);
    expect(all).toContain("23.4");
    // More people but fewer looks: both are said.
    expect(findings.some((one) => one.id.startsWith("rowAbove:now:peopleInHalfHour")), all).toBe(true);
    expect(findings.some((one) => one.id.startsWith("rowBelow:views:views")), all).toBe(true);
    // The home page holds 12% of views now, against 6.3% last month.
    expect(findings.some((one) => one.id.startsWith("rowAbove:pages:viewsSharePercent")), all).toBe(true);
    expect(all).toContain("6.3");
    // The busiest minute against an average one.
    expect(findings.some((one) => one.id.startsWith("rowAbove:minutes:peopleInAMinute")), all).toBe(true);
    expect(words.length).toBeGreaterThanOrEqual(4);
    expectClean(words);
  });
  test("one person's repeated search is never a page above its share", () => {
    const search = { name: "Search results for: 'black handles'", people: 1, views: 40, times: 0 };
    const { findings, words } = said("googleAnalytics.live", { ...live.moments.real, pages: [search], usual: live.usual, names: NAMES });
    expect(findings.some((one) => one.id.includes("Search results")), words.join("\n")).toBe(false);
  });
  test("nobody here: nothing made up, and nothing broken", () => {
    const { findings, words } = said("googleAnalytics.live", page("nobody"));
    print(`googleAnalytics.live · nobody`, words);
    expect(findings.some((one) => /:(pages|minutes|kinds):/.test(one.id)), words.join("\n")).toBe(false);
    expectClean(words);
  });
  test("people and views are set against this time of the week once the hours are saved", () => {
    const { words } = said("googleAnalytics.live", { ...live.moments.real, usual: { ...live.usual, peopleThisTime: 41, viewsThisTime: 150 }, names: NAMES });
    const all = words.join("\n");
    expect(all).toContain("41");
    expect(all).toContain("150");
    expectClean(words);
  });
  test("conversions are set against this time of the week where the hours are kept, as an even spread reads too low by day", () => {
    const { words } = said("googleAnalytics.live", { ...live.moments.busy, usual: { ...live.usual, conversionsThisTime: 41.5 }, names: NAMES });
    expect(words.join("\n")).toContain(NAMES.usualThisTime);
    expect(words.join("\n")).toContain("41.5");
    expectClean(words);
    const { words: flat } = said("googleAnalytics.live", { ...live.moments.busy, usual: { ...live.usual, conversionsThisTime: null }, names: NAMES });
    expect(flat.join("\n")).not.toContain(NAMES.usualThisTime);
  });
  test("the Classifications furthest from their share of views last month are said, either way, and Not sorted never is", () => {
    // The real moment, 11:52 on 6 November: Cupboard Handles usually has a fifth of the views and has hardly any, on few views.
    const kinds = [{ kind: "shop", name: "Search and basket", views: 39, pages: 11 }, { kind: "handles", name: "Handles", views: 19, pages: 8 }, { kind: "cupboard", name: "Cupboard Handles", views: 5, pages: 3 }, { kind: "NOT_SORTED", name: "Not sorted yet", views: 6, pages: 4 }];
    const usualKinds = [
      { kind: "shop", name: "Search and basket", viewsShare: 0.2 }, { kind: "handles", name: "Handles", viewsShare: 0.126 }, { kind: "cupboard", name: "Cupboard Handles", viewsShare: 0.207 },
      // Usually a tenth of the views and none now: still news.
      { kind: "locks", name: "Locks", viewsShare: 0.1 }, { kind: "NOT_SORTED", name: "Not sorted yet", viewsShare: 0.3 },
    ];
    const { findings, words } = said("googleAnalytics.live", { ...live.moments.real, views: 123, kinds, usual: { ...live.usual, kinds: usualKinds }, names: NAMES });
    const ids = findings.map((one) => one.id).filter((id) => id.includes(":kinds:"));
    expect(ids, words.join("\n")).toEqual(["rowBelow:kinds:viewsSharePercent:Cupboard Handles", "rowAbove:kinds:viewsSharePercent:Search and basket"]);
    expect(findings.some((one) => one.id.includes("Not sorted")), words.join("\n")).toBe(false);
    expectClean(words);
    // Locks, when it's the furthest.
    const { findings: gone } = said("googleAnalytics.live", { ...live.moments.real, views: 123, kinds: [], usual: { ...live.usual, kinds: [{ kind: "locks", name: "Locks", viewsShare: 0.1 }] }, names: NAMES });
    expect(gone.some((one) => one.id === "rowBelow:kinds:viewsSharePercent:Locks")).toBe(true);
    // Too small either way: a group with few views now that would usually have few too.
    const { findings: small } = said("googleAnalytics.live", { ...live.moments.real, views: 30, kinds: [{ kind: "blog", name: "Blog", views: 4, pages: 1 }], usual: { ...live.usual, kinds: [{ kind: "blog", name: "Blog", viewsShare: 0.01 }] }, names: NAMES });
    expect(small.some((one) => one.id.includes(":kinds:"))).toBe(false);
  });
  test("a device far from its share of people is said with the Devices list on screen, by the reader's word for it", () => {
    const rows = [{ name: "Computer", device: "desktop", people: 19, views: 0, times: 0 }, { name: "Phone", device: "mobile", people: 7, views: 0, times: 0 }];
    const usual = { ...live.usual, devices: [{ device: "desktop", peopleShare: 0.45 }, { device: "mobile", peopleShare: 0.5 }] };
    const { findings, words } = said("googleAnalytics.live", { ...live.moments.real, list: "devices", rows, usual, names: NAMES });
    expect(findings.some((one) => one.id.startsWith("rowAbove:devices:peopleSharePercent:Computer") || one.id.startsWith("rowBelow:devices:peopleSharePercent:Phone")), words.join("\n")).toBe(true);
    expectClean(words);
  });
  test("nothing without a usual half hour: never a guess", () => {
    expect(said("googleAnalytics.live", { ...live.moments.busy, names: NAMES }).findings).toEqual([]);
  });
});
