/**
 * The website's flow from its landing pages (docs/plans/active/funnel-way-1-plan-2026-11-05.md, step 1; first drawn in
 * landing-pages-flow-plan.md LF2, LF5, §3b): worked out once by the collection from Google's routes inside each landing
 * page's own visits, kept small, and read back as Funnel's chart and its table's onward columns.
 *
 * - **A route** is a visit's step from the page before to a page, inside the visits that started on one landing page,
 *   counted in visits (`sessions`), with the conversions made on the page it led to. Google gives one step at a time, not
 *   whole journeys. Hakken joins the steps up from the landing page outwards, and each step is used once, at the first
 *   column it can reach.
 * - **Went on** is counted once a visit (Google's visits with a view whose page before was that page), never from the
 *   steps, which count a visit that opens two pages twice (§3b: 150 against 46 of 155).
 * - **Five columns, ten pages each by name** (`FLOW_COLUMNS`, `FLOW_NODES`). Every other page is in its group, its
 *   Classification, so nothing falls out of the chart. A landing page's routes are kept against those same boxes
 *   (`landingRoutes`), so any page can be ticked.
 */

/** The chart's columns: the page a visit started on, and the four after it. */
export const FLOW_COLUMNS = 5;
/** Pages a column of the chart shows by name; the rest are in their groups. */
export const FLOW_NODES = 10;
/** Groups a column shows by name; the rest are together, as `OTHER_GROUPS`. */
export const GROUPS_BY_NAME = 8;
/** A box that holds a group of pages, rather than one page. */
export const GROUP = "g:";
/** The box holding the column's smaller groups. */
export const OTHER_GROUPS = "~others";
/** Google's name for a landing page it could not record: its visits all count as arrivals, whatever page they show. */
export const NOT_SET = "(not set)";

export const groupNode = (kind: string) => `${GROUP}${kind}`;
export const isGroupNode = (node: string) => node.startsWith(GROUP);
export const kindOfNode = (node: string) => node.slice(GROUP.length);

type Counts = ReadonlyMap<string, number>;

/**
 * One route as asked: the landing page, the page before (a page of the website, or "" from elsewhere or none), the page. A
 * big website's smallest routes arrive already added up by group, so `before` and `page` can be group boxes (`groupNode`).
 */
export type Route = { landing: string; before: string; page: string; visits: number; counts: Counts };
/** A landing page's visits with a view whose page before was `before`: those that went on from it. */
export type Onward = { landing: string; before: string; visits: number };

/**
 * One kept row of the flow, by its parts:
 * - `["n", column, node]` — a box in a column from the second page on: its visits, those that went on from it (`times`), and the conversions made on it (`counts`);
 * - `["r", column, from, to]` — the route from a box in that column to a box in the next. The first column's routes run from each page's group.
 */
export type FlowRow = { parts: string[]; visits: number; times: number; counts: Map<string, number> };
/** A landing page's own onward figures: the visits that went on, the page most opened next and its visits. */
export type OnwardRow = { landing: string; next: string; visits: number; times: number };
/** A landing page's visits to a box of the second column. */
export type LandingRouteRow = { landing: string; to: string; visits: number; counts: Map<string, number> };

function addCounts(into: Map<string, number>, counts: Counts) {
  for (const [event, count] of counts) into.set(event, (into.get(event) ?? 0) + count);
}

/** The busiest `FLOW_NODES` by their visits, ties by name: the rest go into their groups. */
function busiest(totals: ReadonlyMap<string, number>): Set<string> {
  return new Set([...totals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, FLOW_NODES).map(([page]) => page));
}

type Hop = { landing: string; column: number; from: string; to: string; visits: number; counts: Counts };

/** Each landing page's steps, joined up from it outwards. A step is used once, at the first column that can reach it. */
function hopsOf(routes: readonly Route[], kindOf: (page: string) => string): Hop[] {
  const steps = new Map<string, Map<string, Route[]>>();
  for (const route of routes) {
    if (route.before === "") continue;
    // The same page again is a reload, not a step. A step inside one group is a real step between two pages.
    if (route.page === route.before && !isGroupNode(route.page)) continue;
    const byBefore = steps.get(route.landing) ?? new Map<string, Route[]>();
    const list = byBefore.get(route.before) ?? [];
    list.push(route);
    byBefore.set(route.before, list);
    steps.set(route.landing, byBefore);
  }
  const hops: Hop[] = [];
  for (const [landing, byBefore] of steps) {
    const reached = new Set([landing]);
    let frontier = [landing];
    for (let column = 1; column < FLOW_COLUMNS && frontier.length > 0; column += 1) {
      const next: string[] = [];
      for (const from of frontier) {
        for (const route of byBefore.get(from) ?? []) {
          hops.push({ landing, column, from, to: route.page, visits: route.visits, counts: route.counts });
          // Reaching a page reaches its group too, for the routes added up by group.
          for (const node of isGroupNode(route.page) ? [route.page] : [route.page, groupNode(kindOf(route.page))]) {
            if (reached.has(node)) continue;
            reached.add(node);
            next.push(node);
          }
        }
      }
      frontier = next;
    }
  }
  return hops;
}

/** Google's routes and onward visits made into the kept flow, each landing page's onward row, and its routes to the second column. */
export function buildFlow(routes: readonly Route[], onward: readonly Onward[], kindOf: (page: string) => string = () => ""): { flow: FlowRow[]; onward: OnwardRow[]; routes: LandingRouteRow[] } {
  const arrivals = new Map<string, number>();
  for (const route of routes) {
    // Arrived from elsewhere: on the landing page itself — or anywhere, for the visits Google recorded no landing page for.
    if (route.before === "" && (route.page === route.landing || route.landing === NOT_SET)) arrivals.set(route.landing, (arrivals.get(route.landing) ?? 0) + route.visits);
  }
  const went = new Map<string, number>();
  for (const one of onward) went.set(`${one.landing}\u0000${one.before}`, (went.get(`${one.landing}\u0000${one.before}`) ?? 0) + one.visits);
  const wentOn = (landing: string, page: string) => went.get(`${landing}\u0000${page}`) ?? 0;

  const hops = hopsOf(routes, kindOf);
  const columnTotals = Array.from({ length: FLOW_COLUMNS }, () => new Map<string, number>());
  for (const hop of hops) {
    if (!isGroupNode(hop.to)) columnTotals[hop.column].set(hop.to, (columnTotals[hop.column].get(hop.to) ?? 0) + hop.visits);
  }
  const shown = columnTotals.map(busiest);
  const node = (column: number, page: string) => (isGroupNode(page) || shown[column].has(page) ? page : groupNode(kindOf(page)));

  const reachedOnce = new Set<string>();
  const rows = new Map<string, FlowRow>();
  const into = (parts: string[], visits: number, times: number, counts?: Counts) => {
    const key = parts.join("\u0000");
    const row = rows.get(key) ?? { parts, visits: 0, times: 0, counts: new Map() };
    row.visits += visits;
    row.times += times;
    if (counts) addCounts(row.counts, counts);
    rows.set(key, row);
  };
  const ownRoutes = new Map<string, LandingRouteRow>();
  const ownRoute = (landing: string, to: string, visits: number, counts?: Counts) => {
    const key = `${landing}\u0000${to}`;
    const row = ownRoutes.get(key) ?? { landing, to, visits: 0, counts: new Map() };
    row.visits += visits;
    if (counts) addCounts(row.counts, counts);
    ownRoutes.set(key, row);
  };
  for (const hop of hops) {
    const to = node(hop.column, hop.to);
    const from = hop.column === 1 ? groupNode(kindOf(hop.landing)) : node(hop.column - 1, hop.from);
    into(["n", String(hop.column), to], hop.visits, 0, hop.counts);
    into(["r", String(hop.column - 1), from, to], hop.visits, 0, hop.counts);
    if (hop.column === 1) ownRoute(hop.landing, to, hop.visits, hop.counts);
  }

  // How many went on from each page, whichever landing page brought them: a share of those that reached it, as Google counts a
  // visit going on from a page once. A group takes its own pages' share, and a box with nothing to go on takes the website's.
  const arrived = new Map<string, number>();
  const leaving = new Map<string, number>();
  for (const hop of hops) {
    if (isGroupNode(hop.to)) {
      // Routes added up by group count as arrivals there, or a group would seem to lose nobody.
      for (const key of [hop.to, ""]) arrived.set(key, (arrived.get(key) ?? 0) + hop.visits);
      continue;
    }
    const seen = `${hop.landing}\u0000${hop.to}`;
    const first = !reachedOnce.has(seen);
    reachedOnce.add(seen);
    for (const key of [hop.to, groupNode(kindOf(hop.to)), ""]) {
      arrived.set(key, (arrived.get(key) ?? 0) + hop.visits);
      if (first) leaving.set(key, (leaving.get(key) ?? 0) + (hop.to === hop.landing ? 0 : wentOn(hop.landing, hop.to)));
    }
  }
  const shareOn = (box: string) => {
    const reached = arrived.get(box) ?? 0;
    const known = reached > 0 ? box : "";
    return Math.min(1, (leaving.get(known) ?? 0) / Math.max(1, arrived.get(known) ?? 0));
  };
  for (const row of rows.values()) {
    if (row.parts[0] === "n") row.times = Math.round(row.visits * shareOn(row.parts[2] ?? ""));
  }

  // A visit went on only if it took a route, so its routes hold the count down: a reload looks like going on, and isn't.
  const firstVisits = new Map<string, number>();
  for (const hop of hops) if (hop.column === 1) firstVisits.set(hop.landing, (firstVisits.get(hop.landing) ?? 0) + hop.visits);
  // Each landing page's busiest next page, worked out once: looked for page by page, a year of a big website took 13,000 × 180,000 looks.
  const busiestNext = new Map<string, Hop>();
  for (const hop of hops) {
    if (hop.column !== 1 || isGroupNode(hop.to)) continue;
    const held = busiestNext.get(hop.landing);
    if (!held || hop.visits > held.visits || (hop.visits === held.visits && hop.to < held.to)) busiestNext.set(hop.landing, hop);
  }
  const onwardRows: OnwardRow[] = [...arrivals.keys()].map((landing) => {
    const top = busiestNext.get(landing);
    const visits = Math.min(arrivals.get(landing) ?? 0, wentOn(landing, landing), firstVisits.get(landing) ?? 0);
    return { landing, next: visits > 0 && top ? top.to : "", visits, times: visits > 0 && top ? Math.min(visits, top.visits) : 0 };
  });
  return { flow: [...rows.values()], onward: onwardRows, routes: [...ownRoutes.values()] };
}

// ---------------------------------------------------------------------------
// Read back: the chart
// ---------------------------------------------------------------------------

/** A kept flow row read back, its conversions already counted as the website counts them. */
export type KeptFlowRow = { parts: string[]; visits: number; times: number; conversions: number };

/** A group of the first column: its figures come from the table's own list, so the chart and the table agree. */
export type FirstGroup = { kind: string; visits: number; left: number; conversions: number };

export type FlowNode = {
  /** `${column}:${node}`: a page may stand in several columns. */
  id: string;
  column: number;
  /** The page's number, or a group's box (`groupNode`). */
  node: string;
  /** How many groups an "other groups" box holds; 0 for anything else. */
  more: number;
  visits: number;
  /** Visits that left the website there. */
  left: number;
  /** Conversions made there. */
  conversions: number;
};

export type FlowBand = { from: string; to: string; visits: number; conversions: number };

export type FlowChart = {
  nodes: FlowNode[];
  bands: FlowBand[];
  /** Where a first-column or second-column group's box went, once the smaller groups are together: for a ticked page's routes. */
  secondColumn: ReadonlyMap<string, string>;
  /** The first column's group box each Classification is in. */
  firstColumn: ReadonlyMap<string, string>;
};

/** The groups to keep by name in a column, the biggest first. */
function keptGroups(sizes: ReadonlyArray<{ kind: string; visits: number }>): { named: Set<string>; folded: number } {
  const sorted = [...sizes].sort((left, right) => right.visits - left.visits || left.kind.localeCompare(right.kind));
  return { named: new Set(sorted.slice(0, GROUPS_BY_NAME).map((one) => one.kind)), folded: Math.max(0, sorted.length - GROUPS_BY_NAME) };
}

/** Whether a kept flow is in this shape: a flow kept before 5 November 2026 isn't, and reads as not collected yet. */
export function isCurrentFlow(rows: ReadonlyArray<{ parts: string[] }>): boolean {
  return rows.some((row) => row.parts[0] === "n");
}

/**
 * The kept flow as the chart draws it: five columns, each one's pages busiest first, then its groups. The first column's
 * groups are given, from the table's own list. Its pages are added by the screen, from the pages ticked.
 */
export function flowChart(rows: readonly KeptFlowRow[], firstGroups: readonly FirstGroup[]): FlowChart {
  const nodes = new Map<string, FlowNode>();
  const bands = new Map<string, FlowBand>();
  const sizes = Array.from({ length: FLOW_COLUMNS }, () => [] as Array<{ kind: string; visits: number }>);
  for (const row of rows) {
    if (row.parts[0] !== "n") continue;
    const column = Number(row.parts[1]);
    const node = row.parts[2] ?? "";
    if (isGroupNode(node)) sizes[column].push({ kind: kindOfNode(node), visits: row.visits });
  }
  const firstKept = keptGroups(firstGroups);
  const kept = sizes.map((list, column) => (column === 0 ? firstKept : keptGroups(list)));
  const boxOf = (column: number, node: string) => (isGroupNode(node) && !kept[column].named.has(kindOfNode(node)) ? groupNode(OTHER_GROUPS) : node);
  const nodeOf = (column: number, node: string) => {
    const shown = boxOf(column, node);
    const id = `${column}:${shown}`;
    let held = nodes.get(id);
    if (!held) nodes.set(id, (held = { id, column, node: shown, more: shown === groupNode(OTHER_GROUPS) ? kept[column].folded : 0, visits: 0, left: 0, conversions: 0 }));
    return held;
  };
  for (const group of firstGroups) {
    const box = nodeOf(0, groupNode(group.kind));
    box.visits += group.visits;
    box.left += group.left;
    box.conversions += group.conversions;
  }
  for (const row of rows) {
    if (row.parts[0] === "n") {
      const box = nodeOf(Number(row.parts[1]), row.parts[2] ?? "");
      box.visits += row.visits;
      box.left += Math.max(0, row.visits - row.times);
      box.conversions += row.conversions;
    } else if (row.parts[0] === "r") {
      const column = Number(row.parts[1]);
      const from = nodeOf(column, row.parts[2] ?? "");
      const to = nodeOf(column + 1, row.parts[3] ?? "");
      const key = `${from.id}\u0000${to.id}`;
      const band = bands.get(key) ?? { from: from.id, to: to.id, visits: 0, conversions: 0 };
      band.visits += row.visits;
      band.conversions += row.conversions;
      bands.set(key, band);
    }
  }
  const secondColumn = new Map<string, string>();
  for (const { kind } of sizes[1]) secondColumn.set(groupNode(kind), boxOf(1, groupNode(kind)));
  const firstColumn = new Map(firstGroups.map((group) => [group.kind, boxOf(0, groupNode(group.kind))]));
  // Each column: its pages, busiest first, then its groups, biggest first, and the smaller groups last.
  const rank = (node: FlowNode) => (!isGroupNode(node.node) ? 0 : node.node === groupNode(OTHER_GROUPS) ? 2 : 1);
  const ordered = [...nodes.values()].sort((left, right) => left.column - right.column || rank(left) - rank(right) || right.visits - left.visits || left.node.localeCompare(right.node));
  return { nodes: ordered, bands: [...bands.values()], secondColumn, firstColumn };
}
