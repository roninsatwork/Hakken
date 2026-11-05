import { describe, expect, test } from "vitest";
import { routesFrom, type FlowAnswer, type RouteWords } from "./funnelRoutes";

const words: RouteWords = {
  shop: "Search and basket",
  notSorted: "Not sorted yet",
  otherPages: "Other pages",
  otherGroups: (count) => `${count} other groups`,
  otherPagesOf: "Other pages in this group",
  pageNotKnown: "Page not known",
  pagesNotTicked: "Pages not ticked",
  pagesNotTickedLower: "pages not ticked",
  visits: "Visits",
  visitsInBefore: "Visits in September",
  wentOn: "Went on",
  leftHere: "Left here",
  mostWent: "Most went here next",
  conversions: "Conversions",
  ofVisitsOn: (name) => `Of the visits on ${name}`,
  conversionsAfter: "Conversions after this",
  route: (from, to) => `${from} to ${to}`,
};

const node = (id: string, column: number, kind: string | null, address: string | null, visits: number, left = 0, conversions = 0, name: string | null = null, more = 0) =>
  ({ id, column, kind, name, more, address, visits, left, conversions });

const flow: FlowAnswer = {
  held: true, from: "2026-10-01", to: "2026-10-31", counting: true,
  nodes: [
    node("0:g:blog", 0, "blog", null, 1000, 800, 10, "Blog"),
    node("0:g:SHOP_PAGES", 0, "SHOP_PAGES", null, 200, 50, 5),
    node("1:~cart", 1, null, "/checkout/cart/", 150, 20, 7),
    node("1:~search", 1, null, "/catalogsearch/result/", 60),
    node("1:~search2", 1, null, "/catalogsearch/result/index/", 40),
    node("1:g:blog", 1, "blog", null, 120, 0, 0, "Blog"),
    node("2:~checkout", 2, null, "/checkout/", 90),
  ],
  bands: [
    { from: "0:g:blog", to: "1:g:blog", visits: 120, conversions: 0 },
    { from: "0:g:blog", to: "1:~cart", visits: 80, conversions: 3 },
    { from: "0:g:SHOP_PAGES", to: "1:~cart", visits: 70, conversions: 0 },
    { from: "0:g:SHOP_PAGES", to: "1:~search", visits: 60, conversions: 0 },
    { from: "0:g:SHOP_PAGES", to: "1:~search2", visits: 40, conversions: 0 },
    { from: "1:~cart", to: "2:~checkout", visits: 90, conversions: 0 },
  ],
  starts: ["~a"],
  onward: 350,
  left: 850,
  noPageVisits: 0,
  busy: { visitsAtLeast: 50, pages: 0, losing: 0, lost: 0, top: [] },
  ticked: [
    {
      key: "~a", id: "0:~a", address: "https://x.test/blog/guide/", visits: 400, visitsBefore: 300, left: 350, conversions: 4,
      routes: [
        { from: "0:~a", to: "1:g:blog", visits: 30, conversions: 0 },
        { from: "0:~a", to: "1:~cart", visits: 20, conversions: 1 },
        { from: "1:~cart", to: "2:~checkout", visits: 15, conversions: 1 },
      ],
    },
  ],
};

const second = { key: "~b", id: "0:~b", address: "https://x.test/shop/", visits: 100, visitsBefore: null, left: 40, conversions: 2, routes: [{ from: "0:~b", to: "1:~cart", visits: 60, conversions: 2 }, { from: "1:~cart", to: "2:~checkout", visits: 30, conversions: 2 }] };

describe("Funnel's route chart", () => {
  const built = routesFrom(flow, words);
  const box = (id: string) => built.boxes.find((one) => one.id === id)!;

  const inColumn = (built2: ReturnType<typeof routesFrom>, column: number) => built2.boxes.filter((one) => one.column === column).map((one) => one.id);

  test("one page ticked: the chart is that page and where its own visitors went, and nothing else", () => {
    expect(inColumn(built, 0)).toEqual(["0:~a"]);
    expect(box("0:~a")).toMatchObject({ name: "Guide", visits: 400, left: 350, before: 300 });
    // Only the boxes this page's visitors reached, and only their visits.
    expect(inColumn(built, 1).sort()).toEqual(["1:g:blog", "1:~cart"]);
    expect(box("1:~cart")).toMatchObject({ visits: 20, conversions: 1 });
    expect(box("1:g:blog").visits).toBe(30);
    expect(inColumn(built, 2)).toEqual(["2:~checkout"]);
    expect(built.boxes.some((one) => one.column === 0 && one.isGroup)).toBe(false);
    expect(built.boxes.find((one) => one.id === "1:~search")).toBeUndefined();
    expect(built.routes.every((one) => one.from === "0:~a" || one.from === "1:~cart")).toBe(true);
  });

  test("two pages ticked: both, with where their visitors went added together", () => {
    const two = routesFrom({ ...flow, ticked: [...flow.ticked, second] }, words);
    expect(inColumn(two, 0)).toEqual(["0:~a", "0:~b"]);
    expect(two.boxes.find((one) => one.id === "1:~cart")?.visits).toBe(80);
    expect(two.routes.find((one) => one.from === "1:~cart" && one.to === "2:~checkout")?.visits).toBe(45);
  });

  test("no page ticked: the whole website, which only the eye and Ask Hakken read", () => {
    const whole = routesFrom({ ...flow, ticked: [] }, words);
    expect(inColumn(whole, 0)).toEqual(["0:g:blog", "0:g:SHOP_PAGES"]);
    expect(whole.boxes.find((one) => one.id === "1:~cart")?.visits).toBe(150);
  });

  test("a route no more than rounds to nobody isn't drawn, nor the box it reached", () => {
    const thin = routesFrom({ ...flow, ticked: [{ ...flow.ticked[0], left: 399, routes: [{ from: "0:~a", to: "1:~cart", visits: 1, conversions: 0 }, { from: "0:~a", to: "1:g:blog", visits: 9, conversions: 0 }, { from: "1:~cart", to: "2:~checkout", visits: 1, conversions: 0 }] }] }, words);
    expect(thin.boxes.find((one) => one.id === "1:~cart")).toBeUndefined();
    expect(thin.boxes.find((one) => one.id === "2:~checkout")).toBeUndefined();
    expect(thin.boxes.filter((one) => one.column > 0)).toHaveLength(1);
  });

  test("whoever doesn't go on from a box left there, and each column holds no more than the one before", () => {
    const cart = built.nodes.find((one) => one.id === "1:~cart");
    expect(cart?.visits).toBeCloseTo(20);
    expect(cart?.left).toBeCloseTo(5);
    const inColumn = (column: number) => built.nodes.filter((one) => one.column === column).reduce((sum, one) => sum + one.visits, 0);
    expect(inColumn(1)).toBeLessThanOrEqual(400 - 350);
    expect(inColumn(2)).toBeLessThanOrEqual(inColumn(1));
  });

  test("the last column has no routes to say who left, so it takes that box's own share", () => {
    const deep = routesFrom({ ...flow, nodes: [...flow.nodes, node("3:~x", 3, null, "/x/", 10), node("4:~y", 4, null, "/y/", 100, 40)], ticked: [{ ...flow.ticked[0], left: 300, routes: [{ from: "0:~a", to: "1:~cart", visits: 100, conversions: 0 }, { from: "1:~cart", to: "2:~checkout", visits: 80, conversions: 0 }, { from: "2:~checkout", to: "3:~x", visits: 60, conversions: 0 }, { from: "3:~x", to: "4:~y", visits: 50, conversions: 0 }] }] }, words);
    const last = deep.nodes.find((one) => one.id === "4:~y");
    expect(last?.visits).toBeCloseTo(50);
    expect(last?.left).toBeCloseTo(20);
  });

  test("a page nobody went on from is one box alone", () => {
    const alone = routesFrom({ ...flow, ticked: [{ ...flow.ticked[0], left: 400, routes: [] }] }, words);
    expect(alone.boxes.map((one) => one.id)).toEqual(["0:~a"]);
    expect(alone.bands).toEqual([]);
  });

  const whole = routesFrom({ ...flow, ticked: [] }, words);

  test("two addresses that mean the same to a person are one box", () => {
    expect(whole.boxes.filter((one) => one.column === 1 && one.name === "Search results")).toHaveLength(1);
    expect(whole.boxes.find((one) => one.id === "1:~search")?.visits).toBe(100);
    expect(whole.routes.find((one) => one.from === "0:g:SHOP_PAGES" && one.to === "1:~search")?.visits).toBe(100);
  });

  test("groups are said in plain words, and a grey edge marks them", () => {
    expect(whole.boxes.find((one) => one.id === "0:g:SHOP_PAGES")?.name).toBe("Search and basket");
    expect(whole.nodes.find((one) => one.id === "0:g:blog")?.ending).toBe("uncounted");
    expect(built.nodes.find((one) => one.id === "1:g:blog")?.ending).toBe("uncounted");
    expect(built.nodes.find((one) => one.id === "1:~cart")?.ending).toBeUndefined();
  });

  test("every band fits its box when routes add up to more than went on, and the hover says what's drawn, so nothing reads as over 100%", () => {
    const tight = routesFrom({ ...flow, ticked: [], nodes: [node("0:g:a", 0, "a", null, 100, 80, 0, "A"), node("1:~x", 1, null, "/x", 50), node("1:~y", 1, null, "/y", 50)], bands: [{ from: "0:g:a", to: "1:~x", visits: 50, conversions: 0 }, { from: "0:g:a", to: "1:~y", visits: 50, conversions: 0 }] }, words);
    expect(tight.bands.reduce((sum, one) => sum + one.visits, 0)).toBeCloseTo(20);
    expect(tight.bands[0].readout?.lines[0].value).toBe("10");
    expect(tight.nodes.find((one) => one.id === "1:~x")?.visits).toBeCloseTo(10);
  });

  test("a route between two named pages is Google's own, never more than went on from the first", () => {
    const named = routesFrom({ ...flow, nodes: [node("0:g:a", 0, "a", null, 500, 100, 0, "A"), node("1:~x", 1, null, "/x", 300)], bands: [], ticked: [{ key: "~p", id: "0:~p", address: "https://x.test/p/", visits: 100, visitsBefore: null, left: 60, conversions: 0, routes: [{ from: "0:~p", to: "1:~x", visits: 70, conversions: 0 }] }] }, words);
    const band = named.bands.find((one) => one.from === "0:~p");
    expect(band?.readout?.lines[0].value).toBe("40");
    expect(band?.readout?.lines[1].value).toBe("40%");
  });

  test("a named second page keeps Google's figure, and a group's is what could have reached it", () => {
    const groupBox = routesFrom({ ...flow, ticked: [], nodes: [node("0:g:a", 0, "a", null, 100, 80, 0, "A"), node("1:g:a", 1, "a", null, 500, 0, 0, "A"), node("1:~x", 1, null, "/x", 50)], bands: [{ from: "0:g:a", to: "1:g:a", visits: 15, conversions: 0 }, { from: "0:g:a", to: "1:~x", visits: 5, conversions: 0 }] }, words);
    expect(groupBox.figureOf("1:g:a")).toBe("15");
    expect(groupBox.figureOf("1:~x")).toBe("50");
  });

  test("the chart is sized to what's on it", () => {
    expect(built.scale).toBeCloseTo(0.45);
    const big = routesFrom({ ...flow, ticked: [{ ...flow.ticked[0], visits: 4000 }] }, words);
    expect(big.scale).toBeCloseTo(320 / 4000);
  });

  test("a hover says what a person needs, and only a page says who it's compared with", () => {
    const lines = built.nodes.find((one) => one.id === "0:~a")?.readout?.lines.map((line) => line.label);
    expect(lines).toEqual(["Visits", "Visits in September", "Went on", "Left here", "Most went here next", "Conversions"]);
  });
});
