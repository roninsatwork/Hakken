import { describe, expect, test } from "vitest";
import { FLOW_NODES, MORE, buildFlow, flowChart, type KeptFlowRow, type Route } from "./landingFlow";

/**
 * The website's flow from its landing pages (docs/plans/active/landing-pages-flow-plan.md
 * LF2, LF5, §3b), from routes shaped as ronins.co.uk's were on 14 Oct 2026.
 */

const none = new Map<string, number>();
const route = (landing: string, before: string, page: string, visits: number, counts: Map<string, number> = none): Route => ({ landing, before, page, visits, counts });

/** The kept rows read back as the reads give them: each conversion counted. */
const keptOf = (rows: ReturnType<typeof buildFlow>["flow"]): KeptFlowRow[] =>
  rows.map((row) => ({ parts: row.parts, visits: row.visits, times: row.times, conversions: [...row.counts.values()].reduce((all, count) => all + count, 0) }));

describe("the website's flow from its landing pages", () => {
  const routes = [
    // Visits landing on / from Google, one converting there; then on to /about-us/ and /case-study/.
    route("/", "", "/", 155, new Map([["contact", 1]])),
    route("/", "/", "/about-us/", 43),
    route("/", "/", "/case-study/", 41),
    // From /about-us/, in the visits that landed on /, on to /ai-consultancy/ — converting there.
    route("/", "/about-us/", "/ai-consultancy/", 6, new Map([["contact", 1]])),
    // /ai-agency/'s own visits: most leave; a few go to /case-study/.
    route("/ai-agency/", "", "/ai-agency/", 138, new Map([["contact", 4]])),
    route("/ai-agency/", "/ai-agency/", "/case-study/", 22),
    // A view from elsewhere in the middle of a visit is not a step from its landing page.
    route("/ai-agency/", "", "/about-us/", 3),
  ];
  const onward = [
    { landing: "/", before: "/", visits: 46 },
    { landing: "/", before: "/about-us/", visits: 20 },
    { landing: "/ai-agency/", before: "/ai-agency/", visits: 32 },
  ];

  test("each landing page: its visits, those that went on counted once a visit, and the page most opened next", () => {
    const built = buildFlow(routes, onward);
    expect(built.onward).toEqual([
      { landing: "/", next: "/about-us/", visits: 46, times: 43 },
      { landing: "/ai-agency/", next: "/case-study/", visits: 32, times: 22 },
    ]);
  });

  test("the chart: what left each landing page, the routes on, and conversions where they were made", () => {
    const chart = flowChart(keptOf(buildFlow(routes, onward).flow));
    const node = (id: string) => chart.nodes.find((one) => one.id === id)!;
    // 155 landed on /, 46 went on: 109 left. 138 on /ai-agency/, 32 went on: 106 left.
    expect(node("0:/")).toMatchObject({ visits: 155, left: 109, conversions: 1 });
    expect(node("0:/ai-agency/")).toMatchObject({ visits: 138, left: 106, conversions: 4 });
    // /case-study/ next from both landing pages; /about-us/ from / alone, 20 of its 43 going on.
    expect(node("1:/case-study/")).toMatchObject({ visits: 63 });
    expect(node("1:/about-us/")).toMatchObject({ visits: 43, left: 23 });
    // The conversion on /ai-consultancy/, after /about-us/, sits on that route and that page.
    expect(chart.bands.find((band) => band.from === "1:/about-us/" && band.to === "2:/ai-consultancy/")).toMatchObject({ visits: 6, conversions: 1, landings: ["/"] });
    expect(node("2:/ai-consultancy/").conversions).toBe(1);
    expect(chart.columns[0]).toEqual({ visits: 293, left: 215, conversions: 5 });
  });

  test("five pages a column by name, the rest one box that says how many it holds", () => {
    const many = Array.from({ length: FLOW_NODES + 3 }, (_, at) => route(`/p${at}/`, "", `/p${at}/`, 100 - at));
    const chart = flowChart(keptOf(buildFlow(many, []).flow));
    const landing = chart.nodes.filter((node) => node.column === 0);
    expect(landing).toHaveLength(FLOW_NODES + 1);
    expect(landing.at(-1)).toMatchObject({ page: MORE, more: 3, visits: 93 + 94 + 95 });
    // With nobody going on, every landing page's visits left there.
    expect(chart.columns[0].left).toBe(chart.columns[0].visits);
  });
});
