import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { UNKNOWN_SHARE as HEALTH_UNKNOWN_SHARE } from "../../googleAnalyticsHealth";
import type { Seen } from "../hakkenSees";
import {
  UNKNOWN_SHARE,
  allPagesSees,
  channelSees,
  channelsSees,
  chooseEventsSees,
  connectSees,
  connectionSees,
  conversionsSees,
  landingSees,
  overviewSees,
  pathOfAddress,
  trackingHealthSees,
  websitesSees,
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

  test("conversions fell while visits rose; the channel and the page behind it; Google rarely clicked", () => {
    const box = overviewSees({ now, before, counting: true, changedMost, searchConsole });
    expect(box).toEqual({
      says: [
        { code: "lead.down.up", a: (826 - 744) / 744, b: 17, c: 12 },
        { code: "cause.fellBoth", text: "Direct", a: 6, more: "/", b: 3 },
        { code: "googleRarely", a: 264_403, b: 367 / 264_403 },
      ],
      steps: [
        { code: "channel.fell", text: "Direct", a: 5, b: 11, link: "channels", to: { segment: "channels" } },
        { code: "page.fell", text: "/", a: 4, b: 7, link: "seePage", to: { segment: "landing-pages/page", filters: { key: "~0" } } },
        { code: "push", link: "pagesToPush", to: { segment: "heroes", filters: { tab: "push" } } },
      ],
    });
    worded("overview", box);
  });

  test("every way conversions and visits can move, each cause, and the states before figures", () => {
    const boxes: Seen[] = [];
    for (const conversions of [10, 12, 20]) {
      for (const visits of [700, 744, 900]) {
        boxes.push(overviewSees({ now: { ...now, visits, conversions }, before: { ...before, conversions: 12 }, counting: true, changedMost, searchConsole: null }));
      }
    }
    expect(boxes.map((box) => box.says[0].code)).toEqual([
      "lead.down.down", "lead.down.same", "lead.down.up",
      "lead.same.down", "lead.same.same", "lead.same.up",
      "lead.up.down", "lead.up.same", "lead.up.up",
    ]);
    const rose = overviewSees({ now: { ...now, conversions: 20 }, before, counting: true, changedMost, searchConsole: { clicks: 900, impressions: 30_000 } });
    expect(rose.says.slice(1)).toEqual([{ code: "cause.rosePage", text: "/author/anthony/", a: 2 }, { code: "google", a: 30_000, b: 0.03 }]);
    expect(rose.steps).toEqual([{ code: "page.rose", text: "/author/anthony/", a: 2, b: 0, link: "seePage", to: { segment: "landing-pages/page", filters: { key: "~1" } } }]);
    const channelOnly = overviewSees({ now, before, counting: true, changedMost: changedMost.slice(0, 1), searchConsole: null });
    expect(channelOnly.says[1]).toEqual({ code: "cause.fellChannel", text: "Direct", a: 6 });
    const pageOnly = overviewSees({ now, before, counting: true, changedMost: changedMost.slice(1, 2), searchConsole: null });
    expect(pageOnly.says[1]).toEqual({ code: "cause.fellPage", text: "/", a: 3 });
    const both = overviewSees({ now: { ...now, conversions: 20 }, before, counting: true, changedMost: [{ ...changedMost[0], conversions: 3, conversionsNow: 8 }, changedMost[2]], searchConsole: null });
    expect(both.says[1]).toMatchObject({ code: "cause.roseBoth" });
    expect(both.steps[0]).toMatchObject({ code: "channel.rose", a: 8, b: 5 });
    const roseChannel = overviewSees({ now: { ...now, conversions: 20 }, before, counting: true, changedMost: [{ ...changedMost[0], conversions: 3 }], searchConsole: null });
    expect(roseChannel.says[1]).toMatchObject({ code: "cause.roseChannel" });
    const notCounting = overviewSees({ now, before, counting: false, changedMost: [], searchConsole });
    expect(notCounting).toEqual({
      says: [{ code: "notCounting", a: 826 }, { code: "googleRarely", a: 264_403, b: 367 / 264_403 }],
      steps: [
        { code: "chooseWhatCounts", link: "chooseWhatCounts", to: { segment: "connection", filters: { change: "1" } } },
        { code: "push", link: "pagesToPush", to: { segment: "heroes", filters: { tab: "push" } } },
      ],
    });
    const first = overviewSees({ now, before: null, counting: true, changedMost: [], searchConsole: null });
    expect(first).toEqual({ says: [{ code: "made", a: 12, b: 24_000 }], steps: [] });
    expect(overviewSees({ now: null, before: null, counting: true, changedMost: [], searchConsole: null })).toEqual({ says: [], steps: [] });
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
        { code: "whyFell", text: "Direct", a: 5, b: 11, link: "landingPages", to: { segment: "landing-pages" } },
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
        { code: "nextStep", text: "ChatGPT", link: "landingPages", to: { segment: "landing-pages" } },
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
        { code: "nextStep", text: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", link: "seePage", to: { segment: "landing-pages/page", filters: { key: "~2" } } },
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
      steps: [{ code: "seeUnsorted", a: 6, link: "unsortedPages", to: { segment: "landing-pages", filters: { view: "pages", group: "NOT_SORTED" } } }],
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
      steps: [{ code: "readOn.mobile", text: "~2", link: "seePage", to: { segment: "landing-pages/page", filters: { key: "~2" } } }],
    });
    const desktop = landingSees([...phones, row("~3", { visits: 5, conversions: 1, value: 500 })], { groups: false, device: "desktop", everyDevice: every });
    expect(desktop.says[1]).toEqual({ code: "mostFrom", text: "~0", a: 2, b: 4_000 });
    const tablet = landingSees(phones, { groups: false, device: "tablet", everyDevice: every });
    worded("landing", box, desktop, tablet);
    expectAnalyticsWords("landing", { says: [], steps: ["desktop", "tablet"].map((device) => ({ code: `readOn.${device}`, text: "/", link: "seePage", to: { segment: "" } })) });
  });
});

describe("8 · All pages", () => {
  const pages = [
    row("~0", { label: "https://ronins.co.uk/", views: 508, conversions: 2, value: 4_000 }),
    row("~1", { label: "https://ronins.co.uk/ai-agency/", views: 318, conversions: 4, value: 8_000 }),
    row("~2", { label: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", views: 417 }),
  ];

  test("conversions on few pages; the page making most; the most viewed page making none", () => {
    const box = allPagesSees(pages, true);
    expect(box).toEqual({
      says: [
        { code: "madeOn", a: 6, b: 2 },
        { code: "best", text: "https://ronins.co.uk/ai-agency/", a: 4, b: 318 },
        { code: "idle", text: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", a: 417 },
      ],
      steps: [{ code: "copy", text: "https://ronins.co.uk/ai-agency/", more: "https://ronins.co.uk/hub/kapferer-brand-identity-prism/", link: "seePage", to: { segment: "landing-pages/page", filters: { key: "~2" } } }],
    });
    const top = allPagesSees([...pages, row("~3", { views: 900 })], true);
    expect(top.says[2]).toEqual({ code: "idleMostViewed", text: "~3", a: 900 });
    const none = allPagesSees([row("~0", { views: 3 })], true);
    expect(none).toEqual({ says: [{ code: "noConversions", a: 1 }], steps: [] });
    const notCounting = allPagesSees(pages, false);
    expect(notCounting.steps.map((step) => step.code)).toEqual(["chooseWhatCounts"]);
    worded("allPages", box, top, none, notCounting, allPagesSees([], true));
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
        { code: "fix.TOO_MUCH_UNKNOWN", link: "landingPages", to: { segment: "landing-pages" } },
        { code: "fix.SUDDEN_FALL", link: "conversions", to: { segment: "conversions" } },
        { code: "fix.STRANGERS", link: "connection", to: { segment: "connection" } },
      ],
    });
    worded("trackingHealth", box);
  });

  test("every check has its sentence and its fix; all passing; not checked yet", () => {
    const every = ["TRACKING_STOPPED", "NOTHING_COUNTED", "TOO_MUCH_UNKNOWN", "SUDDEN_FALL", "NO_VALUE", "PAYMENT_REFERRALS", "SELF_REFERRAL", "STRANGERS"];
    for (const check of every) {
      const box = trackingHealthSees({ checks: [{ check, passing: false, names: check === "NO_VALUE" ? ["click_email"] : ["visits"], count: 3, share: 0.2 }] });
      expect(box.says[1].code.startsWith(`check.${check}`)).toBe(true);
      expect(box.steps).toHaveLength(1);
      worded("trackingHealth", box);
    }
    expect(trackingHealthSees({ checks: checks.map((check) => ({ ...check, passing: true })) })).toEqual({ says: [{ code: "allPassing", a: 8 }], steps: [] });
    expect(trackingHealthSees(null)).toEqual({ says: [], steps: [] });
    worded("trackingHealth", trackingHealthSees({ checks: [{ check: "NOTHING_COUNTED", passing: true }] }));
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
