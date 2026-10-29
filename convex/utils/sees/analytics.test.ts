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
  pathOfAddress,
  trackingHealthSees,
  trackingCheckSees,
  HEALTH_CHECKS_WITH_STEPS,
  websitesSees,
  type BeforeFacts,
  type ListRowFacts,
  type WebsiteFacts,
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
  key, label: key, visits: 0, engagementRate: null, views: 0, conversions: 0, value: 0, change: null, conversionsBefore: null, ...figures,
});

describe("1 · Your websites", () => {
  const ronins: WebsiteFacts = {
    siteId: "s1", host: "ronins.co.uk", status: "CONNECTED", visits: 826, conversions: 12, value: 24_000,
    visitsBefore: 744, valueBefore: 34_000, counting: true, failing: 3, checks: 8, unknownShare: 0.104,
  };

  test("value down though visits rose; tracking to fix; the website to open", () => {
    const box = websitesSees([ronins]);
    expect(box).toEqual({
      says: [
        { code: "fellVisitsUp", text: "ronins.co.uk", a: 24_000, b: 34_000, c: (826 - 744) / 744 },
        { code: "unknown", text: "ronins.co.uk", a: 0.104 },
      ],
      steps: [
        { code: "whereLost", text: "ronins.co.uk", link: "overview", to: { url: "/app/analytics/s1" } },
        { code: "fixTracking", text: "ronins.co.uk", link: "trackingHealth", to: { url: "/app/analytics/s1/tracking-health" } },
      ],
    });
    worded("websites", box);
  });

  test("the other ways it moved, a website not connected, nothing counted, nothing held", () => {
    const other: WebsiteFacts = { ...ronins, siteId: "s2", host: "morehandles.co.uk", status: "NOT_CONNECTED", visits: null, conversions: null, value: null, visitsBefore: null, valueBefore: null, failing: 0, checks: 0, unknownShare: null };
    const up = websitesSees([{ ...ronins, value: 40_000, failing: 1, unknownShare: null }, other]);
    expect(up.says).toEqual([
      { code: "value.up", text: "ronins.co.uk", a: 40_000, b: 34_000 },
      { code: "tracking", text: "ronins.co.uk", a: 1, b: 8 },
      { code: "notConnected", a: 1 },
    ]);
    expect(up.steps.map((step) => step.code)).toEqual(["open", "fixTracking", "connect"]);
    expect(up.steps[2].to).toEqual({ url: "/app/analytics/s2/connection" });
    const quiet = websitesSees([{ ...ronins, failing: 0, value: 34_000, visits: 600, unknownShare: null }]);
    expect(quiet.says).toEqual([{ code: "value.same", text: "ronins.co.uk", a: 34_000, b: 34_000 }]);
    const down = websitesSees([{ ...ronins, visits: 700, failing: 0 }]);
    expect(down.says[0]).toMatchObject({ code: "value.down" });
    const fresh = websitesSees([{ ...ronins, visitsBefore: null, valueBefore: null, failing: 0 }]);
    expect(fresh.says).toEqual([{ code: "made", text: "ronins.co.uk", a: 24_000, b: 12 }]);
    const counting = websitesSees([{ ...ronins, counting: false, failing: 0 }]);
    expect(counting).toEqual({
      says: [{ code: "notCounting", text: "ronins.co.uk", a: 826 }],
      steps: [{ code: "count", text: "ronins.co.uk", link: "chooseWhatCounts", to: { url: "/app/analytics/s1/connection?change=1" } }],
    });
    expect(websitesSees([other])).toEqual({
      says: [{ code: "noneConnected", a: 1 }],
      steps: [{ code: "connect", text: "morehandles.co.uk", link: "connection", to: { url: "/app/analytics/s2/connection" } }],
    });
    expect(websitesSees([])).toEqual({ says: [{ code: "none" }], steps: [] });
    worded("websites", up, quiet, down, fresh, counting, websitesSees([other]), websitesSees([]));
  });
});

describe("2 · Overview", () => {
  const now = { visits: 826, engaged: 410, conversions: 12, value: 24_000 };
  const before = { visits: 744, engaged: 376, conversions: 17, value: 34_000 };
  const changedMost = [
    { kind: "channel" as const, key: "Direct", label: "Direct", conversions: -6, value: -12_000, conversionsNow: 5 },
    { kind: "landing" as const, key: "~0", label: "https://ronins.co.uk/", conversions: -3, value: -6_000, conversionsNow: 4 },
    { kind: "landing" as const, key: "~1", label: "https://ronins.co.uk/author/anthony/", conversions: 2, value: 4_000, conversionsNow: 2 },
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
    expect(first).toEqual({ says: [{ code: "made", a: 12, b: 24_000 }], steps: [] });
    expect(overviewSees({ siteId: SITE, now: null, before: null, counting: true, changedMost: [], searchConsole: null })).toEqual({ says: [], steps: [] });
    worded("overview", ...boxes, rose, channelOnly, pageOnly, both, roseChannel, notCounting, first);
  });
});

describe("4 · Channels", () => {
  const channels = [
    row("Organic Search", { visits: 475, engagementRate: 0.526, conversions: 6, value: 12_000, change: 0.044, conversionsBefore: 6 }),
    row("Direct", { visits: 226, engagementRate: 0.527, conversions: 5, value: 10_000, change: 0.051, conversionsBefore: 11 }),
    row("AI assistants", { visits: 61, engagementRate: 0.279, conversions: 0, change: 5.1, conversionsBefore: 0 }),
    row("Referral", { visits: 39, engagementRate: 0.436, change: -0.025, conversionsBefore: 0 }),
    row("Unassigned", { visits: 12, engagementRate: 0, conversions: 1, value: 2_000, change: -0.368, conversionsBefore: 0 }),
  ];

  test("Google's share of the value; direct converting less; AI assistants' visitors leaving", () => {
    const box = channelsSees(channels);
    expect(box).toEqual({
      says: [
        { code: "lead", text: "Organic Search", a: 475, b: 813, c: 12_000 },
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

  test("conversions up, assistants converting, nothing valued, no visits", () => {
    const rising = channelsSees([row("Direct", { visits: 100, conversions: 4, conversionsBefore: 1 }), row("AI assistants", { visits: 20, engagementRate: 0.6, conversions: 2 })]);
    expect(rising.says).toEqual([
      { code: "leadVisits", text: "Direct", a: 100, b: 120 },
      { code: "rose", text: "Direct", a: 4, b: 1 },
      { code: "assistantsConverted", a: 20, b: 0.6, c: 2 },
    ]);
    expect(rising.steps).toEqual([]);
    expect(channelsSees([])).toEqual({ says: [{ code: "none" }], steps: [] });
    worded("channels", rising, channelsSees([]));
  });
});

describe("5 · A channel's own screen", () => {
  const figures = { visits: 61, visitsBefore: 10, engaged: 17, conversions: 0, conversionsBefore: 0, value: 0, valueBefore: 0, siteVisits: 826, siteEngaged: 410 };
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
    const staying = { ...figures, engaged: 50, conversions: 3, value: 6_000 };
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
    expect(boxes[0].says.slice(1)).toEqual([{ code: "stayLonger", a: 50 / 61, b: 410 / 826 }, { code: "converted", a: 3, b: 6_000 }]);
    expect(boxes[0].steps).toEqual([]);
    expect(channelSees("Email", [], null, "s1")).toEqual({ says: [{ code: "none", text: "Email" }], steps: [] });
    worded("channel", ...boxes, channelSees("Email", [], null, "s1"));
  });
});

describe("6 · Landing pages, and 17 · a device asked of Google", () => {
  const pages = [
    row("~0", { label: "https://ronins.co.uk/", visits: 141, engagementRate: 0.61, conversions: 4, value: 8_000 }),
    row("~1", { label: "https://ronins.co.uk/ai-agency/", visits: 84, engagementRate: 0.69, conversions: 3, value: 6_000 }),
    row("(not set)", { visits: 86, engagementRate: 0.035 }),
    row("~2", { label: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", visits: 188, engagementRate: 0.431 }),
    row("~3", { label: "https://ronins.co.uk/venture-studio/", visits: 12, conversions: 1, value: 2_000 }),
  ];

  test("the guide bringing most visits and none converting; the pages making the money; the visits with no landing page", () => {
    const box = landingSees(pages, { groups: false, device: "", everyDevice: null });
    expect(box).toEqual({
      says: [
        { code: "leakTop", text: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", a: 188 },
        { code: "earners", text: "https://ronins.co.uk/", more: "https://ronins.co.uk/ai-agency/", a: 14_000, b: 16_000 },
        { code: "notSet", a: 86, b: 86 / 511 },
      ],
      steps: [
        { code: "nextStep", text: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~2" } } },
        { code: "fixNotSet", a: 86, link: "trackingHealth", to: { segment: "tracking-health" } },
      ],
    });
    worded("landing", box);
  });

  test("a leak that is not the busiest, one earner, nothing converted, nothing at all", () => {
    const leak = landingSees([row("~0", { visits: 300, conversions: 2, value: 1_000 }), row("~1", { visits: 60 })], { groups: false, device: "", everyDevice: null });
    expect(leak.says).toEqual([{ code: "leak", text: "~1", a: 60 }, { code: "earner", text: "~0", a: 1_000, b: 1_000 }]);
    const quiet = landingSees([row("~0", { visits: 20 })], { groups: false, device: "", everyDevice: null });
    expect(quiet).toEqual({ says: [{ code: "noConversions", a: 20 }], steps: [] });
    expect(landingSees([], { groups: false, device: "", everyDevice: null }).says).toEqual([{ code: "none" }]);
    worded("landing", leak, quiet, landingSees([], { groups: false, device: "", everyDevice: null }));
  });

  test("page groups: the group making the most, and the pages in none", () => {
    const groups = [
      row("service", { label: "Service", visits: 172, conversions: 5, value: 10_000, members: 26 }),
      row("NOT_SORTED", { label: "NOT_SORTED", visits: 91, members: 6 }),
    ];
    const box = landingSees(groups, { groups: true, device: "", everyDevice: null });
    expect(box).toEqual({
      says: [{ code: "groupLead", text: "Service", a: 10_000, b: 10_000 }, { code: "unsorted", a: 6, b: 91 }],
      steps: [{ code: "seeUnsorted", a: 6, link: "unsortedPages", to: { segment: "funnel", filters: { view: "pages", group: "NOT_SORTED" } } }],
    });
    const none = landingSees([row("service", { label: "Service", visits: 3, members: 2 })], { groups: true, device: "", everyDevice: null });
    expect(none).toEqual({ says: [{ code: "groupsNoValue", a: 1 }], steps: [] });
    worded("landing", box, none);
  });

  test("phones: their share, the page their conversions came from, and the page they leave soonest", () => {
    const every = [row("~2", { visits: 188, engagementRate: 0.43 }), row("~0", { visits: 141, engagementRate: 0.61 }), row("(not set)", { visits: 497 })];
    const phones = [
      row("~2", { visits: 31, engagementRate: 0.32 }),
      row("~0", { visits: 25, engagementRate: 0.6, conversions: 2, value: 4_000 }),
      row("(not set)", { visits: 62 }),
    ];
    const box = landingSees(phones, { groups: false, device: "mobile", everyDevice: every });
    expect(box).toEqual({
      says: [
        { code: "device.mobile", a: 118, b: 826, c: 2 },
        { code: "allFrom", text: "~0", a: 2, b: 4_000 },
        { code: "engagesLess", text: "~2", a: 31, b: 0.32, c: 0.43 },
      ],
      steps: [{ code: "readOn.mobile", text: "~2", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~2" } } }],
    });
    const desktop = landingSees([...phones, row("~3", { visits: 5, conversions: 1, value: 500 })], { groups: false, device: "desktop", everyDevice: every });
    expect(desktop.says[1]).toEqual({ code: "mostFrom", text: "~0", a: 2, b: 4_000 });
    const tablet = landingSees(phones, { groups: false, device: "tablet", everyDevice: every });
    worded("landing", box, desktop, tablet);
    expectAnalyticsWords("landing", { says: [], steps: ["desktop", "tablet"].map((device) => ({ code: `readOn.${device}`, text: "/", link: "seePage", to: { segment: "" } })) });
  });
});

describe("8 · All pages", () => {
  // all-pages-rethink-plan.md AP6: never money; how pages moved, the biggest drop, the pages nobody visited.
  const pages = [
    row("~0", { label: "https://ronins.co.uk/", views: 508, viewsBefore: 400, conversions: 2, value: 4_000 }),
    row("~1", { label: "https://ronins.co.uk/ai-agency/", views: 318, viewsBefore: 400, conversions: 4, value: 8_000 }),
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

describe("21 · A page's own screen", () => {
  // Ronins' /ai-agency/ as the drawing reads it (§18.2 board 21).
  const before: BeforeFacts[] = [
    { kind: "site", key: "google.com", name: "Google", views: 118 },
    { kind: "page", key: "~0", name: "https://ronins.co.uk/", views: 74 },
    { kind: "none", key: "none", name: "", views: 41 },
    { kind: "site", key: "chatgpt.com", name: "ChatGPT", views: 22 },
    { kind: "page", key: "~4", name: "https://ronins.co.uk/about-us/", views: 19 },
    { kind: "site", key: "bing.com", name: "Bing", views: 9 },
  ];
  const isAssistant = (name: string) => name === "ChatGPT";
  const total = 118 + 74 + 41 + 22 + 19 + 9;

  test("its two biggest sources; views with no page before; an assistant; keep the link, check the assistant", () => {
    const box = pageSees(before, "s1", isAssistant, "~9");
    expect(box).toEqual({
      says: [
        { code: "twoSources", text: "Google", a: 118 / total, more: "~0", b: 74 / total },
        { code: "assistant", text: "ChatGPT", a: 22 },
      ],
      steps: [
        { code: "keepLink", text: "~0", link: "seePage", to: { segment: "all-pages/page", filters: { key: "~0" } } },
        { code: "checkAssistant", text: "ChatGPT", link: "aiAnswers", to: { url: "/app/sites/s1/ai/answers" } },
      ],
    });
    // A fifth or more with no page before is said; one source alone; none at all.
    const typed = pageSees([{ kind: "page", key: "~0", name: "https://ronins.co.uk/", views: 30 }, { kind: "none", key: "none", name: "", views: 10 }], "s1", isAssistant, "~9");
    expect(typed.says).toEqual([{ code: "oneSource", text: "~0", a: 0.75 }, { code: "noneBefore", a: 0.25 }]);
    const nothing = pageSees([{ kind: "none", key: "none", name: "", views: 5 }], "s1", isAssistant, "~9");
    expect(nothing).toEqual({ says: [{ code: "noSources" }], steps: [] });
    const empty = pageSees([], "s1", isAssistant, "~9");
    // The page reloaded is not a source of its own: never the link to keep.
    const reloaded = pageSees([{ kind: "page", key: "~9", name: "https://ronins.co.uk/", views: 50 }, ...before], "s1", isAssistant, "~9");
    expect(reloaded.says[0]).toMatchObject({ code: "twoSources", text: "Google", more: "~0" });
    expect(reloaded.steps[0]).toMatchObject({ code: "keepLink", text: "~0" });
    expect(empty).toEqual({ says: [{ code: "none" }], steps: [] });
    worded("page", box, typed, nothing, empty, reloaded);
  });

  test("its story first: the visits that started on it and where their conversion was made, Google's with none, counted again, a page that converts better (analytics-page-screen-plan.md §5)", () => {
    // Ronins' Kapferer article, 13 October 2026.
    const kapferer = {
      started: { visits: 593, websiteVisits: 4494, conversions: 1, madeHere: 0 },
      biggest: { name: "Google", visits: 500, conversions: 0 },
      converter: { name: "(direct)", conversions: 1 },
      viewsPerVisit: 2.7,
      pages: { different: 1, counted: 3.5 },
      nearest: { page: "~31", visits: 35, conversions: 3 },
    };
    const box = pageSees(before, "s1", isAssistant, "~9", kapferer);
    expect(box.says).toEqual([
      { code: "startedElsewhere", a: 593, b: 593 / 4494, c: 1 },
      { code: "biggestNoneTyped", text: "Google", a: 500 },
      // Said with the figures the page shows: 1.0 different pages a visit, 3.5 as Google counts them.
      { code: "countedAgainPages", a: 1, b: 3.5 },
    ]);
    expect(box.steps.map((step) => step.code)).toEqual(["nextStep", "fixCountedAgain", "keepLink"]);
    expect(box.steps[0]).toMatchObject({ link: "landingPage", to: { segment: "all-pages/page", filters: { key: "~9" } } });
    // Counted once a visit, with its conversion on the page, from a source of its own: the page that converts better is said.
    const plain = pageSees(before, "s1", isAssistant, "~9", { ...kapferer, started: { ...kapferer.started, madeHere: 1 }, converter: { name: "Bing", conversions: 1 }, viewsPerVisit: 1.1, pages: { different: 1.4, counted: 1.6 } });
    expect(plain.says.map((phrase) => phrase.code)).toEqual(["startedConverted", "biggestNone", "nearest"]);
    expect(plain.says[1]).toEqual({ code: "biggestNone", text: "Google", a: 500, more: "Bing" });
    // A busy page whose visits never convert gets its next step; a quiet one doesn't.
    const none = pageSees(before, "s1", isAssistant, "~9", { ...kapferer, started: { ...kapferer.started, conversions: 0 }, converter: null, nearest: null, viewsPerVisit: null, pages: null });
    expect(none.says[0]).toEqual({ code: "startedNone", a: 593, b: 593 / 4494 });
    expect(none.steps[0]?.code).toBe("nextStep");
    const quiet = pageSees(before, "s1", isAssistant, "~9", { ...kapferer, started: { visits: 40, websiteVisits: 4494, conversions: 0, madeHere: 0 }, converter: null, nearest: null, viewsPerVisit: null, pages: null });
    expect(quiet.steps.map((step) => step.code)).not.toContain("nextStep");
    // A page another page sends under a twentieth of its views is no link worth keeping.
    const faint = pageSees([{ kind: "site", key: "google.com", name: "Google", views: 1444 }, { kind: "page", key: "~2", name: "https://ronins.co.uk/web-design-insights/", views: 1 }], "s1", isAssistant, "~9");
    expect(faint.steps.map((step) => step.code)).not.toContain("keepLink");
    worded("page", box, plain, none, quiet, faint);
  });
});

describe("9 · Conversions and 16 · Nothing counted yet", () => {
  const kinds = [
    { eventName: "form_submission", count: 12, countBefore: 17, setIn: "HAKKEN" },
    { eventName: "live_chat_event", count: 0, countBefore: 0, setIn: "HAKKEN" },
    { eventName: "phone_number_click", count: 0, countBefore: 0, setIn: "HAKKEN" },
    { eventName: "email_link_click", count: 0, countBefore: 0, setIn: "HAKKEN" },
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

  test("several kinds, one with no value, the share rising, none happened", () => {
    const several = conversionsSees({
      from: "2026-09-10", visits: 500, visitsBefore: 1000,
      kinds: [{ eventName: "generate_lead", count: 5, countBefore: 2, setIn: "HAKKEN" }, { eventName: "click_tel", count: 2, countBefore: 1, setIn: null }],
      fired: [],
    });
    expect(several).toEqual({
      says: [{ code: "topKind", text: "generate_lead", a: 5, b: 7 }, { code: "rateUp", a: 3 / 1000, b: 7 / 500 }],
      steps: [{ code: "setValue", text: "click_tel", a: 1, link: "changeWhatCounts", to: { segment: "connection", filters: { change: "1" } } }],
    });
    const none = conversionsSees({ from: "2026-09-10", visits: 500, visitsBefore: null, kinds: kinds.map((kind) => ({ ...kind, count: 0 })), fired: [] });
    expect(none.says).toEqual([{ code: "noneHappened", a: 4 }]);
    expect(conversionsSees({ from: null, visits: 0, visitsBefore: null, kinds: [], fired: [] })).toEqual({ says: [], steps: [] });
    worded("conversions", several, none);
  });

  test("with the flow and the actions (ga-conversions-visitors-plan.md CV6): where they came from, the biggest channel converting nothing, the form not counted", () => {
    // ronins.co.uk's last 30 days: three Contacts, all typed in to the home page; search converting nothing; forms not counted.
    const contact = [{ eventName: "contact", count: 3, countBefore: 3, setIn: "HAKKEN" }, ...kinds.slice(1)];
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
      from: "2026-09-14", visits: 1000, visitsBefore: null, kinds: [{ eventName: "contact", count: 10, countBefore: null, setIn: "HAKKEN" }], fired: [{ eventName: "form_submission", count: 7 }],
      flow: { visits: 1000, channels: [{ key: "Organic Search", visits: 700, conversions: 6 }, { key: "Direct", visits: 300, conversions: 4 }], kinds: [{ kind: "service", visits: 600, conversions: 7 }, { kind: "brand", visits: 400, conversions: 3 }] },
      before,
    });
    expect(spread.says).toEqual([
      { code: "allOne", text: "contact", a: 10 },
      { code: "cameMost", a: 6, b: 10, text: "Organic Search", more: "service" },
      { code: "beforeBest", text: "scroll", a: 19 / 702, b: 0.015 },
    ]);
    const quiet = conversionsSees({ from: "2026-09-14", visits: 1000, visitsBefore: null, kinds: [{ eventName: "contact", count: 10, countBefore: null, setIn: "HAKKEN" }], fired: [{ eventName: "form_submission", count: 7 }] });
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
  const checks = [
    { check: "NOTHING_COUNTED", passing: true },
    { check: "NO_VALUE", passing: true },
    { check: "TRACKING_STOPPED", passing: true },
    { check: "SUDDEN_FALL", passing: false, names: ["conversions"], share: 0.53 },
    { check: "SELF_REFERRAL", passing: true },
    { check: "PAYMENT_REFERRALS", passing: true },
    { check: "TOO_MUCH_UNKNOWN", passing: false, share: 0.104, count: 86 },
    { check: "STRANGERS", passing: false, names: ["nclnet.org"], count: 38 },
  ];

  test("three of eight fail: the unknown visits first, then the sudden fall, and how to fix each", () => {
    const box = trackingHealthSees({ checks });
    expect(box).toEqual({
      says: [
        { code: "failing", a: 3, b: 8 },
        { code: "check.TOO_MUCH_UNKNOWN", a: 0.104, b: 86 },
        { code: "check.SUDDEN_FALL.conversions", a: 0.53, b: 0 },
      ],
      steps: [
        { code: "fix.TOO_MUCH_UNKNOWN", link: "landingPages", to: { segment: "funnel" } },
        { code: "fix.SUDDEN_FALL", link: "conversions", to: { segment: "conversions" } },
        { code: "fix.STRANGERS", link: "connection", to: { segment: "connection" } },
      ],
    });
    worded("trackingHealth", box);
  });

  test("every check has its sentence and its fix; all passing; not checked yet", () => {
    // Every check Tracking health runs, so one added without its words fails here (check 9 had none until 2026-10-13).
    const events = new Set(["NO_VALUE", "SOMETHING_ELSE", "ENQUIRY_UNCOUNTED", "NEVER_HAPPENS"]);
    for (const check of HEALTH_CHECKS) {
      const box = trackingHealthSees({ checks: [{ check, passing: false, names: events.has(check) ? ["click_email"] : ["visits"], others: ["click"], count: 3, share: 0.2 }] });
      expect(box.says[1].code.startsWith(`check.${check}`)).toBe(true);
      expect(box.steps).toHaveLength(1);
      worded("trackingHealth", box);
    }
    expect(trackingHealthSees({ checks: checks.map((check) => ({ ...check, passing: true })) })).toEqual({ says: [{ code: "allPassing", a: 8 }], steps: [] });
    expect(trackingHealthSees(null)).toEqual({ says: [], steps: [] });
    worded("trackingHealth", trackingHealthSees({ checks: [{ check: "NOTHING_COUNTED", passing: true }] }));
  });

  test("ronins.co.uk before 2026-10-13: Form sent is its link clicks, its forms uncounted, its chat, phone and email silent", () => {
    const box = trackingHealthSees({ checks: [
      { check: "SOMETHING_ELSE", passing: false, names: ["form_submission"], others: ["click"], count: 7 },
      { check: "ENQUIRY_UNCOUNTED", passing: false, names: ["contact"], count: 179 },
      { check: "NEVER_HAPPENS", passing: false, names: ["live_chat_event", "phone_number_click", "email_link_click"], count: 90 },
    ] });
    expect(box).toEqual({
      says: [
        { code: "failing", a: 3, b: 3 },
        // Both named in the reader's words: "“Form sent” and “Clicked a link to another website” match on each of the last 7 days…".
        { code: "check.SOMETHING_ELSE", a: 7, b: 7, text: "form_submission,click", c: 1 },
        { code: "check.ENQUIRY_UNCOUNTED", a: 179, b: 179, text: "contact", c: 1 },
      ],
      steps: [
        { code: "fix.SOMETHING_ELSE", link: "conversions", to: { segment: "conversions" } },
        { code: "fix.ENQUIRY_UNCOUNTED", link: "chooseWhatCounts", to: { segment: "connection", filters: { change: "1" } } },
        { code: "fix.NEVER_HAPPENS", link: "conversions", to: { segment: "conversions" } },
      ],
    });
    worded("trackingHealth", box);
  });
});

describe("10 · A tracking health check's own screen (ga-tracking-health-plan.md TH2)", () => {
  test("ronins.co.uk's conversions that never happen: what it found, why it matters, and three steps", () => {
    const box = trackingCheckSees({ check: "NEVER_HAPPENS", passing: false, names: ["live_chat_event", "phone_number_click", "email_link_click"], count: 90 }, "ronins.co.uk");
    expect(box).toEqual({
      says: [
        { code: "check.NEVER_HAPPENS", a: 90, b: 90, text: "live_chat_event,phone_number_click,email_link_click", c: 3 },
        { code: "why.NEVER_HAPPENS" },
      ],
      steps: [
        // Try each one on the website itself, look for it in Google Analytics, then check Conversions.
        { code: "step.NEVER_HAPPENS.s1", text: "live_chat_event,phone_number_click,email_link_click", c: 3, link: "yourWebsite", to: { url: "https://ronins.co.uk/" } },
        { code: "step.NEVER_HAPPENS.s2", text: "live_chat_event,phone_number_click,email_link_click", c: 3, link: "googleAnalytics", to: { url: "https://analytics.google.com/" } },
        { code: "step.NEVER_HAPPENS.s3", text: "live_chat_event,phone_number_click,email_link_click", c: 3, link: "conversions", to: { segment: "conversions" } },
      ],
    });
    worded("trackingHealth", box);
  });

  test("every check has its steps and its words, failing or passing; an unknown check says nothing", () => {
    // Every check Tracking health runs has a screen of its own: one added without its steps fails here.
    expect([...HEALTH_CHECKS_WITH_STEPS].sort()).toEqual([...HEALTH_CHECKS].sort());
    const events = new Set(["NO_VALUE", "SOMETHING_ELSE", "ENQUIRY_UNCOUNTED", "NEVER_HAPPENS"]);
    for (const check of HEALTH_CHECKS) {
      const box = trackingCheckSees({ check, passing: false, names: events.has(check) ? ["click_email"] : ["visits"], others: ["click"], count: 3, share: 0.2 }, "acme-shop.test");
      expect(box.says.map((phrase) => phrase.code)).toEqual([expect.stringMatching(new RegExp(`^check\\.${check}`)), `why.${check}`]);
      expect(box.steps.length).toBeGreaterThan(0);
      expect(box.steps.map((step) => step.code)).toEqual(box.steps.map((_, at) => `step.${check}.s${at + 1}`));
      worded("trackingHealth", box);
      const passing = trackingCheckSees({ check, passing: true }, "acme-shop.test");
      expect(passing).toEqual({ says: [{ code: `passing.${check}` }], steps: [] });
      worded("trackingHealth", passing);
    }
    expect(trackingCheckSees({ check: "NOT_A_CHECK", passing: false }, "acme-shop.test")).toEqual({ says: [], steps: [] });
    expect(trackingCheckSees(null, "acme-shop.test")).toEqual({ says: [], steps: [] });
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
