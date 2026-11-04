import { describe, expect, test } from "vitest";
import { beforeKey, emptyRow, joinAsks, journeysOf, packList, siteNameOf, splitBeforeKey, unpackPart, unpackPartOnly, type ListRow } from "./googleAnalyticsLists";
import { assistantOf } from "./utils/aiAssistants";

/**
 * The page before (docs/plans/active/google-analytics-plan.md §18.6.4): each
 * view's `pageReferrer` as a page of the website, another website, or none —
 * and another website named as people know it.
 */

const ADDRESSES = ["www.acme-shop.test", "acme-shop.test"];

describe("the page before", () => {
  test("a page of the website by its path, www. or not; another website by its host; nothing as none", () => {
    expect(beforeKey("https://www.acme-shop.test/ai-agency/?ref=menu", ADDRESSES)).toBe("page:/ai-agency/");
    expect(beforeKey("https://acme-shop.test", ADDRESSES)).toBe("page:/");
    expect(beforeKey("https://www.google.co.uk/", ADDRESSES)).toBe("site:google.co.uk");
    expect(beforeKey("https://chatgpt.com/c/abc", ADDRESSES)).toBe("site:chatgpt.com");
    for (const nothing of ["", "(not set)", "(direct)", "android-app://com.slack"]) expect(beforeKey(nothing, ADDRESSES)).not.toMatch(/^page:/);
    expect(beforeKey("", ADDRESSES)).toBe("none");
    expect(beforeKey("not an address", ADDRESSES)).toBe("none");
    expect(splitBeforeKey("page:~4")).toEqual({ kind: "page", value: "~4" });
    expect(splitBeforeKey("site:bing.com")).toEqual({ kind: "site", value: "bing.com" });
    expect(splitBeforeKey("none")).toEqual({ kind: "none", value: "" });
  });

  test("another website named as people know it, else its own address", () => {
    expect(siteNameOf("www.google.co.uk", assistantOf)).toBe("Google");
    expect(siteNameOf("chatgpt.com", assistantOf)).toBe("ChatGPT");
    expect(siteNameOf("www.perplexity.ai", assistantOf)).toBe("Perplexity");
    expect(siteNameOf("uk.linkedin.com", assistantOf)).toBe("LinkedIn");
    expect(siteNameOf("t.co", assistantOf)).toBe("X");
    expect(siteNameOf("teams.public.onecdn.static.microsoft", assistantOf)).toBe("Microsoft Teams");
    expect(siteNameOf("www.example.org", assistantOf)).toBe("example.org");
  });
});

describe("a money page's journeys (insights-analyst-plan.md I36)", () => {
  const asked = new Map([["/services/", "/services/"], ["/services", "/services/"]]);

  test("adds up a page asked slash or not, names a website as people know it, and leaves out reloads", () => {
    const journeys = journeysOf([
      { keys: ["/services/", "https://www.google.com/"], values: [40] },
      { keys: ["/services", "https://www.google.co.uk/"], values: [20] },
      { keys: ["/services/", "https://www.acme-shop.test/"], values: [25] },
      { keys: ["/services/", "https://acme-shop.test/services/"], values: [500] },
      { keys: ["/services/", "(not set)"], values: [15] },
      { keys: ["/about/", "https://www.google.com/"], values: [99] },
    ], asked, ADDRESSES, assistantOf, 5);
    expect([...journeys.keys()]).toEqual(["/services/"]);
    expect(journeys.get("/services/")).toEqual([
      { kind: "site", label: "Google", share: 60 },
      { kind: "page", label: "/", share: 25 },
      { kind: "none", label: "", share: 15 },
    ]);
  });

  test("keeps the biggest few, and nothing for a page with no views", () => {
    const rows = ["a", "b", "c", "d"].map((stem, index) => ({ keys: ["/services/", `https://${stem}.example.org/`], values: [index + 1] }));
    const journeys = journeysOf([...rows, { keys: ["/services/", "https://acme-shop.test/services"], values: [3] }], asked, ADDRESSES, assistantOf, 2);
    expect(journeys.get("/services/")?.map((journey) => journey.label)).toEqual(["d.example.org", "c.example.org"]);
    expect(journeysOf([{ keys: ["/services/", "https://www.google.com/"], values: [0] }], asked, ADDRESSES, assistantOf, 5).size).toBe(0);
  });
});

describe("each counted event on a row, by Google's own counts (conversions-back-in-time-plan.md BT1)", () => {
  // A row's events as asked (`EVENT_METRICS`): times, value, visits.
  const events = [
    { keys: ["/contact/", "contact"], values: [3, 0, 3] },
    { keys: ["/contact/", "generate_lead"], values: [5, 100, 2] },
  ];
  const main = [{ keys: ["/contact/"], values: [10, 6, 300, 20, 0, 0, 8, 5, 30] }];

  test("an event counts the times it happened, with its value", () => {
    const [row] = [...joinAsks("landing", [], main, events).values()].flat();
    expect([row.counts.get("contact"), row.counts.get("generate_lead"), row.values.get("generate_lead")]).toEqual([3, 5, 10_000]);
  });

  test("a key event Google counts once a visit counts the visits it happened in", () => {
    const [row] = [...joinAsks("landing", [], main, events, new Set(["generate_lead"])).values()].flat();
    expect([row.counts.get("contact"), row.counts.get("generate_lead")]).toEqual([3, 2]);
  });
});

describe("a kept part's rows with only what a read names (2026-11-04: long lists read whole ran out of 64MB)", () => {
  const row = (key: string, visits: number, events: Record<string, [count: number, value: number, visits: number, times: number]>): ListRow => {
    const out = { ...emptyRow(key), visits, engaged: Math.max(0, visits - 1), seconds: visits * 30, views: visits * 2, people: visits, newPeople: 1, length: visits * 60, converting: 1 };
    for (const [event, [count, value, eventVisits, times]] of Object.entries(events)) {
      out.counts.set(event, count);
      out.values.set(event, value);
      out.eventVisits!.set(event, eventVisits);
      out.eventTimes!.set(event, times);
    }
    return out;
  };
  const [part] = packList("landingChannel", [
    row("/a/", 9, { generate_lead: [2, 500, 2, 3], contact: [0, 0, 0, 0] }),
    row("/b/", 4, { generate_lead: [0, 0, 0, 0], contact: [1, 0, 1, 1] }),
    row("/c/", 0, {}),
  ], ["generate_lead", "contact"]);

  test("every event, its visits and times and its noughts give each row as it is kept", () => {
    expect(unpackPartOnly(part, { events: null, units: true, zeros: true })).toEqual(unpackPart(part));
  });

  test("only the events named, an event's nought left out, and no visits or times unless asked", () => {
    const rows = unpackPartOnly(part, { events: new Set(["generate_lead"]) });
    expect(rows.map((one) => [one.key, one.visits, one.engaged, one.views, one.converting, [...one.counts], [...one.values]])).toEqual([
      ["/a/", 9, 8, 18, 1, [["generate_lead", 2]], [["generate_lead", 500]]],
      ["/b/", 4, 3, 8, 1, [], []],
      ["/c/", 0, 0, 0, 1, [], []],
    ]);
    expect(rows.every((one) => one.eventVisits === undefined && one.eventTimes === undefined)).toBe(true);
    // Asked, each named event's visits and times come as kept, nought or not.
    const units = unpackPartOnly(part, { events: new Set(["contact"]), units: true });
    expect(units.map((one) => [[...one.eventVisits!], [...one.eventTimes!]])).toEqual([[[["contact", 0]], [["contact", 0]]], [[["contact", 1]], [["contact", 1]]], [[["contact", 0]], [["contact", 0]]]]);
    // Its noughts kept, a read can ask whether the list counts the event at all.
    expect(unpackPartOnly(part, { events: new Set(["contact", "scroll"]), zeros: true }).map((one) => [one.counts.has("contact"), one.counts.has("scroll")])).toEqual([[true, false], [true, false], [true, false]]);
  });

  test("only the rows whose key it keeps", () => {
    expect(unpackPartOnly(part, { events: new Set(), keep: (key) => key === "/b/" }).map((one) => [one.key, one.visits, one.counts.size])).toEqual([["/b/", 4, 0]]);
    expect(unpackPartOnly(part, { events: null, keep: () => false })).toEqual([]);
  });
});
