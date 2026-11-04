import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { UNKNOWN_SHARE as HEALTH_UNKNOWN_SHARE } from "../../googleAnalyticsHealth";
import { HEALTH_CHECKS } from "../../googleAnalyticsSchema";
import type { Seen } from "../hakkenSees";
import {
  UNKNOWN_SHARE,
  allPagesSees,
  conversionPagesSees,
  channelSees,
  channelsSees,
  chooseEventsSees,
  connectSees,
  connectionSees,
  conversionsSees,
  landingSees,
  overviewSees,
  pageSees,
  pageStoryFacts,
  pathOfAddress,
  HEALTH_CHECKS_WITH_STEPS,
  type ListRowFacts,
  type PageStoryFacts,
} from "./analytics";

/**
 * What Hakken sees on the Google Analytics screens (google-analytics-plan.md
 * §14, §15): each screen's box worked out from fixed figures — Ronins' own,
 * as the signed-off drawings read them — gives the expected codes and
 * numbers, and every code has its words in English and Italian.
 */

/** Every sentence and step a set of boxes offers, checked for words in both languages. */
function worded(screen: string, ...boxes: Seen[]) {
  for (const box of boxes) expectAnalyticsWords(screen, box);
}

const row = (key: string, figures: Partial<ListRowFacts> = {}): ListRowFacts => ({
  key, label: key, visits: 0, engagementRate: null, views: 0, conversions: 0, change: null, conversionsBefore: null, ...figures,
});

describe("2 · Overview", () => {
  const now = { visits: 826, engaged: 410, conversions: 12 };
  const before = { visits: 744, engaged: 376, conversions: 17 };
  const changedMost = [
    { kind: "channel" as const, key: "Direct", label: "Direct", conversions: -6, conversionsNow: 5 },
    { kind: "landing" as const, key: "~0", label: "https://ronins.co.uk/", conversions: -3, conversionsNow: 4 },
    { kind: "landing" as const, key: "~1", label: "https://ronins.co.uk/author/anthony/", conversions: 2, conversionsNow: 2 },
  ];
  const searchConsole = { clicks: 367, impressions: 264_403 };
  const SITE = "site_1";

  test("conversions fell while visits rose; the channel and the page behind it; Google rarely clicked", () => {
    const box = overviewSees({ siteId: SITE, now, before, counting: true, changedMost, searchConsole });
    expect(box).toEqual({
      says: [
        { code: "lead.down.up", a: (826 - 744) / 744, b: 17, c: 12 },
        { code: "cause.fellBoth", text: "Direct", a: 6, more: "/", b: 3 },
        { code: "googleRarely", a: 264_403, b: 367 / 264_403 },
      ],
      steps: [
        { code: "channel.fell", text: "Direct", a: 5, b: 11, link: "channels", to: { segment: "channels" } },
        { code: "page.fell", text: "/", a: 4, b: 7, link: "seePage", to: { segment: "all-pages/page", filters: { key: "~0" } } },
        { code: "push", link: "pagesToPush", to: { url: "/app/search-console/site_1/almost-there" } },
      ],
    });
    worded("overview", box);
  });

  test("every way conversions and visits can move, each cause, and the states before figures", () => {
    const boxes: Seen[] = [];
    for (const conversions of [10, 12, 20]) {
      for (const visits of [700, 744, 900]) {
        boxes.push(overviewSees({ siteId: SITE, now: { ...now, visits, conversions }, before: { ...before, conversions: 12 }, counting: true, changedMost, searchConsole: null }));
      }
    }
    expect(boxes.map((box) => box.says[0].code)).toEqual([
      "lead.down.down", "lead.down.same", "lead.down.up",
      "lead.same.down", "lead.same.same", "lead.same.up",
      "lead.up.down", "lead.up.same", "lead.up.up",
    ]);
    const rose = overviewSees({ siteId: SITE, now: { ...now, conversions: 20 }, before, counting: true, changedMost, searchConsole: { clicks: 900, impressions: 30_000 } });
    expect(rose.says.slice(1)).toEqual([{ code: "cause.rosePage", text: "/author/anthony/", a: 2 }, { code: "google", a: 30_000, b: 0.03 }]);
    expect(rose.steps).toEqual([{ code: "page.rose", text: "/author/anthony/", a: 2, b: 0, link: "seePage", to: { segment: "all-pages/page", filters: { key: "~1" } } }]);
    const channelOnly = overviewSees({ siteId: SITE, now, before, counting: true, changedMost: changedMost.slice(0, 1), searchConsole: null });
    expect(channelOnly.says[1]).toEqual({ code: "cause.fellChannel", text: "Direct", a: 6 });
    const pageOnly = overviewSees({ siteId: SITE, now, before, counting: true, changedMost: changedMost.slice(1, 2), searchConsole: null });
    expect(pageOnly.says[1]).toEqual({ code: "cause.fellPage", text: "/", a: 3 });
    const both = overviewSees({ siteId: SITE, now: { ...now, conversions: 20 }, before, counting: true, changedMost: [{ ...changedMost[0], conversions: 3, conversionsNow: 8 }, changedMost[2]], searchConsole: null });
    expect(both.says[1]).toMatchObject({ code: "cause.roseBoth" });
    expect(both.steps[0]).toMatchObject({ code: "channel.rose", a: 8, b: 5 });
    const roseChannel = overviewSees({ siteId: SITE, now: { ...now, conversions: 20 }, before, counting: true, changedMost: [{ ...changedMost[0], conversions: 3 }], searchConsole: null });
    expect(roseChannel.says[1]).toMatchObject({ code: "cause.roseChannel" });
    const notCounting = overviewSees({ siteId: SITE, now, before, counting: false, changedMost: [], searchConsole });
    expect(notCounting).toEqual({
      says: [{ code: "notCounting", a: 826 }, { code: "googleRarely", a: 264_403, b: 367 / 264_403 }],
      steps: [
        { code: "chooseWhatCounts", link: "chooseWhatCounts", to: { segment: "connection", filters: { change: "1" } } },
        { code: "push", link: "pagesToPush", to: { url: "/app/search-console/site_1/almost-there" } },
      ],
    });
    const first = overviewSees({ siteId: SITE, now, before: null, counting: true, changedMost: [], searchConsole: null });
    expect(first).toEqual({ says: [{ code: "made", a: 12 }], steps: [] });
    expect(overviewSees({ siteId: SITE, now: null, before: null, counting: true, changedMost: [], searchConsole: null })).toEqual({ says: [], steps: [] });
    worded("overview", ...boxes, rose, channelOnly, pageOnly, both, roseChannel, notCounting, first);
  });
});

describe("4 · Channels", () => {
  const channels = [
    row("Organic Search", { visits: 475, engagementRate: 0.526, conversions: 6, change: 0.044, conversionsBefore: 6 }),
    row("Direct", { visits: 226, engagementRate: 0.527, conversions: 5, change: 0.051, conversionsBefore: 11 }),
    row("AI assistants", { visits: 61, engagementRate: 0.279, conversions: 0, change: 5.1, conversionsBefore: 0 }),
    row("Referral", { visits: 39, engagementRate: 0.436, change: -0.025, conversionsBefore: 0 }),
    row("Unassigned", { visits: 12, engagementRate: 0, conversions: 1, change: -0.368, conversionsBefore: 0 }),
  ];

  test("Google's share of the conversions; direct converting less; AI assistants' visitors leaving", () => {
    const box = channelsSees(channels);
    expect(box).toEqual({
      says: [
        { code: "lead", text: "Organic Search", a: 475, b: 813, c: 6 },
        { code: "fell", text: "Direct", a: 5, b: 11 },
        { code: "assistants", a: 61, b: 0.279, c: 0 },
      ],
      steps: [
        { code: "whyFell", text: "Direct", a: 5, b: 11, link: "landingPages", to: { segment: "funnel" } },
        { code: "assistantsStay", a: 61, b: 0.279, link: "aiAssistants", to: { segment: "channels/channel", filters: { key: "AI assistants" } } },
        { code: "unassigned", a: 12, link: "trackingHealth", to: { segment: "tracking-health" } },
      ],
    });
    worded("channels", box);
  });

  test("conversions up, assistants converting, nothing converted, no visits", () => {
    const rising = channelsSees([row("Direct", { visits: 100, conversions: 4, conversionsBefore: 1 }), row("AI assistants", { visits: 20, engagementRate: 0.6, conversions: 2 })]);
    expect(rising.says).toEqual([
      { code: "lead", text: "Direct", a: 100, b: 120, c: 4 },
      { code: "rose", text: "Direct", a: 4, b: 1 },
      { code: "assistantsConverted", a: 20, b: 0.6, c: 2 },
    ]);
    expect(rising.steps).toEqual([]);
    // Nothing converted: the channel bringing most visits leads.
    const unconverted = channelsSees([row("Referral", { visits: 20 }), row("Direct", { visits: 100 })]);
    expect(unconverted.says).toEqual([{ code: "leadVisits", text: "Direct", a: 100, b: 120 }]);
    expect(channelsSees([])).toEqual({ says: [{ code: "none" }], steps: [] });
    worded("channels", rising, unconverted, channelsSees([]));
  });
});

describe("5 · A channel's own screen", () => {
  const figures = { visits: 61, visitsBefore: 10, engaged: 17, conversions: 0, conversionsBefore: 0, siteVisits: 826, siteEngaged: 410 };
  const assistants = [
    row("ChatGPT", { visits: 57, engagementRate: 0.298, change: (57 - 7) / 7, conversionsBefore: 0 }),
    row("Perplexity", { visits: 4, engagementRate: 0, change: 3, conversionsBefore: 0 }),
  ];

  test("ChatGPT up from 7; its visitors leave sooner than the website's; none converted", () => {
    const box = channelSees("AI assistants", assistants, figures, "s1");
    expect(box).toEqual({
      says: [
        { code: "top.up", text: "ChatGPT", a: 57, b: 7 },
        { code: "leaveSooner", a: 17 / 61, b: 410 / 826 },
        { code: "noneConverted" },
      ],
      steps: [
        { code: "nextStep", text: "ChatGPT", link: "landingPages", to: { segment: "funnel" } },
        { code: "checkAnswers", text: "ChatGPT", link: "aiAnswers", to: { url: "/app/sites/s1/ai/answers" } },
      ],
    });
    worded("channel", box);
  });

  test("a source down, the same, new or unknown before; visitors that stay and convert; nothing from it", () => {
    const staying = { ...figures, engaged: 50, conversions: 3 };
    const boxes = [
      channelSees("Referral", [row("clutch.co", { visits: 30, change: -0.25, conversionsBefore: 0 })], staying, "s1"),
      channelSees("Referral", [row("clutch.co", { visits: 30, change: 0, conversionsBefore: 0 })], staying, "s1"),
      channelSees("Referral", [row("clutch.co", { visits: 30, change: null, conversionsBefore: 0 })], staying, "s1"),
      channelSees("Referral", [row("clutch.co", { visits: 30, change: null, conversionsBefore: null })], staying, "s1"),
    ];
    expect(boxes.map((box) => box.says[0])).toEqual([
      { code: "top.down", text: "clutch.co", a: 30, b: 40 },
      { code: "top.same", text: "clutch.co", a: 30, b: 30 },
      { code: "topNew", text: "clutch.co", a: 30 },
      { code: "topOnly", text: "clutch.co", a: 30 },
    ]);
    expect(boxes[0].says.slice(1)).toEqual([{ code: "stayLonger", a: 50 / 61, b: 410 / 826 }, { code: "converted", a: 3 }]);
    expect(boxes[0].steps).toEqual([]);
    expect(channelSees("Email", [], null, "s1")).toEqual({ says: [{ code: "none", text: "Email" }], steps: [] });
    worded("channel", ...boxes, channelSees("Email", [], null, "s1"));
  });
});

describe("6 · Landing pages, and 17 · a device asked of Google", () => {
  const pages = [
    row("~0", { label: "https://ronins.co.uk/", visits: 141, engagementRate: 0.61, conversions: 4 }),
    row("~1", { label: "https://ronins.co.uk/ai-agency/", visits: 84, engagementRate: 0.69, conversions: 3 }),
    row("(not set)", { visits: 86, engagementRate: 0.035 }),
    row("~2", { label: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", visits: 188, engagementRate: 0.431 }),
    row("~3", { label: "https://ronins.co.uk/venture-studio/", visits: 12, conversions: 1 }),
  ];

  test("the guide bringing most visits and none converting; the pages bringing the most conversions; the visits with no landing page", () => {
    const box = landingSees(pages, { groups: false, device: "", everyDevice: null });
    expect(box).toEqual({
      says: [
        { code: "leakTop", text: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", a: 188 },
        { code: "topConverters", text: "https://ronins.co.uk/", more: "https://ronins.co.uk/ai-agency/", a: 7, b: 8 },
        { code: "notSet", a: 86, b: 86 / 511 },
      ],
      steps: [
        { code: "nextStep", text: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~2" } } },
        { code: "fixNotSet", a: 86, link: "trackingHealth", to: { segment: "tracking-health" } },
      ],
    });
    worded("landing", box);
  });

  test("a leak that is not the busiest, one page converting, nothing converted, nothing at all", () => {
    const leak = landingSees([row("~0", { visits: 300, conversions: 2 }), row("~1", { visits: 60 })], { groups: false, device: "", everyDevice: null });
    expect(leak.says).toEqual([{ code: "leak", text: "~1", a: 60 }, { code: "topConverter", text: "~0", a: 2, b: 2 }]);
    const quiet = landingSees([row("~0", { visits: 20 })], { groups: false, device: "", everyDevice: null });
    expect(quiet).toEqual({ says: [{ code: "noConversions", a: 20 }], steps: [] });
    expect(landingSees([], { groups: false, device: "", everyDevice: null }).says).toEqual([{ code: "none" }]);
    worded("landing", leak, quiet, landingSees([], { groups: false, device: "", everyDevice: null }));
  });

  test("page groups: the group bringing the most conversions, and the pages in none", () => {
    const groups = [
      row("service", { label: "Service", visits: 172, conversions: 5, members: 26 }),
      row("NOT_SORTED", { label: "NOT_SORTED", visits: 91, members: 6 }),
    ];
    const box = landingSees(groups, { groups: true, device: "", everyDevice: null });
    expect(box).toEqual({
      says: [{ code: "groupLead", text: "Service", a: 5, b: 5 }, { code: "unsorted", a: 6, b: 91 }],
      steps: [{ code: "seeUnsorted", a: 6, link: "unsortedPages", to: { segment: "funnel", filters: { view: "pages", group: "NOT_SORTED" } } }],
    });
    const none = landingSees([row("service", { label: "Service", visits: 3, members: 2 })], { groups: true, device: "", everyDevice: null });
    expect(none).toEqual({ says: [{ code: "groupsNone", a: 1 }], steps: [] });
    worded("landing", box, none);
  });

  test("phones: their share, the page their conversions came from, and the page they leave soonest", () => {
    const every = [row("~2", { visits: 188, engagementRate: 0.43 }), row("~0", { visits: 141, engagementRate: 0.61 }), row("(not set)", { visits: 497 })];
    const phones = [
      row("~2", { visits: 31, engagementRate: 0.32 }),
      row("~0", { visits: 25, engagementRate: 0.6, conversions: 2 }),
      row("(not set)", { visits: 62 }),
    ];
    const box = landingSees(phones, { groups: false, device: "mobile", everyDevice: every });
    expect(box).toEqual({
      says: [
        { code: "device.mobile", a: 118, b: 826, c: 2 },
        { code: "allFrom", text: "~0", a: 2 },
        { code: "engagesLess", text: "~2", a: 31, b: 0.32, c: 0.43 },
      ],
      steps: [{ code: "readOn.mobile", text: "~2", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~2" } } }],
    });
    const desktop = landingSees([...phones, row("~3", { visits: 5, conversions: 1 })], { groups: false, device: "desktop", everyDevice: every });
    expect(desktop.says[1]).toEqual({ code: "mostFrom", text: "~0", a: 2 });
    const tablet = landingSees(phones, { groups: false, device: "tablet", everyDevice: every });
    worded("landing", box, desktop, tablet);
    expectAnalyticsWords("landing", { says: [], steps: ["desktop", "tablet"].map((device) => ({ code: `readOn.${device}`, text: "/", link: "seePage", to: { segment: "" } })) });
  });
});

describe("8 · All pages", () => {
  // all-pages-rethink-plan.md AP6: never money; how pages moved, the biggest drop, the pages nobody visited.
  const pages = [
    row("~0", { label: "https://ronins.co.uk/", views: 508, viewsBefore: 400, conversions: 2 }),
    row("~1", { label: "https://ronins.co.uk/ai-agency/", views: 318, viewsBefore: 400, conversions: 4 }),
    row("~2", { label: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", views: 417, viewsBefore: 416 }),
    row("https://ronins.co.uk/web-design-surrey/", { label: "https://ronins.co.uk/web-design-surrey/", views: 0, viewsBefore: 0 }),
  ];
  const moves = { counts: { all: 4, gains: 1, dropped: 1, static: 1, none: 1 }, quiet: ["https://ronins.co.uk/web-design-surrey/"] };

  test("pages viewed and moved; the biggest drop and what it still made; why, the next step, and the pages nobody visited", () => {
    const box = allPagesSees(pages, true, moves);
    expect(box).toEqual({
      says: [
        { code: "viewedOf", a: 3, b: 4, c: 1 },
        { code: "moved", a: 1, b: 1, c: 1 },
        { code: "droppedMostMade", text: "https://ronins.co.uk/ai-agency/", a: 82, b: 4, c: 6 },
      ],
      steps: [
        { code: "whyDropped", text: "https://ronins.co.uk/ai-agency/", a: 82, link: "seePage", to: { segment: "all-pages/page", filters: { key: "~1" } } },
        { code: "copy", text: "https://ronins.co.uk/ai-agency/", more: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~2" } } },
        { code: "noVisitsOne", text: "https://ronins.co.uk/web-design-surrey/", link: "noVisits", to: { segment: "all-pages", filters: { move: "none" } } },
      ],
    });
    // No drop: the biggest gain; every page viewed; two pages nobody visited named together.
    const rising = allPagesSees(pages.slice(0, 1), true, { counts: { all: 1, gains: 1, dropped: 0, static: 0, none: 0 }, quiet: [] });
    expect(rising.says).toEqual([{ code: "viewedAll", a: 1, b: 1, c: 0 }, { code: "moved", a: 1, b: 0, c: 0 }, { code: "gainedMost", text: "https://ronins.co.uk/", a: 108 }]);
    const two = allPagesSees(pages, true, { ...moves, quiet: ["https://ronins.co.uk/a/", "https://ronins.co.uk/b/"] });
    expect(two.steps.at(-1)).toMatchObject({ code: "noVisitsTwo", text: "https://ronins.co.uk/a/", more: "https://ronins.co.uk/b/" });
    // Nothing counts as a conversion: choosing what counts comes first, and the drop names no conversions.
    const notCounting = allPagesSees(pages, false, moves);
    expect(notCounting.steps[0].code).toBe("chooseWhatCounts");
    expect(notCounting.says[2].code).toBe("droppedMost");
    // Without the list read whole, the rows are counted as they are.
    expect(allPagesSees(pages, true).says[0]).toEqual({ code: "viewedOf", a: 3, b: 4, c: 1 });
    worded("allPages", box, rising, two, notCounting, allPagesSees([], true));
  });
});

describe("21 · A page's own screen, redone (page-screen-redo-plan-2026-11-03.md, item 13)", () => {
  const address = "https://www.morehandles.co.uk/waltz-round-cupboard-knob-on-stepped-rose.html";
  // More Handles' Waltz Round Knob in October 2026, as its redone screen reads it.
  const knob: PageStoryFacts = {
    started: { visits: 919, visitsBefore: 904, websiteVisits: 35_739 },
    biggest: { name: "Google", channel: "Cross-network", visits: 777, conversions: 64 },
    phones: { share: 0.65, websiteShare: 0.393 },
    product: { itemsAdded: 3957, itemsBought: 1034, itemsBoughtBefore: 972 },
    sale: null,
    nearest: null,
  };

  test("a product's page: the visits that started on it, its items added and bought against before, the source that sent most; then a product many add and few buy", () => {
    const box = pageSees("~fu", address, true, knob);
    expect(box).toEqual({
      says: [
        // Under a twentieth more than before: said without a change.
        { code: "started", a: 919, b: 919 / 35_739 },
        { code: "itemsMore", a: 3957, b: 1034, c: (1034 - 972) / 972 },
        { code: "biggest", text: "Google", a: 777, b: 64 },
      ],
      steps: [],
    });
    // Phones far from the website's share are said once a sentence is free; a product many add and few buy is checked on its page.
    const stuck = pageSees("~fu", address, true, { ...knob, started: { ...knob.started!, visitsBefore: 700 }, biggest: null, product: { itemsAdded: 400, itemsBought: 12, itemsBoughtBefore: null } });
    expect(stuck.says).toEqual([
      { code: "startedMore", a: 919, b: 919 / 35_739, c: (919 - 700) / 700 },
      { code: "items", a: 400, b: 12 },
      { code: "phones", a: 0.65, b: 0.393 },
    ]);
    expect(stuck.steps).toEqual([{ code: "checkProductPage", link: "openPage", to: { url: address } }]);
    const unsold = pageSees("~fu", address, true, { ...knob, product: { itemsAdded: 30, itemsBought: 0, itemsBoughtBefore: 4 } });
    expect(unsold.says[1]).toEqual({ code: "itemsNone", a: 30 });
    worded("page", box, stuck, unsold);
  });

  test("any other page: its visitors who bought against the whole website, the biggest source that never converted, a page of its group that converts better", () => {
    const article: PageStoryFacts = {
      started: { visits: 593, visitsBefore: 700, websiteVisits: 4494 },
      biggest: { name: "Google", channel: "Organic Search", visits: 500, conversions: 0 },
      phones: { share: 0.42, websiteShare: 0.4 },
      product: null,
      sale: { eventName: "generate_lead", shop: false, visits: 2, startedVisits: 593, websiteShare: 0.034 },
      nearest: { page: "~31", address: "https://ronins.co.uk/web-design/", visits: 35, conversions: 3 },
    };
    const box = pageSees("~9", "https://ronins.co.uk/hub/kapferer/", true, article);
    expect(box.says).toEqual([
      { code: "startedFewer", a: 593, b: 593 / 4494, c: (700 - 593) / 700 },
      { code: "converted", text: "generate_lead", a: 2 / 593, b: 0.034 },
      { code: "biggestNone", text: "Google", a: 500 },
    ]);
    expect(box.steps).toEqual([
      { code: "nextStep", link: "openPage", to: { url: "https://ronins.co.uk/hub/kapferer/" } },
      { code: "seeChannel", text: "Google", link: "channel", to: { segment: "channels/channel", filters: { key: "Organic Search" } } },
      { code: "seeNearest", text: "https://ronins.co.uk/web-design/", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~31" } } },
    ]);
    // A shop's page, none bought; typed in the biggest; the page that converts better said once a sentence is free.
    const shop = pageSees("~9", "https://shop.test/blog/latches/", true, {
      ...article, started: { visits: 120, visitsBefore: null, websiteVisits: 4494 }, biggest: { name: "(direct)", channel: "Direct", visits: 60, conversions: 2 },
      sale: { eventName: "purchase", shop: true, visits: 0, startedVisits: 120, websiteShare: 0.034 },
    });
    expect(shop.says).toEqual([
      { code: "started", a: 120, b: 120 / 4494 },
      { code: "boughtNone", a: 0, b: 0.034 },
      { code: "biggestTyped", text: "(direct)", a: 60, b: 2 },
    ]);
    expect(shop.steps.map((step) => step.code)).toEqual(["nextStepShop", "seeNearest"]);
    // Too few visits started here to weigh its share; a quiet page wants no next step.
    const quiet = pageSees("~9", "https://shop.test/a/", true, { ...article, started: { visits: 12, visitsBefore: 12, websiteVisits: 4494 }, biggest: null, sale: { ...article.sale!, startedVisits: 12 }, nearest: null });
    expect(quiet).toEqual({ says: [{ code: "started", a: 12, b: 12 / 4494 }], steps: [] });
    // Not viewed in these dates.
    expect(pageSees("~9", "https://shop.test/a/", false, null)).toEqual({ says: [{ code: "none" }], steps: [] });
    worded("page", box, shop, quiet, pageSees("~9", "", false, null));
  });

  test("its facts from the page's own read and its boxes: a source's channels added up, typed in by its own word, the boxes' items or sale", () => {
    const story = {
      started: { visits: 919, visitsBefore: 904, websiteVisits: 35_739, conversions: 1459, value: 0, visitsPerConversion: null, websiteVisitsPerConversion: null, countedPages: null, websiteCountedPages: null, fewVisits: false },
      sources: [
        { key: "a", channel: "Cross-network", source: "google", name: "Google", visits: 497, pages: 4, time: null, read: 0.5, back: 0.16, conversions: 40, value: 0, fewVisits: false },
        { key: "b", channel: "Paid Shopping", source: "google", name: "Google", visits: 280, pages: 4, time: null, read: 0.49, back: 0.22, conversions: 24, value: 0, fewVisits: false },
        { key: "c", channel: "Unassigned", source: "(not set)", name: null, visits: 300, pages: 9, time: null, read: 1, back: 0.13, conversions: 0, value: 0, fewVisits: false },
        { key: "d", channel: "Direct", source: "(direct)", name: null, visits: 30, pages: 3, time: null, read: 0.27, back: 0.43, conversions: 2, value: 0, fewVisits: false },
      ],
      devices: [{ device: "mobile", share: 0.65, websiteShare: 0.393 }, { device: "desktop", share: 0.32, websiteShare: 0.577 }],
      league: [{ key: "~fu", address, visits: 919, conversions: 1459, isThis: true }, { key: "~2", address: "https://www.morehandles.co.uk/b/", visits: 20, conversions: 1, isThis: false }],
    } as unknown as Parameters<typeof pageStoryFacts>[0];
    const boxes = { product: { products: 23, itemsAdded: 3957, itemsBought: 1034, itemsAddedBefore: 3765, itemsBoughtBefore: 972, websiteItemsBought: 6913 }, sale: { eventName: "purchase", shop: true, visits: 64, startedVisits: 918, websiteVisits: 35_843, websiteEventVisits: 1205 } };
    expect(pageStoryFacts(story, boxes)).toEqual(knob);
    // Without its boxes, as the page's own read works it out, nothing of items or the sale; any other page's sale.
    expect(pageStoryFacts(story, null)).toMatchObject({ product: null, sale: null });
    expect(pageStoryFacts(story, { product: null, sale: boxes.sale }).sale).toEqual({ eventName: "purchase", shop: true, visits: 64, startedVisits: 918, websiteShare: 1205 / 35_843 });
  });
});

describe("9 · Conversions and 16 · Nothing counted yet", () => {
  const kinds = [
    { eventName: "form_submission", count: 12, countBefore: 17 },
    { eventName: "live_chat_event", count: 0, countBefore: 0 },
    { eventName: "phone_number_click", count: 0, countBefore: 0 },
    { eventName: "email_link_click", count: 0, countBefore: 0 },
  ];

  test("all were form submissions; chat, phone and email never happen; the share converting fell", () => {
    const box = conversionsSees({ from: "2026-09-10", visits: 826, visitsBefore: 744, kinds, fired: [] });
    expect(box).toEqual({
      says: [
        { code: "allOne", text: "form_submission", a: 12 },
        { code: "silent", text: "live_chat_event,phone_number_click,email_link_click", a: 3 },
        { code: "rateDown", a: 17 / 744, b: 12 / 826 },
      ],
      steps: [{ code: "trySilent", text: "live_chat_event,phone_number_click,email_link_click", a: 3, link: "trackingHealth", to: { segment: "tracking-health" } }],
    });
    worded("conversions", box);
  });

  test("several kinds, the share rising, none happened; never asks what one is worth", () => {
    const several = conversionsSees({
      from: "2026-09-10", visits: 500, visitsBefore: 1000,
      kinds: [{ eventName: "generate_lead", count: 5, countBefore: 2 }, { eventName: "click_tel", count: 2, countBefore: 1 }],
      fired: [],
    });
    expect(several).toEqual({
      says: [{ code: "topKind", text: "generate_lead", a: 5, b: 7 }, { code: "rateUp", a: 3 / 1000, b: 7 / 500 }],
      steps: [],
    });
    const none = conversionsSees({ from: "2026-09-10", visits: 500, visitsBefore: null, kinds: kinds.map((kind) => ({ ...kind, count: 0 })), fired: [] });
    expect(none.says).toEqual([{ code: "noneHappened", a: 4 }]);
    expect(conversionsSees({ from: null, visits: 0, visitsBefore: null, kinds: [], fired: [] })).toEqual({ says: [], steps: [] });
    worded("conversions", several, none);
  });

  test("with the flow and the actions (ga-conversions-visitors-plan.md CV6): where they came from, the biggest channel converting nothing, the form not counted", () => {
    // ronins.co.uk's last 30 days: three Contacts, all typed in to the home page; search converting nothing; forms not counted.
    const contact = [{ eventName: "contact", count: 3, countBefore: 3 }, ...kinds.slice(1)];
    const flow = {
      visits: 249,
      channels: [{ key: "Organic Search", visits: 192, conversions: 0 }, { key: "Direct", visits: 40, conversions: 3 }, { key: "~more", visits: 17, conversions: 0 }],
      kinds: [{ kind: "brand", visits: 63, conversions: 3 }, { kind: "service", visits: 79, conversions: 0 }],
    };
    const before = { siteRate: 0.015, few: 100, rows: [{ eventName: "scroll", did: 702, then: 19 }, { eventName: "file_download", did: 31, then: 3 }] };
    const box = conversionsSees({ from: "2026-09-14", visits: 247, visitsBefore: 196, kinds: contact, fired: [{ eventName: "form_submission", count: 7 }], flow, before });
    expect(box.says).toEqual([
      { code: "allOne", text: "contact", a: 3 },
      { code: "cameAll", a: 3, text: "Direct", more: "brand" },
      { code: "biggestNone", text: "Organic Search", a: 192, b: 249 },
    ]);
    expect(box.steps).toEqual([
      { code: "openChannel", text: "Organic Search", link: "channel", to: { segment: "channels/channel", filters: { key: "Organic Search" } } },
      { code: "countUncounted", text: "form_submission", a: 1, link: "changeWhatCounts", to: { segment: "connection", filters: { change: "1" } } },
      { code: "trySilent", text: "live_chat_event,phone_number_click,email_link_click", a: 3, link: "trackingHealth", to: { segment: "tracking-health" } },
    ]);
    // Spread across channels: most from one; the action above the website's rate on enough people; the form not counted.
    const spread = conversionsSees({
      from: "2026-09-14", visits: 1000, visitsBefore: null, kinds: [{ eventName: "contact", count: 10, countBefore: null }], fired: [{ eventName: "form_submission", count: 7 }],
      flow: { visits: 1000, channels: [{ key: "Organic Search", visits: 700, conversions: 6 }, { key: "Direct", visits: 300, conversions: 4 }], kinds: [{ kind: "service", visits: 600, conversions: 7 }, { kind: "brand", visits: 400, conversions: 3 }] },
      before,
    });
    expect(spread.says).toEqual([
      { code: "allOne", text: "contact", a: 10 },
      { code: "cameMost", a: 6, b: 10, text: "Organic Search", more: "service" },
      { code: "beforeBest", text: "scroll", a: 19 / 702, b: 0.015 },
    ]);
    const quiet = conversionsSees({ from: "2026-09-14", visits: 1000, visitsBefore: null, kinds: [{ eventName: "contact", count: 10, countBefore: null }], fired: [{ eventName: "form_submission", count: 7 }] });
    expect(quiet.says).toEqual([{ code: "allOne", text: "contact", a: 10 }, { code: "uncounted", text: "form_submission", a: 7 }]);
    worded("conversions", box, spread, quiet);
  });

  test("nothing counted: the visits are here, and the enquiry the property records", () => {
    const fired = [{ eventName: "scroll", count: 4_000 }, { eventName: "sign_up", count: 30 }, { eventName: "form_submission", count: 12 }];
    const box = conversionsSees({ from: "2026-09-10", visits: 826, visitsBefore: 744, kinds: [], fired });
    expect(box).toEqual({
      says: [{ code: "nothingCounted", a: 826 }, { code: "fired", text: "form_submission", a: 12 }],
      steps: [{ code: "tick", text: "form_submission", link: "chooseWhatCounts", to: { segment: "connection", filters: { change: "1" } } }],
    });
    const silent = conversionsSees({ from: "2026-09-10", visits: 826, visitsBefore: null, kinds: [], fired: [] });
    expect(silent.steps.map((step) => step.code)).toEqual(["chooseWhatCounts"]);
    worded("conversions", box, silent);
  });
});

describe("10 · Tracking health", () => {
  // Its eye went on 2026-11-04 (Anthony, 2026-11-03: "We dont need the eye on non website data related pages"); its
  // check's own screen still knows every check.
  test("a check's own screen knows every check", () => {
    expect([...HEALTH_CHECKS_WITH_STEPS].sort()).toEqual([...HEALTH_CHECKS].sort());
  });
});

describe("11 · Connection", () => {
  const event = (eventName: string, lastThirtyDays: number, extra: Partial<{ counted: boolean; analyticsValue: number | null; hakkenValue: number | null }> = {}) => ({
    eventName, counted: true, analyticsValue: null, hakkenValue: 20, lastThirtyDays, ...extra,
  });
  const ronins = [event("form_submission", 12), event("live_chat_event", 0), event("phone_number_click", 0), event("email_link_click", 0)];

  test("four kinds at £20 each, only form submissions happened: check the £20", () => {
    const box = connectionSees("ronins.co.uk", "CONNECTED", ronins);
    expect(box).toEqual({
      says: [
        { code: "collected", text: "ronins.co.uk" },
        { code: "kindsValued", a: 4, b: 2_000 },
        { code: "onlyHappened", text: "form_submission", a: 1 },
      ],
      steps: [
        { code: "setWorth", text: "form_submission", a: 2_000, link: "changeWhatCounts", to: { segment: "connection", filters: { change: "1" } } },
        { code: "checkSilent", text: "live_chat_event,phone_number_click,email_link_click", a: 3, link: "trackingHealth", to: { segment: "tracking-health" } },
      ],
    });
    worded("connection", box);
  });

  test("one kind, kinds of different values, one with none, none happened, nothing counted, not connected", () => {
    const one = connectionSees("x.test", "NEEDS_RECONNECT", [event("generate_lead", 4)]);
    expect(one.says).toEqual([{ code: "stopped", text: "x.test" }, { code: "oneKindValued", text: "generate_lead", a: 2_000 }]);
    const mixed = connectionSees("x.test", "CONNECTED", [event("generate_lead", 4), event("click_tel", 0, { hakkenValue: null }), event("purchase", 0, { hakkenValue: null })]);
    expect(mixed.says[1]).toEqual({ code: "kinds", a: 3 });
    expect(mixed.steps.map((step) => step.code)).toEqual(["setMissing", "checkSilent"]);
    const unvaluedOne = connectionSees("x.test", "CONNECTED", [event("click_tel", 2, { hakkenValue: null })]);
    expect(unvaluedOne.says[1]).toEqual({ code: "oneKind", text: "click_tel", a: 0 });
    const quiet = connectionSees("x.test", "CONNECTED", [event("generate_lead", 0), event("click_tel", 0)]);
    expect(quiet.says[2]).toEqual({ code: "noneHappened" });
    const nothing = connectionSees("x.test", "CONNECTED", [event("scroll", 900, { counted: false })]);
    expect(nothing.says[1]).toEqual({ code: "nothingCounted" });
    expect(connectionSees("x.test", "COUNTING", ronins)).toEqual({ says: [], steps: [] });
    worded("connection", one, mixed, unvaluedOne, quiet, nothing);
  });
});

describe("12 · Not connected yet", () => {
  test("Search Console's clicks can't say which became an enquiry: add Google Analytics", () => {
    const box = connectSees("ronins.co.uk", { clicks: 367, impressions: 264_403 });
    expect(box).toEqual({
      says: [{ code: "searchConsole", text: "ronins.co.uk", a: 367, b: 264_403 }, { code: "cantSay" }],
      steps: [{ code: "add", link: "addGoogleAnalytics", to: { segment: "connection" } }],
    });
    expect(connectSees("ronins.co.uk", null)).toEqual({ says: [], steps: [] });
    worded("connect", box);
  });
});

describe("14 · Choose what counts", () => {
  const event = (eventName: string, lastThirtyDays: number, counted: boolean) => ({ eventName, counted, analyticsValue: null, hakkenValue: null, lastThirtyDays });

  test("only form submissions happened; Purchase ticked on a website that sells nothing; chat, phone and email silent", () => {
    const box = chooseEventsSees("ronins.co.uk", [
      event("purchase", 0, true), event("form_submission", 12, false), event("live_chat_event", 0, false),
      event("phone_number_click", 0, false), event("email_link_click", 0, false),
    ]);
    expect(box).toEqual({
      says: [
        { code: "onlyFired", text: "form_submission", a: 12, b: 5 },
        { code: "purchaseSilent", text: "ronins.co.uk" },
        { code: "silentToo", text: "live_chat_event,phone_number_click,email_link_click", a: 3 },
      ],
      steps: [
        { code: "tickUntickPurchase", text: "form_submission", a: 1, link: "chooseWhatCounts", to: { segment: "connection", filters: { change: "1" } } },
        { code: "checkSilent", text: "live_chat_event,phone_number_click,email_link_click", a: 3, link: "trackingHealth", to: { segment: "tracking-health" } },
      ],
    });
    worded("chooseEvents", box);
  });

  test("an event Tracking health found copying link clicks is never named as an enquiry, nor offered to tick", () => {
    // Ronins on 2026-10-13: "Form sent" was still its link clicks, and the box said to tick it.
    const box = chooseEventsSees("ronins.co.uk", [
      event("form_submission", 7, false), event("contact", 3, true), event("live_chat_event", 0, true),
    ], new Set(["form_submission"]));
    expect(box.says[0]).toEqual({ code: "onlyFired", text: "contact", a: 3, b: 3 });
    expect(box.steps.map((step) => step.code)).toEqual(["checkSilent"]);
  });

  test("several fired, ticked as Hakken sets them; none fired; Purchase alone; no key events; still reading", () => {
    // A scroll is never a conversion: never named as one, never offered to tick (GA5).
    const several = chooseEventsSees("x.test", [event("generate_lead", 9, true), event("click_tel", 3, false), event("sign_up", 2, false), event("scroll", 900, false)]);
    expect(several).toEqual({
      says: [{ code: "fired", text: "generate_lead", a: 3, b: 4, c: 9 }],
      steps: [{ code: "tick", text: "click_tel,sign_up", a: 2, link: "chooseWhatCounts", to: { segment: "connection", filters: { change: "1" } } }],
    });
    const none = chooseEventsSees("x.test", [event("generate_lead", 0, true), event("purchase", 0, true)]);
    expect(none.says).toEqual([{ code: "noneFired", a: 2 }, { code: "purchaseSilent", text: "x.test" }, { code: "silent", text: "generate_lead", a: 1 }]);
    expect(none.steps.map((step) => step.code)).toEqual(["untickPurchase", "checkSilent"]);
    expect(chooseEventsSees("x.test", [])).toEqual({ says: [{ code: "noKeyEvents" }], steps: [] });
    expect(chooseEventsSees("x.test", null)).toEqual({ says: [], steps: [] });
    worded("chooseEvents", several, none, chooseEventsSees("x.test", []));
    expectAnalyticsWords("chooseEvents", { says: [], steps: [{ code: "tick", text: "a", a: 1, link: "chooseWhatCounts", to: { segment: "" } }] });
  });
});

describe("the rules' own measures", () => {
  test("a page's path, and the unknown share tracking health's check uses", () => {
    expect(pathOfAddress("https://ronins.co.uk/ai-agency/")).toBe("/ai-agency/");
    expect(pathOfAddress("https://ronins.co.uk")).toBe("/");
    expect(pathOfAddress("Direct")).toBe("Direct");
    expect(UNKNOWN_SHARE).toBe(HEALTH_UNKNOWN_SHARE);
  });
});

describe("the pages behind a square", () => {
  test("how many pages and conversions, the page that made most, the busy page converting least, and a step to the best", () => {
    const box = conversionPagesSees([
      { key: "~1", address: "https://www.acme-shop.test/handles/", visits: 400, did: 7 },
      { key: "~2", address: "https://www.acme-shop.test/knobs/", visits: 300, did: 4 },
      { key: "~3", address: "https://www.acme-shop.test/contact/", visits: 20, did: 1 },
    ]);
    expect(box.says).toEqual([
      { code: "pages", a: 3, b: 12 },
      { code: "topPage", text: "/handles/", a: 7, b: 12 },
      { code: "weakest", text: "/knobs/", a: 4 / 300, b: 300 },
    ]);
    expect(box.steps).toEqual([{ code: "seeBest", text: "/handles/", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~1" } } }]);
    // One page alone: no "made most", and a page with more conversions than visits (an older row) is never judged.
    expect(conversionPagesSees([{ key: "~1", address: "https://www.acme-shop.test/handles/", visits: 5, did: 9 }]).says).toEqual([{ code: "pages", a: 1, b: 9 }]);
    expect(conversionPagesSees([]).says).toEqual([{ code: "none" }]);
  });
});
