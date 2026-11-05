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
    { key: "~a", id: "0:~a", address: "https://x.test/blog/guide/", group: "0:g:blog", visits: 400, visitsBefore: 300, left: 350, conversions: 4, routes: [{ to: "1:g:blog", visits: 30, conversions: 0 }, { to: "1:~cart", visits: 20, conversions: 1 }] },
  ],
};

describe("Funnel's route chart", () => {
  const built = routesFrom(flow, words);
  const box = (id: string) => built.boxes.find((one) => one.id === id)!;
  const route = (from: string, to: string) => built.routes.find((one) => one.from === from && one.to === to);

  test("a ticked page comes out of its group, so the first column still adds up", () => {
    expect(box("0:~a")).toMatchObject({ name: "Guide", visits: 400, left: 350, before: 300 });
    expect(box("0:g:blog")).toMatchObject({ visits: 600, left: 450, conversions: 6 });
    const first = built.boxes.filter((one) => one.column === 0);
    expect(first.reduce((sum, one) => sum + one.visits, 0)).toBe(1200);
  });

  test("its routes come out of its group's routes", () => {
    expect(route("0:g:blog", "1:~cart")).toMatchObject({ visits: 60, conversions: 2 });
    expect(route("0:~a", "1:~cart")).toMatchObject({ visits: 20, conversions: 1 });
    expect(route("0:g:blog", "1:g:blog")?.visits).toBe(90);
  });

  test("a ticked page lists first, then the groups", () => {
    expect(built.nodes.filter((one) => one.column === 0).map((one) => one.id)).toEqual(["0:~a", "0:g:blog", "0:g:SHOP_PAGES"]);
  });

  test("two addresses that mean the same to a person are one box", () => {
    expect(built.boxes.filter((one) => one.column === 1 && one.name === "Search results")).toHaveLength(1);
    expect(box("1:~search").visits).toBe(100);
    expect(route("0:g:SHOP_PAGES", "1:~search")?.visits).toBe(100);
  });

  test("groups are said in plain words, and a grey edge marks them", () => {
    expect(box("0:g:SHOP_PAGES").name).toBe("Search and basket");
    expect(built.nodes.find((one) => one.id === "0:g:blog")?.ending).toBe("uncounted");
    expect(built.nodes.find((one) => one.id === "1:~cart")?.ending).toBeUndefined();
  });

  test("every band fits its box when routes add up to more than went on, and the hover says what's drawn, so nothing reads as over 100%", () => {
    const tight = routesFrom({ ...flow, ticked: [], nodes: [node("0:g:a", 0, "a", null, 100, 80, 0, "A"), node("1:~x", 1, null, "/x", 50), node("1:~y", 1, null, "/y", 50)], bands: [{ from: "0:g:a", to: "1:~x", visits: 50, conversions: 0 }, { from: "0:g:a", to: "1:~y", visits: 50, conversions: 0 }] }, words);
    expect(tight.bands.reduce((sum, one) => sum + one.visits, 0)).toBeCloseTo(20);
    expect(tight.bands[0].readout?.lines[0].value).toBe("10");
    expect(tight.nodes.find((one) => one.id === "1:~x")?.visits).toBeCloseTo(10);
  });

  test("a route between two named pages is Google's own, never more than went on from the first", () => {
    const named = routesFrom({ ...flow, nodes: [node("0:g:a", 0, "a", null, 500, 100, 0, "A"), node("1:~x", 1, null, "/x", 300)], bands: [], ticked: [{ key: "~p", id: "0:~p", address: "https://x.test/p/", group: "0:g:a", visits: 100, visitsBefore: null, left: 60, conversions: 0, routes: [{ to: "1:~x", visits: 70, conversions: 0 }] }] }, words);
    const band = named.bands.find((one) => one.from === "0:~p");
    expect(band?.readout?.lines[0].value).toBe("40");
    expect(band?.readout?.lines[1].value).toBe("40%");
  });

  test("a named second page keeps Google's figure, and a group's is what could have reached it", () => {
    const groupBox = routesFrom({ ...flow, ticked: [], nodes: [node("0:g:a", 0, "a", null, 100, 80, 0, "A"), node("1:g:a", 1, "a", null, 500, 0, 0, "A"), node("1:~x", 1, null, "/x", 50)], bands: [{ from: "0:g:a", to: "1:g:a", visits: 15, conversions: 0 }, { from: "0:g:a", to: "1:~x", visits: 5, conversions: 0 }] }, words);
    expect(groupBox.figureOf("1:g:a")).toBe("15");
    expect(groupBox.figureOf("1:~x")).toBe("50");
  });

  test("one scale, whatever is ticked", () => {
    expect(routesFrom({ ...flow, ticked: [] }, words).scale).toBe(built.scale);
  });

  test("a hover says what a person needs, and only a page says who it's compared with", () => {
    const lines = built.nodes.find((one) => one.id === "0:~a")?.readout?.lines.map((line) => line.label);
    expect(lines).toEqual(["Visits", "Visits in September", "Went on", "Left here", "Most went here next", "Conversions"]);
    expect(built.nodes.find((one) => one.id === "0:g:blog")?.readout?.detail).toBe("Pages not ticked");
  });
});
