import { describe, expect, test } from "vitest";
import { FLOW_NODES, GROUPS_BY_NAME, OTHER_GROUPS, buildFlow, flowChart, groupNode, isCurrentFlow, type KeptFlowRow, type Route } from "./landingFlow";

/**
 * The website's flow from its landing pages (docs/plans/active/funnel-way-1-plan-2026-11-05.md, step 1), from routes shaped
 * as ronins.co.uk's were on 14 Oct 2026.
 */

const none = new Map<string, number>();
const route = (landing: string, before: string, page: string, visits: number, counts: Map<string, number> = none): Route => ({ landing, before, page, visits, counts });
const kindOf = (page: string) => (page.startsWith("/blog") ? "blog" : page.startsWith("/shop") ? "shop" : "other");

/** The kept rows read back as the reads give them: each conversion counted. */
const keptOf = (rows: ReturnType<typeof buildFlow>["flow"]): KeptFlowRow[] =>
  rows.map((row) => ({ parts: row.parts, visits: row.visits, times: row.times, conversions: [...row.counts.values()].reduce((all, count) => all + count, 0) }));

const routes = [
  route("/", "", "/", 155, new Map([["contact", 1]])),
  route("/", "/", "/about/", 43),
  route("/", "/", "/case/", 41),
  // A reload is not a step.
  route("/", "/", "/", 90),
  route("/", "/about/", "/consult/", 6, new Map([["contact", 1]])),
  route("/agency/", "", "/agency/", 138, new Map([["contact", 4]])),
  route("/agency/", "/agency/", "/case/", 22),
  // A view from elsewhere in the middle of a visit is not a step from its landing page.
  route("/agency/", "", "/about/", 3),
];
const onward = [
  { landing: "/", before: "/", visits: 46 },
  { landing: "/", before: "/about/", visits: 20 },
  { landing: "/agency/", before: "/agency/", visits: 32 },
];

describe("what the flow keeps", () => {
  test("each landing page: those that went on counted once a visit, and the page most opened next", () => {
    expect(buildFlow(routes, onward, kindOf).onward).toEqual([
      { landing: "/", next: "/about/", visits: 46, times: 43 },
      // 32 went on by Google's count, but only 22 took a route: the rest were reloads.
      { landing: "/agency/", next: "/case/", visits: 22, times: 22 },
    ]);
  });

  test("its routes are joined up from the landing page outwards, each step used once, and reloads left out", () => {
    const steps = [
      ...routes,
      // /case/ reached second, then the step back to /about/ and on: /about/ -> /consult/ is used at the third page only.
      route("/", "/case/", "/about/", 5),
    ];
    const chart = flowChart(keptOf(buildFlow(steps, onward, kindOf).flow), []);
    const node = (id: string) => chart.nodes.find((one) => one.id === id)!;
    expect(node("1:/case/").visits).toBe(63);
    expect(node("1:/about/").visits).toBe(43);
    expect(node("2:/consult/").visits).toBe(6);
    expect(node("2:/about/").visits).toBe(5);
    expect(chart.nodes.find((one) => one.id === "1:/")).toBeUndefined();
  });

  test("five columns: a route four steps on is kept, a fifth step isn't", () => {
    const line = [
      route("/a", "", "/a", 100),
      route("/a", "/a", "/b", 90),
      route("/a", "/b", "/c", 80),
      route("/a", "/c", "/d", 70),
      route("/a", "/d", "/e", 60),
      route("/a", "/e", "/f", 50),
    ];
    const chart = flowChart(keptOf(buildFlow(line, [{ landing: "/a", before: "/a", visits: 90 }], kindOf).flow), []);
    expect(chart.nodes.find((one) => one.id === "4:/e")?.visits).toBe(60);
    expect(chart.nodes.some((one) => one.id.endsWith("/f"))).toBe(false);
  });

  test("ten pages a column by name, and every other page in its group", () => {
    const many = [route("/", "", "/", 500), ...Array.from({ length: FLOW_NODES + 3 }, (_, at) => route("/", "/", `/blog/p${at}`, 100 - at))];
    const built = buildFlow(many, [{ landing: "/", before: "/", visits: 400 }], kindOf);
    const chart = flowChart(keptOf(built.flow), []);
    const second = chart.nodes.filter((node) => node.column === 1);
    expect(second.filter((node) => !node.node.startsWith("g:"))).toHaveLength(FLOW_NODES);
    expect(second.find((node) => node.node === groupNode("blog"))?.visits).toBe(88 + 89 + 90);
  });

  test("a big website's smallest routes, added up by group, still reach the chart", () => {
    const folded = [
      ...routes,
      route("/", "/", groupNode("shop"), 30),
      route("/", groupNode("shop"), groupNode("shop"), 12),
      route("/", "/about/", "/shop/x", 3),
    ];
    const chart = flowChart(keptOf(buildFlow(folded, onward, kindOf).flow), []);
    expect(chart.nodes.find((one) => one.id === `1:${groupNode("shop")}`)?.visits).toBe(30);
    // A step inside one group is a real step between two pages: it's kept.
    expect(chart.bands.find((band) => band.from === `1:${groupNode("shop")}` && band.to === `2:${groupNode("shop")}`)?.visits).toBe(12);
  });

  test("a visit went on only if it took a route: a reload looks like going on, and isn't", () => {
    const built = buildFlow([route("/blog/a", "", "/blog/a", 100), route("/blog/a", "/blog/a", "/blog/a", 50), route("/blog/a", "/blog/a", "/b", 10)], [{ landing: "/blog/a", before: "/blog/a", visits: 60 }], kindOf);
    expect(built.onward[0].visits).toBe(10);
  });

  test("a landing page keeps its routes against the chart's own boxes, with their conversions", () => {
    const built = buildFlow([...routes, route("/", "/", "/case/", 2, new Map([["contact", 2]]))], onward, kindOf);
    const own = built.routes.filter((row) => row.landing === "/");
    expect(own.find((row) => row.to === "/case/")).toMatchObject({ visits: 43 });
    expect(own.find((row) => row.to === "/case/")?.counts.get("contact")).toBe(2);
  });

  test("the first column's routes run from each landing page's group", () => {
    const chart = flowChart(keptOf(buildFlow(routes, onward, kindOf).flow), [{ kind: "other", visits: 293, left: 215, conversions: 5 }]);
    expect(chart.bands.find((band) => band.from === `0:${groupNode("other")}` && band.to === "1:/case/")?.visits).toBe(63);
    expect(chart.nodes.find((node) => node.id === `0:${groupNode("other")}`)).toMatchObject({ visits: 293, left: 215, conversions: 5 });
  });

  test("the number that left a page further along: its visits, less the share that went on from it", () => {
    const chart = flowChart(keptOf(buildFlow(routes, onward, kindOf).flow), []);
    expect(chart.nodes.find((one) => one.id === "1:/about/")).toMatchObject({ visits: 43, left: 23 });
  });

  test("a group's own pages say how many went on from it", () => {
    const steps = [route("/", "", "/", 100), route("/", "/", "/blog/a", 40), route("/", "/", groupNode("blog"), 10)];
    const chart = flowChart(keptOf(buildFlow(steps, [{ landing: "/", before: "/blog/a", visits: 20 }, { landing: "/", before: "/", visits: 50 }], (page) => (page === "/blog/a" ? "blog" : "other")).flow), []);
    // /blog/a keeps its name in this small column: half of its 40 went on.
    expect(chart.nodes.find((one) => one.id === "1:/blog/a")).toMatchObject({ visits: 40, left: 20 });
    // 20 went on from the group's 50 visits: a group's routes added up by group count as arrivals, so 10 go on 4.
    expect(chart.nodes.find((one) => one.id === `1:${groupNode("blog")}`)).toMatchObject({ visits: 10, left: 6 });
  });
});

describe("reading it back", () => {
  test("eight groups by name and the rest together, in each column", () => {
    const sizes = Array.from({ length: GROUPS_BY_NAME + 3 }, (_, at) => ({ kind: `k${at}`, visits: 100 - at, left: 10, conversions: 1 }));
    const chart = flowChart([{ parts: ["n", "1", "/a"], visits: 1, times: 0, conversions: 0 }], sizes);
    const first = chart.nodes.filter((node) => node.column === 0);
    expect(first).toHaveLength(GROUPS_BY_NAME + 1);
    expect(first.at(-1)).toMatchObject({ node: groupNode(OTHER_GROUPS), more: 3, visits: 92 + 91 + 90, left: 30 });
    expect(chart.firstColumn.get(`k${GROUPS_BY_NAME + 2}`)).toBe(groupNode(OTHER_GROUPS));
    expect(chart.firstColumn.get("k0")).toBe(groupNode("k0"));
  });

  test("a column lists its pages first, then its groups, then the smaller groups", () => {
    const rows: KeptFlowRow[] = [
      { parts: ["n", "1", groupNode("big")], visits: 900, times: 0, conversions: 0 },
      { parts: ["n", "1", "/small"], visits: 5, times: 0, conversions: 0 },
    ];
    expect(flowChart(rows, []).nodes.map((node) => node.node)).toEqual(["/small", groupNode("big")]);
  });

  test("a flow kept in the old shape reads as not collected yet", () => {
    expect(isCurrentFlow([{ parts: ["a", "/"] }, { parts: ["b", "/", "/x"] }])).toBe(false);
    expect(isCurrentFlow([{ parts: ["n", "1", "/x"] }])).toBe(true);
  });
});
