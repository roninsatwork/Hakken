import { describe, expect, test } from "vitest";
import { FLOW_NODES, GROUPS_BY_NAME, OTHER_GROUPS, OWN_TENTHS, buildFlow, flowChart, groupNode, holdToViews, isCurrentFlow, type KeptFlowRow, type Route } from "./landingFlow";

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

  describe("a landing page's own chart, five pages deep", () => {
    const deep = [
      route("/", "", "/", 100), route("/", "/", "/a/", 40), route("/", "/a/", "/b/", 20), route("/", "/b/", "/c/", 10), route("/", "/c/", "/d/", 5),
      // A busy page's steps are all reachable early: /a/ to /c/ too, which used to use up /c/'s step by the third page.
      route("/", "/", "/c/", 10),
      route("/x/", "", "/x/", 50), route("/x/", "/x/", "/a/", 30), route("/x/", "/a/", "/b/", 15),
    ];
    const wentOn = [
      { landing: "/", before: "/", visits: 50 }, { landing: "/", before: "/a/", visits: 20 }, { landing: "/", before: "/b/", visits: 10 }, { landing: "/", before: "/c/", visits: 5 },
      { landing: "/x/", before: "/x/", visits: 30 }, { landing: "/x/", before: "/a/", visits: 15 },
    ];
    const built = buildFlow(deep, wentOn, kindOf);
    const own = (landing: string) => built.routes.filter((row) => row.landing === landing);
    const visitsOf = (row: { column: number; visits: number }) => (row.column === 1 ? row.visits : row.visits / OWN_TENTHS);

    test("the second page is Google's own figures", () => {
      expect(own("/").filter((row) => row.column === 1).map((row) => [row.to, row.visits]).sort()).toEqual([["/a/", 40], ["/c/", 10]]);
    });

    test("it goes all five pages deep, each column no more than the one before", () => {
      const inColumn = (column: number) => own("/").filter((row) => row.column === column).reduce((sum, row) => sum + visitsOf(row), 0);
      for (const column of [2, 3, 4]) expect(inColumn(column), `column ${column}`).toBeGreaterThan(0);
      expect(inColumn(2)).toBeLessThanOrEqual(inColumn(1));
      expect(inColumn(3)).toBeLessThanOrEqual(inColumn(2));
      expect(inColumn(4)).toBeLessThanOrEqual(inColumn(3));
    });

    test("only that page's own steps are used", () => {
      // /c/ and /d/ are where the other page's visitors went.
      expect(own("/x/").some((row) => ["/c/", "/d/"].includes(row.to))).toBe(false);
      expect(own("/x/").some((row) => row.column === 2 && row.from === "/a/" && row.to === "/b/")).toBe(true);
    });

    test("no box sends on more than reached it", () => {
      for (const column of [2, 3]) {
        const into = new Map<string, number>();
        for (const row of own("/").filter((one) => one.column === column)) into.set(row.to, (into.get(row.to) ?? 0) + visitsOf(row));
        for (const [box, visits] of into) {
          const out = own("/").filter((row) => row.column === column + 1 && row.from === box).reduce((sum, row) => sum + visitsOf(row), 0);
          expect(out, `${column} ${box}`).toBeLessThanOrEqual(visits + 0.2);
        }
      }
    });

    test("a page with no row of who went on takes its landing page's own rate, not the whole website's", () => {
      const cut = buildFlow([
        route("/big/", "", "/big/", 100), route("/big/", "/big/", "/a/", 50), route("/big/", "/big/", "/b/", 50),
        route("/big/", "/a/", "/c/", 40), route("/big/", "/b/", "/d/", 40),
        // Elsewhere, /b/ loses nearly everyone: a low rate that isn't this page's.
        route("/z/", "", "/z/", 1000), route("/z/", "/z/", "/b/", 1000),
      ], [{ landing: "/big/", before: "/big/", visits: 90 }, { landing: "/big/", before: "/a/", visits: 45 }, { landing: "/z/", before: "/z/", visits: 1000 }, { landing: "/z/", before: "/b/", visits: 10 }], kindOf);
      const third = cut.routes.filter((row) => row.landing === "/big/" && row.column === 2);
      const via = (from: string) => third.filter((row) => row.from === from).reduce((sum, row) => sum + row.visits / OWN_TENTHS, 0);
      expect(via("/b/")).toBeCloseTo(via("/a/"), 0);
      expect(via("/b/")).toBeGreaterThan(30);
    });

    test("a page nobody went on from has no chart past itself", () => {
      const none = buildFlow([route("/lost/", "", "/lost/", 10), route("/lost/", "/lost/", "/a/", 3)], [], kindOf);
      expect(none.routes.filter((row) => row.column > 1)).toEqual([]);
    });
  });

  describe("how many are still there at each page", () => {
    const routesOf = () => [1, 2, 3, 4].map((column) => ({ to: `${column}:x`, visits: 80, conversions: 8 }));

    test("each column is held to Google's own views for the page", () => {
      // 80 stayed and saw 320 more pages between them: three in four go on at each page.
      const routes = routesOf();
      holdToViews(routes, 80, 320);
      expect(routes.map((one) => one.visits)).toEqual([80, 60, 45, 33.75]);
      expect(routes[1].conversions).toBe(6);
    });

    test("a column is never raised: the routes may know of fewer than the views, as on a page of reloads", () => {
      const routes = [{ to: "1:x", visits: 34, conversions: 0 }, { to: "2:x", visits: 5, conversions: 0 }];
      holdToViews(routes, 34, 321);
      expect(routes[1].visits).toBe(5);
    });

    test("no views to go on, and nothing changes", () => {
      const routes = routesOf();
      holdToViews(routes, 80, 0);
      expect(routes.map((one) => one.visits)).toEqual([80, 80, 80, 80]);
    });

    test("views that only just cover those who stayed: nobody saw a third page", () => {
      const routes = routesOf();
      holdToViews(routes, 80, 80);
      expect(routes.slice(1).map((one) => one.visits)).toEqual([0, 0, 0]);
    });
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
    expect(chart.boxOf(0, groupNode(`k${GROUPS_BY_NAME + 2}`))).toBe(groupNode(OTHER_GROUPS));
    expect(chart.boxOf(0, groupNode("k0"))).toBe(groupNode("k0"));
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
