import { FLOW_COLUMNS, OTHER_GROUPS } from "./landingFlow";
import { NOT_SORTED_KIND } from "./pageKinds";
import { pageName } from "./pageNames";
import { SHOP_PAGES_KIND } from "./shopPages";

/**
 * Funnel's boxes and routes, from what's saved and what's ticked (funnel-way-1-plan-2026-11-05.md, steps 3 and 6). One set of
 * figures for the chart (`funnelRoutes.ts`), the eye (`funnelFigures`) and Ask Hakken, so the three can't disagree. With pages
 * ticked it's those pages alone, all five pages deep, from their own routes: what's on the chart is what's ticked (Anthony,
 * 2026-11-05: "i have 1 item selected on the table and the funnel is full"). With none, it's the whole website.
 */
export type FlowForBoxes = {
  nodes: ReadonlyArray<{ id: string; column: number; kind: string | null; name: string | null; more: number; address: string | null; visits: number; left: number; conversions: number }>;
  bands: ReadonlyArray<{ from: string; to: string; visits: number; conversions: number }>;
  ticked: ReadonlyArray<{ key: string; id: string; address: string; visits: number; visitsBefore: number | null; left: number; conversions: number; routes: ReadonlyArray<{ from: string; to: string; visits: number; conversions: number }> }>;
};

/** The names a box takes that aren't a page's or a Classification's own. */
export type BoxNames = {
  shop: string;
  notSorted: string;
  otherPages: string;
  otherGroups: (count: number) => string;
  pageNotKnown: string;
};

export type RouteBox = { id: string; column: number; kind: string | null; name: string; address: string | null; visits: number; left: number; conversions: number; isGroup: boolean; before: number | null };
export type FlowRoute = { from: string; to: string; visits: number; conversions: number };

export function flowBoxes(flow: FlowForBoxes, words: BoxNames) {
  const hasClassifications = flow.nodes.some((node) => node.name !== null);
  const groupName = (kind: string, name: string | null, more: number) => {
    if (kind === OTHER_GROUPS) return words.otherGroups(more);
    if (kind === SHOP_PAGES_KIND) return words.shop;
    if (kind === NOT_SORTED_KIND) return hasClassifications ? words.notSorted : words.otherPages;
    return name ?? kind;
  };

  // Two addresses that are the same thing to a person are one box: both search results addresses, say.
  const boxes = new Map<string, RouteBox>();
  const canonical = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const node of flow.nodes) {
    const isGroup = node.kind !== null;
    const name = isGroup ? groupName(node.kind ?? "", node.name, node.more) : pageName(node.address ?? "");
    const key = `${node.column}\u0000${name}`;
    const held = byName.get(key);
    if (held) {
      const box = boxes.get(held)!;
      box.visits += node.visits;
      box.left += node.left;
      box.conversions += node.conversions;
      canonical.set(node.id, held);
      continue;
    }
    byName.set(key, node.id);
    canonical.set(node.id, node.id);
    boxes.set(node.id, { id: node.id, column: node.column, kind: node.kind, name, address: node.address, visits: node.visits, left: node.left, conversions: node.conversions, isGroup, before: null });
  }
  const routeMap = new Map<string, FlowRoute>();
  const addRoute = (from: string, to: string, visits: number, conversions: number) => {
    const key = `${from}>${to}`;
    const held = routeMap.get(key) ?? { from, to, visits: 0, conversions: 0 };
    held.visits += visits;
    held.conversions += conversions;
    routeMap.set(key, held);
  };
  const ticked = [...flow.ticked].sort((left, right) => right.visits - left.visits);
  const tickedIds = new Set(ticked.map((page) => page.id));
  const home = (id: string) => canonical.get(id) ?? id;
  let inOrder: RouteBox[];
  if (ticked.length === 0) {
    for (const band of flow.bands) addRoute(home(band.from), home(band.to), band.visits, band.conversions);
    inOrder = flow.nodes.flatMap((node) => (home(node.id) === node.id ? [boxes.get(node.id)!] : []));
  } else {
    for (const page of ticked) {
      for (const route of page.routes) addRoute(route.from === page.id ? page.id : home(route.from), home(route.to), route.visits, route.conversions);
    }
    // A box holds only the visits that reached it from these pages.
    const reached = new Map<string, { visits: number; conversions: number }>();
    for (const route of routeMap.values()) {
      const held = reached.get(route.to) ?? { visits: 0, conversions: 0 };
      held.visits += route.visits;
      held.conversions += route.conversions;
      reached.set(route.to, held);
    }
    const rank = (box: RouteBox) => (!box.isGroup ? 0 : box.kind === OTHER_GROUPS ? 2 : 1);
    const beyond = [...reached.entries()].flatMap(([id, figures]) => {
      const whole = boxes.get(id);
      if (!whole) return [];
      const shareLeft = whole.visits > 0 ? whole.left / whole.visits : 0;
      return [{ ...whole, visits: figures.visits, left: Math.round(figures.visits * shareLeft), conversions: figures.conversions }];
    }).sort((one, other) => one.column - other.column || rank(one) - rank(other) || other.visits - one.visits);
    inOrder = [
      ...ticked.map((page): RouteBox => ({ id: page.id, column: 0, kind: null, name: page.key === "(not set)" ? words.pageNotKnown : pageName(page.address), address: page.key === "(not set)" ? null : page.address.replace(/^https?:\/\/[^/]+/i, "") || "/", visits: page.visits, left: page.left, conversions: page.conversions, isGroup: false, before: page.visitsBefore })),
      ...beyond,
    ];
  }
  let routes = [...routeMap.values()].filter((route) => route.visits > 0);

  const byIdOf = new Map<string, RouteBox>();
  for (const box of inOrder) byIdOf.set(box.id, box);
  // A visit that opens two pages takes both routes, so a box's routes can add up to more than went on from it. Drawn, they're
  // fitted to what went on, so every band fits its box. The figures said stay the real ones.
  const drawnVisits = new Map(inOrder.map((box) => [box.id, box.visits]));
  const drawnLeft = new Map(inOrder.map((box) => [box.id, box.left]));
  const drawnRoute = new Map<FlowRoute, number>();
  for (let column = 0; column <= Math.max(0, ...inOrder.map((box) => box.column)); column += 1) {
    for (const box of inOrder.filter((one) => one.column === column)) {
      if (column > 0) {
        const into = routes.filter((route) => route.to === box.id).reduce((sum, route) => sum + (drawnRoute.get(route) ?? 0), 0);
        drawnVisits.set(box.id, into);
        drawnLeft.set(box.id, box.visits > 0 ? (box.left / box.visits) * into : 0);
      }
      const leaving = routes.filter((route) => route.from === box.id);
      const sum = leaving.reduce((all, route) => all + route.visits, 0);
      // A ticked page's own routes say who went on, so whoever didn't left there. The last column has no routes to say it: its own share.
      const lastOfAll = column === FLOW_COLUMNS - 1;
      const room = ticked.length > 0 && column > 0 && !lastOfAll ? (drawnVisits.get(box.id) ?? 0) : Math.max(0, (drawnVisits.get(box.id) ?? 0) - (drawnLeft.get(box.id) ?? 0));
      const fit = sum > room && sum > 0 ? room / sum : 1;
      for (const route of leaving) drawnRoute.set(route, route.visits * fit);
      if (ticked.length > 0 && column > 0 && !lastOfAll) {
        const stayed = sum * fit;
        drawnLeft.set(box.id, Math.max(0, (drawnVisits.get(box.id) ?? 0) - stayed));
        const into = drawnVisits.get(box.id) ?? 0;
        box.left = into > 0 ? Math.round(box.visits * ((drawnLeft.get(box.id) ?? 0) / into)) : 0;
      }
    }
  }

  // What rounds to nobody isn't drawn: a ticked page's chart only shows where its visitors went.
  if (ticked.length > 0) {
    routes = routes.filter((route) => (drawnRoute.get(route) ?? 0) >= 0.5);
    inOrder = inOrder.filter((box) => box.column === 0 || (drawnVisits.get(box.id) ?? 0) >= 0.5);
  }
  const lastColumn = Math.max(0, ...inOrder.map((box) => box.column));

  // From the third page on, Google's steps can't be told apart by how far into a visit they came, and a group's second page
  // counts steps inside the group too. So those figures are the visits that could have reached them. A page named in the first
  // two columns has Google's own figures, and a route between two named pages there is Google's own, never more than went on.
  const fitted = (box: RouteBox) => box.column >= 2 || (box.column === 1 && box.isGroup);
  const said = (box: RouteBox) => (fitted(box) ? Math.round(drawnVisits.get(box.id) ?? 0) : box.visits);
  const saidLeft = (box: RouteBox) => (fitted(box) ? Math.round(drawnLeft.get(box.id) ?? 0) : box.left);
  const saidRoute = (route: FlowRoute) => {
    const from = byIdOf.get(route.from);
    const to = byIdOf.get(route.to);
    if (from && to && from.column === 0 && !from.isGroup && !to.isGroup) return Math.min(route.visits, Math.max(0, from.visits - from.left));
    return Math.round(drawnRoute.get(route) ?? 0);
  };
  const byId = new Map(inOrder.map((box) => [box.id, box]));
  const columnVisits = Array.from({ length: lastColumn + 1 }, (_, column) => inOrder.filter((box) => box.column === column).reduce((sum, box) => sum + (drawnVisits.get(box.id) ?? 0), 0));
  return { boxes: inOrder, routes, byId, tickedIds, drawnVisits, drawnLeft, drawnRoute, lastColumn, columnVisits, said, saidLeft, saidRoute };
}
