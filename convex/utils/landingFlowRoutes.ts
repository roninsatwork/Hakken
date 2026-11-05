import { OTHER_GROUPS } from "./landingFlow";
import { NOT_SORTED_KIND } from "./pageKinds";
import { pageName } from "./pageNames";
import { SHOP_PAGES_KIND } from "./shopPages";

/**
 * Funnel's boxes and routes, from what's saved and what's ticked (funnel-way-1-plan-2026-11-05.md, steps 3 and 6). One set of
 * figures for the chart (`funnelRoutes.ts`), the eye (`funnelFigures`) and Ask Hakken, so the three can't disagree. A ticked
 * page comes out of its group, with its routes, so the first column always adds up and the rest of the chart stays still.
 */
export type FlowForBoxes = {
  nodes: ReadonlyArray<{ id: string; column: number; kind: string | null; name: string | null; more: number; address: string | null; visits: number; left: number; conversions: number }>;
  bands: ReadonlyArray<{ from: string; to: string; visits: number; conversions: number }>;
  ticked: ReadonlyArray<{ key: string; id: string; address: string; group: string; visits: number; visitsBefore: number | null; left: number; conversions: number; routes: ReadonlyArray<{ to: string; visits: number; conversions: number }> }>;
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
  for (const band of flow.bands) addRoute(canonical.get(band.from) ?? band.from, canonical.get(band.to) ?? band.to, band.visits, band.conversions);

  // The pages ticked come out of their groups, busiest first, above the groups.
  const ticked = [...flow.ticked].sort((left, right) => right.visits - left.visits);
  const tickedIds = new Set<string>();
  for (const page of ticked) {
    tickedIds.add(page.id);
    boxes.set(page.id, { id: page.id, column: 0, kind: null, name: page.key === "(not set)" ? words.pageNotKnown : pageName(page.address), address: page.key === "(not set)" ? null : page.address.replace(/^https?:\/\/[^/]+/i, "") || "/", visits: page.visits, left: page.left, conversions: page.conversions, isGroup: false, before: page.visitsBefore });
    const group = boxes.get(page.group);
    if (group) {
      group.visits = Math.max(0, group.visits - page.visits);
      group.left = Math.max(0, group.left - page.left);
      group.conversions = Math.max(0, group.conversions - page.conversions);
    }
    for (const route of page.routes) {
      const to = canonical.get(route.to) ?? route.to;
      addRoute(page.id, to, route.visits, route.conversions);
      const fromGroup = routeMap.get(`${page.group}>${to}`);
      if (fromGroup) {
        fromGroup.visits = Math.max(0, fromGroup.visits - route.visits);
        fromGroup.conversions = Math.max(0, fromGroup.conversions - route.conversions);
      }
    }
  }
  const routes = [...routeMap.values()].filter((route) => route.visits > 0);

  // Each column's boxes in order: ticked pages busiest first, then what the read gave.
  const byIdOf = new Map<string, RouteBox>();
  const inOrder: RouteBox[] = [
    ...ticked.map((page) => boxes.get(page.id)!),
    ...flow.nodes.flatMap((node) => {
      const id = canonical.get(node.id);
      return id === node.id ? [boxes.get(id)!] : [];
    }),
  ];

  for (const box of inOrder) byIdOf.set(box.id, box);
  // A visit that opens two pages takes both routes, so a box's routes can add up to more than went on from it. Drawn, they're
  // fitted to what went on, so every band fits its box. The figures said stay the real ones.
  const drawnVisits = new Map(inOrder.map((box) => [box.id, box.visits]));
  const drawnLeft = new Map(inOrder.map((box) => [box.id, box.left]));
  const drawnRoute = new Map<FlowRoute, number>();
  const lastColumn = Math.max(0, ...inOrder.map((box) => box.column));
  for (let column = 0; column <= lastColumn; column += 1) {
    for (const box of inOrder.filter((one) => one.column === column)) {
      if (column > 0) {
        const into = routes.filter((route) => route.to === box.id).reduce((sum, route) => sum + (drawnRoute.get(route) ?? 0), 0);
        drawnVisits.set(box.id, into);
        drawnLeft.set(box.id, box.visits > 0 ? (box.left / box.visits) * into : 0);
      }
      const leaving = routes.filter((route) => route.from === box.id);
      const room = Math.max(0, (drawnVisits.get(box.id) ?? 0) - (drawnLeft.get(box.id) ?? 0));
      const sum = leaving.reduce((all, route) => all + route.visits, 0);
      const fit = sum > room && sum > 0 ? room / sum : 1;
      for (const route of leaving) drawnRoute.set(route, route.visits * fit);
    }
  }

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
