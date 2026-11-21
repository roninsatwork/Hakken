import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import { readFixture } from "@/src/test/readFixture";
import { useFixedDay } from "@/src/test/realTime";
import type { Id } from "../_generated/dataModel";
import type { ServiceDaysAnswer, ServicesAnswer } from "../googleAnalyticsServiceReads";
import { AI_ASSISTANTS_CHANNEL } from "../utils/aiAssistants";
import { OTHER_GROUPS } from "../utils/landingFlow";
import { flowBoxes } from "../utils/landingFlowRoutes";
import { NOT_SORTED_KIND } from "../utils/pageKinds";
import { servicesEyeData } from "../utils/sees/analyticsServices";
import {
  allPagesEyeData, classificationName, classificationsForEye, pageMapForEye, pageMapRows, pageNameWith,
  viewsADayForEye,
} from "../utils/sees/eyeData/googleAnalyticsAllPages";
import {
  campaignMapForEye, campaignMapRows, campaignNamesFrom, campaignsByDayForEye, campaignsEyeData, noCampaigns,
  whatPeopleDidForEye,
} from "../utils/sees/eyeData/googleAnalyticsCampaigns";
import { channelEyeData, channelTitle, openingChannelList } from "../utils/sees/eyeData/googleAnalyticsChannel";
import {
  type ChannelSquares, type ChannelsList, channelSquaresForEye, channelStepsForEye, channelsByDayForEye,
  channelsEyeData, sellsOf, squareKindName,
} from "../utils/sees/eyeData/googleAnalyticsChannels";
import { conversionPagesEyeData, conversionsEyeData, eventEyeData, squareOfKey } from "../utils/sees/eyeData/googleAnalyticsConversions";
import { flowForEye, funnelEyeData, leftEachDayForEye } from "../utils/sees/eyeData/googleAnalyticsFunnel";
import { ANALYTICS_EYE_NAMES } from "../utils/sees/eyeData/googleAnalyticsOverview";
import { pageAnswerOf, pageEyeData } from "../utils/sees/eyeData/googleAnalyticsPage";
import { productsEyeData } from "../utils/sees/eyeData/googleAnalyticsProducts";
import {
  OPENING_SERVICES_VIEW, serviceDaysArgs, serviceGroupsFrom, serviceMonthLines, serviceMonthPicks, servicesBoxed,
  servicesDotsForEye, servicesEachStepForEye, servicesMapForEye,
} from "../utils/sees/eyeData/googleAnalyticsServices";
import { eyeWithParts, websiteForEye } from "../utils/sees/eyeData/googleAnalyticsShared";
import { type VisitsEyeReads, visitsEyeData } from "../utils/sees/eyeData/googleAnalyticsVisits";
import { findingWords } from "../utils/sees/findings";
import { pageDataFor } from "../utils/sees/pageData";
import { pageFindings } from "../utils/sees/pageFindings";
import { englishNames, englishWords } from "../utils/sees/serverWords";
import { groupNameInEnglish } from "../utils/serviceGroups";
import { GOOGLE_ANALYTICS_EYES, GOOGLE_ANALYTICS_SERVER_FINDINGS, englishEyeNames } from "./googleAnalytics";
import type { EyeAsk, EyeRun } from "./types";

/**
 * Google Analytics' screens, their eye figures built on the server by the same pure functions the screens call
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): on saved figures, More Handles' where a fixture holds
 * them, each screen's figures find its own findings, and each builder reads what its screen reads as it opens.
 */

describe("Visits and Products", () => {
  /**
   * Visits' and Products' eye figures as a chat app's question builds them (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
   * Option B): the pure functions the screens call, over More Handles' saved figures (3–4 November 2026), in English, give
   * each screen's own findings on every period the date menu offers.
   */

  const PERIODS = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
  type Period = (typeof PERIODS)[number];

  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  /** A screen's findings over the figures its eye reads, cut as the eye cuts them. */
  const findingsOf = (screen: string, data: unknown) => pageFindings(screen, pageDataFor(data, screen)).map(findingWords);

  type Group = { key: string; visits: number; visitsBefore: number | null; engaged: number };
  type VisitsPeriod = { visits: { visits: number; visitsBefore: number | null }; groups: Record<string, Group[]>; days: Array<[string, number, number, string?]>; kinds: Array<{ name: string; views: number; sorted: boolean }> };
  const visits = readFixture<Record<Period, VisitsPeriod>>("moreHandlesVisits");

  /** Visits' English words, as its builder takes them (`googleAnalyticsVisits.ts`). */
  function visitsWords() {
    const t = englishWords("googleAnalytics.visitors");
    const names = englishWords("googleAnalytics.visitors.names");
    return {
      names: { new: t("newVisits"), returning: t("returningVisits"), website: t("eyeWebsite") },
      visitorWord: (key: string) => (names.has(key) ? names(key) : null),
      days: { newName: t("line.new"), returningName: t("line.returning"), weekendName: t("line.eyeWeekend"), weekdayName: t("line.eyeWeekday") },
      notSortedName: t("kinds.notSorted"),
    };
  }

  /** The saved figures in the shape of Visits' reads. */
  function visitsReads(period: Period): VisitsEyeReads {
    const one = visits[period];
    const group = (key: string) => one.groups.visitorType.find((row) => row.key === key);
    return {
      visitors: { figures: {
        visits: one.visits.visits, visitsBefore: one.visits.visitsBefore,
        newVisits: group("new")?.visits ?? 0, newVisitsBefore: group("new")?.visitsBefore ?? null,
        returningVisits: group("returning")?.visits ?? 0, returningVisitsBefore: group("returning")?.visitsBefore ?? null,
        people: Math.round(one.visits.visits * 0.8),
      } },
      list: null,
      groups: Object.entries(one.groups).map(([list, rows]) => ({ list: list as never, rows })),
      days: { points: one.days.map(([day, fresh, back, lastDay]) => ({ day, ...(lastDay ? { lastDay } : {}), new: fresh, returning: back })) },
      kinds: { kinds: one.kinds.map((kind) => ({ kind: kind.sorted ? kind.name : NOT_SORTED_KIND, name: kind.sorted ? kind.name : null, views: kind.views, pages: 1 })) },
    };
  }

  describe("Visits' eye, built on the server, finds the screen's own findings", () => {
    for (const period of PERIODS) {
      test(period, () => {
        const said = findingsOf("googleAnalytics.visitors", visitsEyeData(visitsReads(period), visitsWords()));
        expect(said.length, said.join("\n")).toBeGreaterThan(0);
        expect(said.some((line) => line.startsWith("The whole website: visits")), said.join("\n")).toBe(true);
      });
    }

    test("the groups are named in the screen's English words", () => {
      const data = visitsEyeData(visitsReads("lastMonth"), visitsWords()) as { visitorGroups: Record<string, Array<{ name: string }>> };
      expect(data.visitorGroups.visitorType.map((row) => row.name)).toEqual(["New", "Returning"]);
    });

    test("nothing to show without the boxes' figures", () => {
      expect(visitsEyeData({ ...visitsReads("lastMonth"), visitors: { figures: null } }, visitsWords())).toBeNull();
    });
  });

  type EventFigure = { eventName: string; visits: number; visitsBefore: number | null };
  type Row = { name: string; itemsBought: number; itemsBoughtBefore?: number | null; itemsAdded: number; itemsLeft: number };
  type ProductsPeriod = { choice: { steps: string[]; sale: string | null }; events: EventFigure[]; neverBought: { count: number; countBefore: number | null; of: number }; table: Row[]; chart: { compared: boolean; more: Row[]; less: Row[]; left: Row[] } };
  const products = readFixture<Record<Period, ProductsPeriod>>("moreHandlesProducts");
  const chartRow = (row: Row) => ({ ...row, itemsBoughtBefore: row.itemsBoughtBefore ?? null });

  /** The saved figures in the shape of Products' reads, with its English words. */
  function productsOf(period: Period) {
    const one = products[period];
    const t = englishWords("googleAnalytics.products");
    const events = englishWords("googleAnalytics.events");
    return productsEyeData({
      products: { events: one.events, journey: { sale: one.events.find((event) => event.eventName === one.choice.sale) ?? null }, choice: one.choice, neverBought: one.neverBought },
      table: { rows: one.table },
      chart: { left: one.chart.left.map(chartRow), sold: [], more: one.chart.more.map(chartRow), less: one.chart.less.map(chartRow), compared: one.chart.compared },
    }, { eventName: (name) => (events.has(name) ? events(name) : name), neverBoughtName: t("neverBought"), othersName: t("table.eyeOthers") });
  }

  describe("Products' eye, built on the server, finds the screen's own findings", () => {
    for (const period of PERIODS) {
      test(period, () => {
        const said = findingsOf("googleAnalytics.products", productsOf(period));
        expect(said.length, said.join("\n")).toBeGreaterThan(0);
      });
    }

    test("the table and the chart are handed as their panels hand them, never money", () => {
      const data = productsOf("lastMonth") as Record<string, { picked?: boolean; view?: string }>;
      expect(data.productsTable.picked).toBe(true);
      expect(data.productsChart.view).toBe("products most often left in baskets");
      expect(JSON.stringify(data)).not.toMatch(/"(value|revenue|worth|currency)"/);
    });

    test("nothing to show without the page's read", () => {
      expect(productsEyeData({ products: null, table: null, chart: null }, { eventName: (name) => name, neverBoughtName: "", othersName: "" })).toBeNull();
    });
  });
});

describe("Conversions, the pages behind a square, and an event's own screen", () => {
  /**
   * Google Analytics' Conversions, the pages behind a square and an event's own screen, built on the server as their
   * screens build them (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): the same pure functions, on More
   * Handles' saved figures where a fixture holds them, else on reads written by hand in their shape.
   */

  const NAMES = en.googleAnalytics.eyeNames;
  const PERIODS = ["lastWeek", "lastMonth", "last3Months", "last12Months"] as const;
  const SITE = "site" as Id<"companyWebsites">;
  const SEEN = { says: [], steps: [] };

  /** More Handles' Organic Search purchases, by the page each visit landed on, in the read's shape. */
  const purchasePages = readFixture<Record<string, { name: string; visits: number; rows: Array<{ page: string; address: string; visits: number; did: number }> }>>("moreHandlesOrganicPurchasePages");
  const squareRead = (period: (typeof PERIODS)[number]) => {
    const one = purchasePages[period];
    return { collecting: false, everyDevice: false, cut: false, seen: SEEN, ...one, rows: one.rows.map((row) => ({ ...row, times: row.did })) };
  };

  const CONVERSIONS = {
    preparing: false, from: "2026-10-01", to: "2026-10-31", visits: 34000, visitsBefore: 36000,
    kinds: [{ eventName: "purchase", count: 1207, countBefore: 1258, value: 9_876_500 }, { eventName: "add_to_cart", count: 17469, countBefore: 18344, value: null }],
    shop: { purchases: 1207, purchasesBefore: 1258 }, fired: [], flow: null, before: null, seen: SEEN,
  };
  const EVENTS = {
    preparing: false, live: false, points: [], flags: {}, seen: SEEN,
    rows: [{ eventName: "purchase", counted: true, times: 1207, timesBefore: 1258, visits: 1205 }, { eventName: "scroll", counted: false, times: 17030, timesBefore: 9000, visits: 8000 }],
  };
  const EVENT = { eventName: "scroll", counted: false, figures: { times: 17030, timesBefore: 9000, people: 7000, visits: 8000, visitsBefore: 4000 }, seen: SEEN };

  /** A run over hand-made reads, keeping each read it was asked for. */
  function fakeRun(reads: Record<string, unknown>, events: Array<{ eventName: string; counted: boolean }> = [{ eventName: "purchase", counted: true }]) {
    const asked: Array<{ read: string; args: Record<string, unknown> }> = [];
    const run = async (read: string, args: Record<string, unknown>) => {
      asked.push({ read, args });
      if (read === "ga.connection") return { newestDay: "2026-11-20", shop: true, health: null, events };
      return read in reads ? reads[read] : null;
    };
    return { run, asked };
  }
  const ask = (key?: string): EyeAsk => ({ siteId: SITE, period: "lastMonth", ...(key ? { key } : {}) });

  describe("The pages behind a square find their own findings on More Handles' saved figures", () => {
    for (const period of PERIODS) {
      test(period, () => {
        const data = eyeWithParts(conversionPagesEyeData(squareRead(period), NAMES));
        const findings = pageFindings("googleAnalytics.conversionPages", pageDataFor(data, "googleAnalytics.conversionPages"));
        expect(findings.length).toBeGreaterThan(0);
        expect(findings.some((one) => one.kind === "holdsMost")).toBe(true);
      });
    }

    test("the builder reads the square its key names, with the names its findings use", async () => {
      const { run, asked } = fakeRun({ "ga.conversions.pages": squareRead("lastMonth") });
      const data = await GOOGLE_ANALYTICS_EYES["googleAnalytics.conversionPages"](run, ask("event=purchase&by=channel&key=Organic Search")) as { names: Record<string, string>; rows: unknown[] };
      expect(asked.find((one) => one.read === "ga.conversions.pages")?.args).toMatchObject({ eventName: "purchase", columns: "channel", key: "Organic Search", device: "" });
      expect(data.names.website).toBe(NAMES.website);
      expect(data.rows.length).toBeGreaterThan(0);
      expect(await GOOGLE_ANALYTICS_EYES["googleAnalytics.conversionPages"](run, ask())).toBeNull();
    });

    test("a square's key reads as the screen reads its address", () => {
      expect(squareOfKey("event=purchase&key=~fu")).toEqual({ eventName: "purchase", columns: "kind", key: "~fu" });
      expect(squareOfKey("?event=generate_lead&by=device&key=mobile")).toEqual({ eventName: "generate_lead", columns: "device", key: "mobile" });
      expect(squareOfKey("event=purchase&by=nonsense")?.columns).toBe("kind");
      expect(squareOfKey("by=channel&key=Direct")).toBeNull();
      expect(squareOfKey(undefined)).toBeNull();
    });
  });

  describe("Conversions hands its eye its read and the events table's, as its screen does", () => {
    test("its read with money taken off, and the table's read beside it as the panel hands it", () => {
      const data = conversionsEyeData(CONVERSIONS, EVENTS) as { kinds: Array<Record<string, unknown>>; eventsTable: unknown };
      expect(data.kinds.every((kind) => !("value" in kind))).toBe(true);
      expect(data.eventsTable).toBe(EVENTS);
      expect(conversionsEyeData(CONVERSIONS, null)).not.toHaveProperty("eventsTable");
      expect(conversionsEyeData(null, EVENTS)).toBeNull();
    });

    test("the builder reads both, for every device and the main country", async () => {
      const { run, asked } = fakeRun({ "ga.conversions.read": CONVERSIONS, "ga.conversions.events": EVENTS });
      const data = await GOOGLE_ANALYTICS_EYES["googleAnalytics.conversions"](run, ask()) as Record<string, unknown>;
      expect(data).toHaveProperty("eventsTable");
      expect(asked.filter((one) => one.read.startsWith("ga.conversions.")).map((one) => one.args)).toEqual([
        { siteId: SITE, period: "lastMonth", device: "" },
        { siteId: SITE, period: "lastMonth", device: "" },
      ]);
    });

    test("with something counted its findings are the Conversions map's, as the eye reads them; with nothing counted, its figures'", async () => {
      const found = [{ id: "rose:visits", kind: "rose" }];
      const counting = fakeRun({ "ga.conversions.findings": found });
      expect(await GOOGLE_ANALYTICS_SERVER_FINDINGS["googleAnalytics.conversions"](counting.run, ask())).toBe(found);
      expect(counting.asked.find((one) => one.read === "ga.conversions.findings")?.args).toEqual({ siteId: SITE, period: "lastMonth", device: "" });
      const nothing = fakeRun({ "ga.conversions.findings": found }, [{ eventName: "scroll", counted: false }]);
      expect(await GOOGLE_ANALYTICS_SERVER_FINDINGS["googleAnalytics.conversions"](nothing.run, ask())).toBeNull();
    });

    test("its figures, cut as the eye cuts them, still find something on a big move", () => {
      const data = conversionsEyeData({ ...CONVERSIONS, visitsBefore: 20000 }, EVENTS);
      expect(pageFindings("googleAnalytics.conversions", pageDataFor(data, "googleAnalytics.conversions")).length).toBeGreaterThan(0);
    });
  });

  describe("An event's own screen hands its eye as its screen does", () => {
    test("a counted event under `conversion`, any other as it is", () => {
      const counted = { ...EVENT, counted: true };
      expect(eventEyeData(counted)).toEqual({ conversion: counted });
      expect(eventEyeData(EVENT)).toBe(EVENT);
      expect(eventEyeData(null)).toBeNull();
    });

    test("the builder reads the event its key names; a counted one's findings are the Conversions map's", async () => {
      const found = [{ id: "rose:visits", kind: "rose" }];
      const plain = fakeRun({ "ga.event.read": EVENT, "ga.conversions.findings": found });
      expect(await GOOGLE_ANALYTICS_EYES["googleAnalytics.event"](plain.run, ask("scroll"))).toBe(EVENT);
      expect(plain.asked.find((one) => one.read === "ga.event.read")?.args).toMatchObject({ event: "scroll", device: "" });
      expect(await GOOGLE_ANALYTICS_SERVER_FINDINGS["googleAnalytics.event"](plain.run, ask("scroll"))).toBeNull();
      expect(await GOOGLE_ANALYTICS_EYES["googleAnalytics.event"](plain.run, ask())).toBeNull();
      const counted = fakeRun({ "ga.event.read": { ...EVENT, eventName: "purchase", counted: true }, "ga.conversions.findings": found });
      expect(await GOOGLE_ANALYTICS_EYES["googleAnalytics.event"](counted.run, ask("purchase"))).toHaveProperty("conversion");
      expect(await GOOGLE_ANALYTICS_SERVER_FINDINGS["googleAnalytics.event"](counted.run, ask("purchase"))).toBe(found);
    });

    test("an uncounted event's figures, cut as the eye cuts them, find its rise", () => {
      expect(pageFindings("googleAnalytics.event", pageDataFor(eyeWithParts(eventEyeData(EVENT)), "googleAnalytics.event")).length).toBeGreaterThan(0);
    });
  });
});

describe("Channels and a channel's own screen", () => {
  /**
   * Channels and a channel's own screen, built on the server by the functions the screens call
   * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): on More Handles' saved figures, put back into the shape
   * their reads answer in, the figures give the screens' own findings on every whole period the Dates menu offers.
   */

  const WHOLE = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
  type Period = (typeof WHOLE)[number];
  const NAMES = en.googleAnalytics.eyeNames;
  const SQUARES = en.googleAnalytics.channelsPage.squares;
  const STEPS = en.googleAnalytics.channelsPage.steps;

  type Figures = { visits: number; visitsBefore: number | null; purchases: number; purchasesBefore: number | null; conversions: number; conversionsBefore: number | null };
  type SquaresSeen = { columns: Array<{ key: string; name: string; visits: number }>; rows: Array<Figures & { name: string; cells: Array<Figures & { key: string }> }> };
  type ChannelsPeriod = {
    website: { visits: number; visitsBefore: number; engaged: number; engagedBefore: number; conversions: number; conversionsBefore: number; bought: number; boughtBefore: number };
    rows: Array<Figures & { name: string; bounceRate: number; engaged: number; addedToBasket: number; startedCheckout: number }>;
    gone: Array<{ key: string; visitsBefore: number; purchasesBefore: number; conversionsBefore: number }>;
    channelSquares: SquaresSeen;
    channelDevices: SquaresSeen;
    channelSteps: { tracks: { basket: boolean; checkout: boolean }; everywhere: Record<string, number>; channels: Array<Record<string, number> & { name: string }> };
  };
  const channels = readFixture<Record<Period, ChannelsPeriod>>("moreHandlesChannels");
  const organic = readFixture<Record<Period, { figures: unknown; kinds: unknown[]; movers: unknown[] }>>("moreHandlesOrganicSearch");

  /** The fixture's squares, as the eye read them, put back as `analyticsChannelSquares` answers. */
  function squaresRead(seen: SquaresSeen): ChannelSquares {
    const figures = (one: Figures) => ({ visits: one.visits, visitsBefore: one.visitsBefore, bought: one.purchases, boughtBefore: one.purchasesBefore, conversions: one.conversions, conversionsBefore: one.conversionsBefore });
    const none = { visits: 0, visitsBefore: 0, bought: 0, boughtBefore: 0, conversions: 0, conversionsBefore: 0 };
    return {
      everyDevice: false,
      columns: seen.columns.map((column) => ({ key: column.key, name: /^[A-Z_]+$/.test(column.key) ? null : column.name, visits: column.visits })),
      rows: seen.rows.map((row) => ({
        channel: row.name, ...figures(row),
        cells: seen.columns.map((column) => {
          const cell = row.cells.find((one) => one.key === column.key);
          return cell ? figures(cell) : none;
        }),
      })),
    };
  }

  /** Channels' reads for one period, from the fixture, in the shapes the reads answer in. */
  function channelsReads(period: Period) {
    const one = channels[period];
    const every: ChannelsList = {
      rows: one.rows.map((row) => ({
        label: row.name, visits: row.visits, visitsBefore: row.visitsBefore, purchases: row.purchases, purchasesBefore: row.purchasesBefore,
        conversions: row.conversions, conversionsBefore: row.conversionsBefore, bounceRate: row.bounceRate, engaged: row.engaged,
        basketVisits: row.addedToBasket, checkoutVisits: row.startedCheckout,
      })),
      gone: one.gone,
    };
    const { website } = one;
    const overview = { now: { visits: website.visits, purchases: website.bought, conversions: website.conversions }, before: { visits: website.visitsBefore, purchases: website.boughtBefore, conversions: website.conversionsBefore } };
    const site = { visits: website.visits, visitsBefore: website.visitsBefore, views: 0, viewsBefore: null, conversions: website.conversions, conversionsBefore: website.conversionsBefore, engaged: website.engaged, engagedBefore: website.engagedBefore };
    return { every, overview, website: site, squares: squaresRead(one.channelSquares), devices: squaresRead(one.channelDevices), steps: { collecting: false, ...one.channelSteps, channels: one.channelSteps.channels.map(({ name, ...steps }) => ({ channel: name, ...steps })) } };
  }

  /** Channels' eye, as the builder puts it together: the page's figures with its panels'. */
  function channelsEye(period: Period) {
    const reads = channelsReads(period);
    const sells = sellsOf(reads.overview);
    const data = channelsEyeData({ every: reads.every, overview: reads.overview, sells, website: reads.website }, { names: NAMES });
    const kindName = squareKindName({ otherGroups: SQUARES.otherGroups, notSorted: SQUARES.notSorted, noPage: SQUARES.noPage }, () => "–");
    return eyeWithParts(data, {
      channelSquares: channelSquaresForEye(reads.squares, kindName),
      channelDevices: channelSquaresForEye(reads.devices, (key) => en.googleAnalytics.filters.devices[key as "desktop"]),
      channelSteps: channelStepsForEye(reads.steps as never, { arrived: STEPS.arrived, stayed: STEPS.stayed, basket: STEPS.basket, checkout: STEPS.checkout, bought: STEPS.bought }),
    });
  }

  const findingsOf = (screen: string, data: unknown) => pageFindings(screen, pageDataFor(data, screen)).map(findingWords);

  describe("Channels' eye figures, built as the screen builds them, give its own findings (More Handles)", () => {
    for (const period of WHOLE) {
      test(period, () => {
        const words = findingsOf("googleAnalytics.channelsPage", channelsEye(period));
        expect(words.length, words.join("\n")).toBeGreaterThanOrEqual(4);
        expect(words.some((line) => line.startsWith(`${NAMES.website}: visits`)), words.join("\n")).toBe(true);
      });
    }

    test("October says what the screen's eye says", () => {
      const words = findingsOf("googleAnalytics.channelsPage", channelsEye("lastMonth"));
      expect(words).toContain("Paid Search: 9.1 bought for every 100 visits, against 3.4 for The whole website.");
      expect(words.join("\n")).toMatch(/Cross-network: visits lost 1917, against \d{3} for All the channels together\./);
    });

    test("a Classification column is named in the page's words, and its own name stands", () => {
      const seen = channelSquaresForEye(channelsReads("lastMonth").squares, squareKindName({ otherGroups: SQUARES.otherGroups, notSorted: SQUARES.notSorted, noPage: SQUARES.noPage }, () => "–"));
      const names = seen?.columns.map((column) => column.name) ?? [];
      expect(names).toContain("Cupboard Handles");
      expect(names).toContain(SQUARES.notSorted);
      expect(names).toContain(SQUARES.otherGroups);
    });

    test("a website with nothing bought counts its events, and a page with no list hands nothing", () => {
      expect(sellsOf({ now: { visits: 10, purchases: 0, conversions: 2 }, before: { visits: 9, purchases: 0, conversions: 1 } })).toBe(false);
      expect(sellsOf(undefined)).toBe(true);
      expect(channelsEyeData({ every: undefined, overview: undefined, sells: true, website: undefined }, { names: NAMES })).toBeUndefined();
      expect(eyeWithParts(undefined, { channelSquares: {} })).toBeNull();
    });
  });

  describe("Channels' visits by day are added up at the chart's step, by channel", () => {
    beforeEach(() => useFixedDay("2026-11-02"));
    afterEach(() => vi.useRealTimers());

    test("by the week, each channel's visits summed, with the events by their names", () => {
      const chart = {
        channels: ["Organic Search", "Direct"],
        events: [{ eventName: "purchase", counted: true, times: 12 }, { eventName: "brochure_request", counted: false, times: 3 }],
        points: [
          { day: "2026-10-05", visits: [10, 4] },
          { day: "2026-10-06", visits: [5, 1] },
          { day: "2026-10-12", visits: [7, 2] },
        ],
        before: null,
      };
      const seen = channelsByDayForEye(chart, "week", (name) => (name === "purchase" ? "Bought" : name));
      expect(seen?.days).toEqual([
        { day: "2026-10-05", lastDay: "2026-10-06", "Organic Search": 15, Direct: 5 },
        { day: "2026-10-12", "Organic Search": 7, Direct: 2 },
      ]);
      expect(seen?.events).toEqual([{ name: "Bought", times: 12, countsAsConversion: true }, { name: "brochure_request", times: 3, countsAsConversion: false }]);
      expect(seen && "daysBefore" in seen).toBe(false);
      expect(channelsByDayForEye(null, "day", (name) => name)).toBeUndefined();
    });
  });

  describe("A channel's own screen's eye figures give its own findings (More Handles' Organic Search)", () => {
    for (const period of WHOLE) {
      test(period, () => {
        const one = organic[period];
        const data = eyeWithParts(channelEyeData({ top: { figures: one.figures, kinds: one.kinds, movers: one.movers }, days: null }, { names: NAMES, title: channelTitle("Organic Search", en.googleAnalytics.channel.assistantsTitle) }));
        const words = findingsOf("googleAnalytics.channelPage", data);
        expect(words.length, words.join("\n")).toBeGreaterThan(0);
        expect(words.some((line) => line.startsWith("Organic Search: visits")), words.join("\n")).toBe(true);
      });
    }

    test("AI assistants go by the page's name for them, and their table opens on the assistants", () => {
      expect(channelTitle(AI_ASSISTANTS_CHANNEL, "The assistants")).toBe("The assistants");
      expect(openingChannelList(AI_ASSISTANTS_CHANNEL)).toBe("source");
      expect(channelTitle("Paid Search", "AI assistants")).toBe("Paid Search");
      expect(openingChannelList("Paid Search")).toBe("landing");
    });
  });
});

describe("Campaigns and Services", () => {
  /**
   * Campaigns' and Services' eye figures, built on the server as the screens build them
   * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B; `googleAnalyticsCampaigns.ts`): the same pure functions over saved
   * figures, More Handles' campaigns and Ronins' services as saved in November 2026, in English, give each screen's own findings on
   * every whole period the date menu offers.
   */

  const PERIODS = ["lastWeek", "lastMonth", "last3Months", "last12Months"] as const;
  type Period = (typeof PERIODS)[number];
  const NAMES = en.googleAnalytics.eyeNames as Record<string, string>;

  /** A screen's findings over its figures, as the eye cuts and reads them. */
  function findingsOf(screen: string, data: unknown): string[] {
    return pageFindings(screen, pageDataFor(data, screen)).map(findingWords);
  }

  beforeEach(() => useFixedDay("2026-11-21"));
  afterEach(() => vi.useRealTimers());

  // More Handles' saved campaigns, in the shape of the reads the builder runs: the list, Overview's figures and the squares'.
  type CampaignsSaved = {
    total: number; untagged: number | null;
    totals: { visits: number; visitsBefore: number | null; engaged: number; engagedBefore: number | null; bought: number; boughtBefore: number | null; conversions: number; conversionsBefore: number | null };
    website: { visits: number; visitsBefore: number; views: number; viewsBefore: number; conversions: number; conversionsBefore: number; engaged: number; engagedBefore: number; bought: number; boughtBefore: number };
    rows: Array<Record<string, unknown>>;
    events: string[];
    actions: Array<{ key: string; label: string; cameFrom: string; visits: number; times: number[]; visitsDid: Array<number | null> }>;
  };
  const CAMPAIGNS = readFixture<Record<Period, CampaignsSaved>>("moreHandlesCampaigns");
  const campaignNames = campaignNamesFrom(englishWords("googleAnalytics.campaigns"));
  const did = englishWords("googleAnalytics.campaigns.squares.did");
  const thing = (event: string) => (did.has(event) ? did(event) : event);

  function campaignsEye(period: Period) {
    const saved = CAMPAIGNS[period];
    const every = { rows: saved.rows, total: saved.total, untagged: saved.untagged, campaignTotals: saved.totals } as never;
    const { website } = saved;
    const overview = {
      now: { visits: website.visits, views: website.views, conversions: website.conversions, engaged: website.engaged, purchases: website.bought },
      before: { visits: website.visitsBefore, views: website.viewsBefore, conversions: website.conversionsBefore, engaged: website.engagedBefore, purchases: website.boughtBefore },
    };
    const data = campaignsEyeData({ every, overview, website: websiteForEye(overview), sells: true }, { names: NAMES, campaigns: campaignNames });
    return eyeWithParts(data, {
      campaignMap: campaignMapForEye(every, "visits", campaignMapRows(every, "visits"), campaignNames),
      whatPeopleDid: whatPeopleDidForEye({ live: false, events: saved.events, rows: saved.actions }, thing, campaignNames.name),
    });
  }

  describe("Campaigns' eye figures, built on the server from More Handles' saved campaigns", () => {
    test.each(PERIODS)("%s: every campaign visit together, and more beside it", (period) => {
      const words = findingsOf("googleAnalytics.campaigns", campaignsEye(period));
      expect(words.length, words.join("\n")).toBeGreaterThanOrEqual(3);
      expect(words.some((line) => line.startsWith(`${NAMES.tagged}: visits`)), words.join("\n")).toBe(true);
    });

    test("October says what the screen's eye says, in the screen's English names", () => {
      const words = findingsOf("googleAnalytics.campaigns", campaignsEye("lastMonth"));
      expect(words).toContain("Facebook ad with no name: 0 bought for every 100 visits, against 4.2 for All campaign visits.");
      expect(words).toContain("All campaign visits: visits down 6.6%, to 15732 from 16850 the span before; Bought: down 6.7%.");
    });

    test("what people did is weighed in visits, each thing named as the squares name it", () => {
      const part = whatPeopleDidForEye({ live: false, events: CAMPAIGNS.lastMonth.events, rows: CAMPAIGNS.lastMonth.actions }, thing, campaignNames.name);
      expect(part?.unit).toBe("visits");
      expect(part?.things).toEqual(["Added to basket", "Started checkout", "Bought", "Signed up for emails"]);
      expect((part?.campaigns.find((one) => one.name === "Performance Max > Zombies") as Record<string, unknown>)["Added to basket"]).toBe(715);
    });

    test("the chart's part counts the visits that left at once, now and the dates before", () => {
      const point = (day: string, visits: number, engaged: number) => ({ day, visits, engaged, conversions: 3, bought: 1 });
      const part = campaignsByDayForEye({ live: false, points: [point("2026-10-01", 40, 30)], before: { drawn: true, shift: 30, points: [point("2026-09-01", 50, 20)] } });
      expect(part?.days).toEqual([{ day: "2026-10-01", visits: 40, bought: 1, conversions: 3, leftStraightAway: 10 }]);
      expect(part?.daysBefore?.[0]?.leftStraightAway).toBe(30);
    });

    test("no campaign in these dates: the charts hand the eye nothing", () => {
      expect(noCampaigns({ campaignTotals: { visits: 0 } } as never)).toBe(true);
      expect(noCampaigns({ campaignTotals: { visits: 12 } } as never)).toBe(false);
    });
  });

  // Ronins' saved services, and the month chart's read for its busiest services, by week, written in the read's shape.
  const SERVICES = readFixture<Record<Period, ServicesAnswer>>("roninsServices");

  function monthRead(keys: readonly string[]): ServiceDaysAnswer {
    const points = [{ day: "2026-10-05" }, { day: "2026-10-06" }, { day: "2026-10-12" }];
    return {
      state: "ready", points, before: null, leftOut: 0,
      services: keys.map((key, at) => ({ key, now: points.map((_, day) => [10 + at + day, 20, at]), before: null, channels: null })),
      website: { now: points.map(() => [100, 300, 4]), before: null, channels: null },
    };
  }

  function servicesEye(period: Period) {
    const answer = SERVICES[period];
    const groups = serviceGroupsFrom(answer, OPENING_SERVICES_VIEW, (group, split) => groupNameInEnglish(group, split));
    const picks = serviceMonthPicks(answer, groups.services, { show: "visits", lines: "service", pickedServices: null, pickedChannels: null });
    const days = monthRead(picks.chosen.map((service) => service.key));
    const { main } = serviceMonthLines(days, picks, { show: "visits", against: "nothing", comparing: false }, { these: "", website: "", before: (name) => name }, { lines: [""], one: "", website: "" });
    return eyeWithParts(servicesEyeData(answer, NAMES, groups.names), {
      servicesEachStep: servicesEachStepForEye(days, "visits", picks.linesBy, main, "week"),
      servicesDots: servicesDotsForEye(groups, "visits", "events"),
      servicesMap: servicesMapForEye(servicesBoxed(groups, "visits").boxed, "visits", "visits", answer.hasBefore),
    });
  }

  describe("Services' eye figures, built on the server from Ronins' saved services", () => {
    test.each(PERIODS)("%s: all the services together, and more beside them", (period) => {
      const words = findingsOf("googleAnalytics.services", servicesEye(period));
      expect(words.length, words.join("\n")).toBeGreaterThanOrEqual(3);
      expect(words.some((line) => line.startsWith(`${NAMES.allServices}: visits`)), words.join("\n")).toBe(true);
    });

    test("the groups as the page opens carry the names the page's English gives them", () => {
      const answer = SERVICES.last12Months;
      const groups = serviceGroupsFrom(answer, OPENING_SERVICES_VIEW, (group, split) => groupNameInEnglish(group, split));
      const words = englishWords("googleAnalytics.services.groups");
      const x = groups.split.split.x;
      const across = x === 1 ? `${x} visit` : `${x.toLocaleString("en-GB")} visits`;
      expect(groups.names.rightHigh).toBe(words("name", { across: `${across} or more`, up: words("upMore", { rate: groups.split.split.y.toFixed(1), per: words("per.events") }) }));
      expect(servicesDotsForEye(groups, "visits", "events").services.every((service) => Object.values(groups.names).includes(service.group))).toBe(true);
    });

    test("the month chart opens on the busiest five services, each by its own figures, read without channels", () => {
      const answer = SERVICES.last12Months;
      const groups = serviceGroupsFrom(answer, OPENING_SERVICES_VIEW, (group, split) => groupNameInEnglish(group, split));
      const picks = serviceMonthPicks(answer, groups.services, { show: "visits", lines: "service", pickedServices: null, pickedChannels: null });
      expect(picks.chosen).toHaveLength(5);
      expect(picks.chosen.map((service) => service.now.visits)).toEqual([...picks.chosen.map((service) => service.now.visits)].sort((left, right) => right - left));
      expect(serviceDaysArgs(picks).channels).toBe(false);
      const days = monthRead(picks.chosen.map((service) => service.key));
      const { main } = serviceMonthLines(days, picks, { show: "visits", against: "nothing", comparing: false }, { these: "", website: "", before: (name) => name }, { lines: [""], one: "", website: "" });
      const part = servicesEachStepForEye(days, "visits", picks.linesBy, main, "week");
      // The week of 5 October adds its two days; the week of 12 October has one.
      expect(part?.steps).toEqual([
        { week: "2026-10-05", ...Object.fromEntries(picks.chosen.map((service, at) => [service.name, 10 + at + 11 + at])) },
        { week: "2026-10-12", ...Object.fromEntries(picks.chosen.map((service, at) => [service.name, 12 + at])) },
      ]);
    });

    test("the month chart hands the eye nothing until its figures are collected", () => {
      expect(servicesEachStepForEye({ ...monthRead([]), state: "collecting" }, "visits", "service", [], "week")).toBeUndefined();
      expect(servicesEachStepForEye(null, "visits", "service", [], "week")).toBeUndefined();
    });
  });
});

describe("Funnel and All pages", () => {
  /**
   * Funnel's and All pages' eye figures as a chat app's question builds them (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
   * Option B): the pure functions the screens call, over More Handles' saved figures (3–4 November 2026), in English, give
   * each screen's own findings on every period the date menu offers.
   */

  const PERIODS = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
  type Period = (typeof PERIODS)[number];
  type Rows = Array<Record<string, unknown>>;

  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  const NAMES = englishNames("googleAnalytics.eyeNames", ANALYTICS_EYE_NAMES);
  const flowWords = englishWords("googleAnalytics.chart.flow");
  const BOX_NAMES = { shop: flowWords("shop"), notSorted: flowWords("notSorted"), otherPages: flowWords("otherPages"), otherGroups: (count: number) => `${count} other groups`, pageNotKnown: flowWords("pageNotKnown") };

  /** A screen's findings over the figures its eye reads, cut as the eye cuts them. */
  const findingsOf = (screen: string, data: unknown) => pageFindings(screen, pageDataFor(data, screen)).map(findingWords);

  type FunnelFlow = { nodes: never[]; bands: never[]; onward: number; left: number; noPageVisits: number; busy: never };
  type FunnelPeriod = { website: Record<string, number>; landingLeft: number | null; rows: Rows; total: number; flow: FunnelFlow | null };
  const funnel = readFixture<Record<Period, FunnelPeriod>>("moreHandlesFunnel");

  /** A day's figures for the daily chart, in the chart read's shape. */
  const day = (date: string, visits: number, engaged: number, conversions: number) => ({ day: date, visits, engaged, views: visits * 3, conversions });

  describe("Funnel's eye, as the screen and a chat app build it", () => {
    for (const period of PERIODS) {
      test(`${period}: the whole website's visits, and the route chart's boxes`, () => {
        const one = funnel[period];
        const flow = one.flow ? { ...one.flow, held: true, ticked: [] } : null;
        const answer = { rows: one.rows, total: one.total, page: 1, pages: Math.ceil(one.total / 25) };
        const data = funnelEyeData({ answer, names: NAMES, website: one.website, left: one.landingLeft === null ? null : one.landingLeft / 100, flow }, BOX_NAMES);
        const eye = eyeWithParts(data, { flow: flow ? flowForEye(flowBoxes(flow, BOX_NAMES)) : undefined });
        const words = findingsOf("googleAnalytics.landing", eye);
        expect(words.length, words.join("\n")).toBeGreaterThan(0);
        expect(words.some((line) => line.startsWith(`${NAMES.website}: visits`)), words.join("\n")).toBe(true);
      });
    }

    test("nothing while the table's page isn't read", () => {
      expect(funnelEyeData({ answer: undefined, names: NAMES, website: undefined, left: null, flow: null }, BOX_NAMES)).toBeUndefined();
      expect(eyeWithParts(undefined, { leftEachDay: { show: "left", days: [] } })).toBeNull();
    });

    test("every landing page's leaving is handed as a percentage, once", () => {
      const data = funnelEyeData({ answer: { rows: [] }, names: NAMES, website: undefined, left: 0.6824, flow: null }, BOX_NAMES) as { landingAll: { leftPercent: number } };
      expect(data.landingAll.leftPercent).toBe(68.2);
    });

    test("People who left straight away each day: each day by its date, and the days before only where they're held", () => {
      const now = { points: [day("2026-09-01", 100, 60, 4), day("2026-09-02", 80, 50, 2)] };
      expect(leftEachDayForEye(now, { held: true, points: [day("2026-09-01", 90, 40, 3)] }, "left")).toEqual({
        show: "left",
        days: [{ day: "2026-09-01", leftStraightAway: 40, stayed: 60, conversions: 4 }, { day: "2026-09-02", leftStraightAway: 30, stayed: 50, conversions: 2 }],
        daysBefore: [{ day: "2026-09-01", leftStraightAway: 50, stayed: 40, conversions: 3 }],
      });
      expect(leftEachDayForEye(now, { held: false, points: [] }, "left")).not.toHaveProperty("daysBefore");
      expect(leftEachDayForEye(undefined, undefined, "left")).toBeUndefined();
    });
  });

  type AllPagesPeriod = { website: Record<string, number>; gained: Rows; lost: Rows; conversionsLost: Rows; bands: unknown; concentration: unknown; shop: unknown; classifications: Array<{ kind: string; name: string | null; views: number; viewsBefore?: number; pages: number }> };
  const allPages = readFixture<Record<Period, AllPagesPeriod>>("moreHandlesAllPages");
  const classification = englishWords("googleAnalytics.allPages.classification");
  const kindWords = { shop: classification("shop"), notSorted: classification("notSorted") };
  const pageName = pageNameWith(englishWords("googleAnalytics.allPages.map")("homePage"));

  describe("All pages' eye, as the screen and a chat app build it", () => {
    for (const period of PERIODS) {
      test(`${period}: the whole website's views, and the pages that moved most`, () => {
        const one = allPages[period];
        const ends = (rows: Rows) => ({ rows, bands: one.bands, concentration: one.concentration, shop: one.shop });
        // The table's page as it opens, by views: here the pages that moved most, as the fixture keeps no other.
        const table = [...one.gained, ...one.lost].sort((left, right) => Number(right.views) - Number(left.views)).slice(0, 25);
        const data = allPagesEyeData({
          answer: { rows: table, total: table.length, page: 1, pages: 1 },
          names: NAMES,
          website: one.website,
          gained: ends(one.gained), lost: ends(one.lost), conversionsLost: ends(one.conversionsLost),
          classifications: classificationsForEye(one.classifications, (kind) => classificationName(kind, kindWords)),
        });
        const map = { rows: table };
        const eye = eyeWithParts(data, {
          pageMap: pageMapForEye(map, pageMapRows(map.rows as never[], "views"), "views", pageName),
          viewsADay: viewsADayForEye(null, null, [], "views", pageName),
        });
        const words = findingsOf("googleAnalytics.allPages", eye);
        expect(words.length, words.join("\n")).toBeGreaterThan(0);
        expect(words.some((line) => line.startsWith(`${NAMES.website}: views`) || /counted differently/.test(line)), words.join("\n")).toBe(true);
      });
    }

    test("a Classification is named as the menu names it: the shop's own pages and pages not sorted in the page's words", () => {
      expect(classificationName({ kind: "SHOP_PAGES", name: null }, kindWords)).toBe("Search, basket and account");
      expect(classificationName({ kind: "NOT_SORTED", name: null }, kindWords)).toBe("Not sorted yet");
      expect(classificationName({ kind: "abc", name: "Blog" }, kindWords)).toBe("Blog");
    });

    test("the map holds only numbered pages with something to count, the home page by its name", () => {
      const rows = [
        { key: "~1", label: "https://www.morehandles.co.uk/", views: 10, viewsBefore: 8, visits: 4, visitsBefore: null, conversions: 1, conversionsBefore: 0 },
        { key: "~2", label: "https://www.morehandles.co.uk/handles.html", title: "Handles", views: 0, viewsBefore: 3, visits: 0, conversions: 0, conversionsBefore: 0 },
        { key: "(other)", label: "(other)", views: 50, viewsBefore: 40, visits: 9, conversions: 0, conversionsBefore: 0 },
      ];
      const kept = pageMapRows(rows, "views");
      expect(pageMapForEye({ rows }, kept, "views", pageName)).toEqual({
        count: "views",
        pages: [{ name: "Home page", page: "/", views: 10, viewsBefore: 8, visits: 4, visitsBefore: null, conversions: 1, conversionsBefore: 0 }],
      });
    });
  });

  describe("The builders read what the screens read, as they open", () => {
    test("Funnel: the landing table's first page with the shop's own pages left out, and the route chart's groups in English", async () => {
      const one = funnel.lastMonth;
      const asked: Array<[string, Record<string, unknown>]> = [];
      const flow = { ...one.flow, held: true, ticked: [], nodes: [...(one.flow?.nodes ?? []), { id: "g", column: 0, kind: OTHER_GROUPS, name: null, more: 12, address: null, visits: 5, left: 1, conversions: 0 }] };
      const reads: Record<string, unknown> = {
        "ga.connection": { newestDay: "2026-10-31", shop: true, health: null, events: [] },
        "ga.listPage": { rows: one.rows, total: one.total, page: 1, pages: 2, preparing: false },
        "ga.overview": { now: { visits: 35739, views: 152926, conversions: 1300, engaged: 22337, purchases: 1205 }, before: { visits: 37507, views: 167878, conversions: 1364, engaged: 24755, purchases: 1246 } },
        "ga.funnel.panels": { kinds: null, landing: { rows: [], count: 0, left: 0.682 } },
        "ga.funnel.flow": flow,
        "ga.chart": { points: [day("2026-10-01", 1200, 700, 40)] },
        "ga.chartBefore": { held: true, points: [day("2026-10-01", 1100, 690, 38)] },
      };
      const run: EyeRun = async (read, args) => {
        asked.push([read, args]);
        return reads[read] ?? null;
      };
      const eye = await GOOGLE_ANALYTICS_EYES["googleAnalytics.landing"](run, { siteId: "site" as never, period: "lastMonth" }) as { flow: { rows: Array<{ name: string }> }; leftEachDay: unknown; landingAll: unknown };
      expect(asked.find(([read]) => read === "ga.listPage")?.[1]).toMatchObject({ list: "landing", leaveOut: true, sort: "visits", direction: "desc", page: 1, rows: 25, device: "" });
      expect(asked.find(([read]) => read === "ga.funnel.flow")?.[1]).toEqual({ siteId: "site", period: "lastMonth", device: "", leaveOut: true });
      expect(eye.flow.rows.some((row) => row.name === "12 other groups")).toBe(true);
      expect(eye.leftEachDay).toMatchObject({ show: "left" });
      expect(eye.landingAll).toEqual({ leftPercent: 68.2 });
      expect(findingsOf("googleAnalytics.landing", eye).length).toBeGreaterThan(0);
    });

    test("Funnel: nothing without figures, or while the table is still being built", async () => {
      const run = (connection: unknown, list: unknown): EyeRun => async (read) => (read === "ga.connection" ? connection : read === "ga.listPage" ? list : null);
      const ask = { siteId: "site" as never, period: "lastMonth" as const };
      expect(await GOOGLE_ANALYTICS_EYES["googleAnalytics.landing"](run(null, null), ask)).toBeNull();
      expect(await GOOGLE_ANALYTICS_EYES["googleAnalytics.landing"](run({ newestDay: "2026-10-31", shop: false, health: null, events: [] }, { rows: [], preparing: true }), ask)).toBeNull();
    });

    test("All pages: the table opens by views, the ends of the whole list, the Classifications set against the dates before", async () => {
      const one = allPages.lastMonth;
      const asked: Array<[string, Record<string, unknown>]> = [];
      const run: EyeRun = async (read, args) => {
        asked.push([read, args]);
        if (read === "ga.connection") return { newestDay: "2026-10-31", shop: true, health: null, events: [] };
        if (read === "ga.overview") return { now: { visits: 35739, views: 152926, conversions: 1300, engaged: 22337, purchases: 1205 }, before: { visits: 37507, views: 167878, conversions: 1364, engaged: 24755, purchases: 1246 } };
        if (read === "ga.allPages.kindViews") return { waiting: false, sorted: true, kinds: one.classifications, views: 152926, unplaced: 0 };
        if (read === "ga.chart") return { points: [day("2026-10-01", 1200, 700, 40)] };
        if (read === "ga.listPage") {
          const rows = args.sort === "viewsChange" ? (args.direction === "desc" ? one.gained : one.lost) : args.sort === "conversionsChange" ? one.conversionsLost : one.gained;
          return { rows, total: rows.length, page: 1, pages: 1, preparing: false, bands: one.bands, concentration: one.concentration, shop: one.shop };
        }
        return null;
      };
      const eye = await GOOGLE_ANALYTICS_EYES["googleAnalytics.allPages"](run, { siteId: "site" as never, period: "lastMonth" }) as { classifications: Array<{ name: string }>; viewsADay: { show: string; pages: unknown[] }; pageMap: { count: string } };
      const lists = asked.filter(([read]) => read === "ga.listPage").map(([, args]) => args);
      expect(lists).toContainEqual(expect.objectContaining({ list: "page", move: "all", leaveOut: true, sort: "views", direction: "desc", page: 1, rows: 25 }));
      expect(lists).toContainEqual(expect.objectContaining({ sort: "views", rows: 40, leaveOut: true }));
      expect(asked.find(([read]) => read === "ga.allPages.kindViews")?.[1]).toMatchObject({ against: true, device: "" });
      expect(eye.classifications.some((kind) => kind.name === "Search, basket and account")).toBe(one.classifications.some((kind) => kind.kind === "SHOP_PAGES"));
      expect(eye.viewsADay).toMatchObject({ show: "views", pages: [] });
      expect(eye.pageMap.count).toBe("views");
      expect(findingsOf("googleAnalytics.allPages", eye).length).toBeGreaterThan(0);
    });
  });
});

describe("A page's own screen", () => {
  /**
   * A page's own Google Analytics screen, built on the server as the screen builds it
   * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): its own figures, the boxes' and the visits by channel,
   * from the reads in their own shapes, on More Handles' saved figures for /cupboard-handles-knobs/cupboard-handles.html
   * (`moreHandlesCupboardHandlesPage.json`, saved 3–4 November 2026). No dated rows: nothing here reads today's date.
   */

  const SCREEN = "googleAnalytics.page";
  const PERIODS = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
  type Period = (typeof PERIODS)[number];
  type Rows = Array<Record<string, unknown>>;
  type Saved = { views: number; viewsBefore: number | null; started: Record<string, number>; read: number | null; groupRead: number | null; sale: Record<string, number> | null; devices: Rows; ages: Rows; genders: Rows; channels: Array<{ name: string; visits: number; visitsBefore: number }> };
  const saved = readFixture<Record<Period, Saved>>("moreHandlesCupboardHandlesPage");

  /** The page's reads as the server's reader helpers answer them, from the figures saved for one period. */
  function readsOf(period: Period) {
    const one = saved[period];
    const main = { address: "https://www.morehandles.co.uk/cupboard-handles-knobs/cupboard-handles.html", row: { views: one.views }, viewsBefore: one.viewsBefore, live: false, points: [] };
    const story = {
      live: false, started: { ...one.started, conversions: 0, value: 0 }, read: one.read, groupRead: one.groupRead, group: "Category",
      sources: [], countries: [], weekdays: [], devices: one.devices, ages: { rows: one.ages }, genders: { rows: one.genders },
    };
    const told = { story, seen: { says: [], steps: [] } };
    const boxes = { product: null, sale: one.sale ? { eventName: "purchase", shop: true, ...one.sale } : null };
    const point = (pick: (row: Saved["channels"][number]) => number) => [{ day: "2026-10-01", lastDay: "2026-10-31", rows: one.channels.map((row) => ({ channel: row.name, visits: pick(row), counts: [] })) }];
    const explorer = { heldFrom: "2025-01-01", everyDevice: false, events: [], channels: one.channels.map((row) => row.name), from: null, to: null, now: point((row) => row.visits), before: point((row) => row.visitsBefore), year: [] };
    return { main, told, boxes, explorer };
  }

  describe("A page's own screen's figures, built as the screen builds them, find the screen's own findings", () => {
    for (const period of PERIODS) {
      test(period, () => {
        const { main, told, boxes, explorer } = readsOf(period);
        const data = pageEyeData({ answer: pageAnswerOf(main, told) as never, boxes: boxes as never, explorer }, englishEyeNames());
        const findings = pageFindings(SCREEN, pageDataFor(data, SCREEN)).map(findingWords);
        expect(findings.length, findings.join("\n")).toBeGreaterThan(0);
        expect(findings.some((line) => line.startsWith(`${en.googleAnalytics.eyeNames.thisPage}: views`)), findings.join("\n")).toBe(true);
      });
    }

    test("the boxes and the visits by channel go beside the page's own figures, as its panels hand them over", () => {
      const { main, told, boxes, explorer } = readsOf("lastMonth");
      const data = pageEyeData({ answer: pageAnswerOf(main, told) as never, boxes: boxes as never, explorer }, englishEyeNames()) as { boxes: unknown; visitorsByChannel: { channels: unknown[] }; names: Record<string, string> };
      expect(data.boxes).toMatchObject({ views: 3711, viewsBefore: 3839, visits: 162, boughtRate: 4 / 162 });
      expect(data.visitorsByChannel.channels[0]).toEqual({ name: "Organic Search", visits: 74, visitsBefore: 107 });
      expect(data.names.thisPage).toBe(en.googleAnalytics.eyeNames.thisPage);
    });

    test("a page with no views in these dates hands over no boxes, and either read finding nothing leaves nothing", () => {
      const { main, told, explorer } = readsOf("lastMonth");
      const quiet = pageEyeData({ answer: pageAnswerOf({ ...main, row: null }, told) as never, boxes: null, explorer }, englishEyeNames()) as Record<string, unknown>;
      expect(quiet).not.toHaveProperty("boxes");
      expect(pageEyeData({ answer: pageAnswerOf(null, told) as never, boxes: null, explorer }, englishEyeNames())).toBeNull();
    });
  });

  describe("The builder reads the page `ask.key` names, and only that page", () => {
    const ask = (key?: string): EyeAsk => ({ siteId: "site" as never, period: "lastMonth", ...(key !== undefined ? { key } : {}) });

    /** The reads as their helpers would answer, and every read asked for. */
    function runner(found: string | null) {
      const asked: Array<{ read: string; args: Record<string, unknown> }> = [];
      const reads = readsOf("lastMonth");
      const answers: Record<string, unknown> = { "ga.page.key": found, "ga.page.main": reads.main, "ga.page.story": reads.told, "ga.page.boxes": reads.boxes, "ga.page.channels": reads.explorer };
      // The connection, checked first as the screens' gate checks it, is left out of what the page's reads are asked.
      const run = async (read: string, args: Record<string, unknown>) => {
        if (read === "ga.connection") return { status: "CONNECTED", newestDay: "2026-11-20", shop: true, health: null, events: [] };
        asked.push({ read, args });
        return answers[read];
      };
      return { run, asked, reads };
    }

    test("an address is found by its number first, and every read takes that number, every device and the dates asked", async () => {
      const { run, asked, reads } = runner("~fu");
      const data = await GOOGLE_ANALYTICS_EYES[SCREEN](run, ask("/cupboard-handles-knobs/cupboard-handles.html"));
      expect(asked[0]).toEqual({ read: "ga.page.key", args: { siteId: "site", period: "lastMonth", device: "", page: "/cupboard-handles-knobs/cupboard-handles.html" } });
      expect(asked.slice(1).every((one) => one.args.page === "~fu" && one.args.device === "" && one.args.period === "lastMonth")).toBe(true);
      expect(data).toEqual(pageEyeData({ answer: pageAnswerOf(reads.main, reads.told) as never, boxes: reads.boxes as never, explorer: reads.explorer }, englishEyeNames()));
    });

    test("a page's number is read as it is", async () => {
      const { run, asked } = runner(null);
      expect(await GOOGLE_ANALYTICS_EYES[SCREEN](run, ask("~fu"))).not.toBeNull();
      expect(asked.map((one) => one.read)).not.toContain("ga.page.key");
    });

    test("nothing while the website has no figures to show, as the screens' gate shows none", async () => {
      const { run } = runner("~fu");
      const choosing = async (read: string, args: Record<string, unknown>) => (read === "ga.connection" ? { status: "CHOOSING", newestDay: "2026-11-20", events: [] } : run(read, args));
      expect(await GOOGLE_ANALYTICS_EYES[SCREEN](choosing, ask("~fu"))).toBeNull();
    });

    test("nothing without a page, or for one the website has no views of in these dates", async () => {
      expect(await GOOGLE_ANALYTICS_EYES[SCREEN](runner("~fu").run, ask())).toBeNull();
      expect(await GOOGLE_ANALYTICS_EYES[SCREEN](runner("~fu").run, ask("  "))).toBeNull();
      expect(await GOOGLE_ANALYTICS_EYES[SCREEN](runner(null).run, ask("/not-a-page.html"))).toBeNull();
    });
  });
});
