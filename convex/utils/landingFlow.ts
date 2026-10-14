/**
 * The website's flow from its landing pages (docs/plans/active/landing-pages-flow-plan.md
 * LF2, LF5, §3b): worked out once by the collection from Google's routes
 * inside each landing page's own visits, kept small, and read back as the
 * Landing pages screen's chart and its table's onward columns.
 *
 * - **A route** is a visit's step from the page before to a page, inside the
 *   visits that started on one landing page, counted in visits (`sessions`),
 *   with the conversions made on the page it led to.
 * - **Went on** is counted once a visit (Google's visits with a view whose page
 *   before was that page), never from the steps, which count a visit that goes
 *   back and forth more than once (§3b: 150 against 46 of 155).
 * - **Five pages a column** (`FLOW_NODES`), the busiest, the rest one box
 *   (`MORE`). Three columns: landing pages, the next page, the page after.
 */

/** Pages a column of the chart shows by name; the rest are one box. */
export const FLOW_NODES = 5;
/** The box holding a column's other pages. */
export const MORE = "~more";

type Counts = ReadonlyMap<string, number>;

/** One route as asked: the landing page, the page before (a page of the website, or "" from elsewhere or none), the page. */
export type Route = { landing: string; before: string; page: string; visits: number; counts: Counts };
/** A landing page's visits with a view whose page before was `before`: those that went on from it. */
export type Onward = { landing: string; before: string; visits: number };

/**
 * One kept row of the flow, by its parts:
 * - `["a", L]` — visits that landed on the column's page L (`visits`), went on from it (`times`), and converted on it (`counts`);
 * - `["b", L, P]` — the routes from L to the next page P;
 * - `["c", L, P, Q]` — the routes from P to the page after, Q, in the visits that landed on L;
 * - `["o", column, X]` — visits that went on from the page X shown in the column (`times`);
 * - `["m", column]` — how many pages the column's "more" box holds (`times`).
 */
export type FlowRow = { parts: string[]; visits: number; times: number; counts: Map<string, number> };
/** A landing page's own onward figures: the visits that went on, the page most opened next and its visits. */
export type OnwardRow = { landing: string; next: string; visits: number; times: number };

function addCounts(into: Map<string, number>, counts: Counts) {
  for (const [event, count] of counts) into.set(event, (into.get(event) ?? 0) + count);
}

/** The busiest `FLOW_NODES` by their visits, ties by name: the rest go into the column's "more" box. */
function busiest(totals: ReadonlyMap<string, number>): Set<string> {
  return new Set([...totals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, FLOW_NODES).map(([page]) => page));
}

/** Google's routes and onward visits made into the kept flow and each landing page's onward row. */
export function buildFlow(routes: readonly Route[], onward: readonly Onward[]): { flow: FlowRow[]; onward: OnwardRow[] } {
  const arrivals = new Map<string, { visits: number; counts: Map<string, number> }>();
  const first = new Map<string, Map<string, { visits: number; counts: Map<string, number> }>>();
  for (const route of routes) {
    if (route.before === "" && route.page === route.landing) {
      const held = arrivals.get(route.landing) ?? { visits: 0, counts: new Map() };
      held.visits += route.visits;
      addCounts(held.counts, route.counts);
      arrivals.set(route.landing, held);
    } else if (route.before === route.landing && route.page !== route.landing) {
      const byPage = first.get(route.landing) ?? new Map();
      const held = byPage.get(route.page) ?? { visits: 0, counts: new Map() };
      held.visits += route.visits;
      addCounts(held.counts, route.counts);
      byPage.set(route.page, held);
      first.set(route.landing, byPage);
    }
  }
  const second: Array<{ landing: string; next: string; page: string; visits: number; counts: Counts }> = [];
  for (const route of routes) {
    if (route.before === "" || route.before === route.landing || route.page === route.before) continue;
    if (!first.get(route.landing)?.has(route.before)) continue;
    second.push({ landing: route.landing, next: route.before, page: route.page, visits: route.visits, counts: route.counts });
  }
  const went = new Map<string, number>();
  for (const one of onward) went.set(`${one.landing}\u0000${one.before}`, (went.get(`${one.landing}\u0000${one.before}`) ?? 0) + one.visits);
  const wentOn = (landing: string, page: string) => went.get(`${landing}\u0000${page}`) ?? 0;

  const sum = (rows: Iterable<[string, number]>) => {
    const totals = new Map<string, number>();
    for (const [page, visits] of rows) totals.set(page, (totals.get(page) ?? 0) + visits);
    return totals;
  };
  const landingTotals = sum([...arrivals.entries()].map(([page, held]) => [page, held.visits]));
  const nextTotals = sum([...first.values()].flatMap((byPage) => [...byPage.entries()].map(([page, held]) => [page, held.visits] as [string, number])));
  const afterTotals = sum(second.map((route) => [route.page, route.visits]));
  const shown = [busiest(landingTotals), busiest(nextTotals), busiest(afterTotals)];
  const node = (column: number, page: string) => (shown[column].has(page) ? page : MORE);

  const rows = new Map<string, FlowRow>();
  const into = (parts: string[], visits: number, times: number, counts?: Counts) => {
    const key = parts.join("\u0000");
    const row = rows.get(key) ?? { parts, visits: 0, times: 0, counts: new Map() };
    row.visits += visits;
    row.times += times;
    if (counts) addCounts(row.counts, counts);
    rows.set(key, row);
  };
  for (const [landing, held] of arrivals) into(["a", node(0, landing)], held.visits, Math.min(held.visits, wentOn(landing, landing)), held.counts);
  for (const [landing, byPage] of first) {
    for (const [page, held] of byPage) into(["b", node(0, landing), node(1, page)], held.visits, 0, held.counts);
  }
  for (const route of second) into(["c", node(0, route.landing), node(1, route.next), node(2, route.page)], route.visits, 0, route.counts);
  // Went on from each page in the next two columns, from the visits that landed anywhere.
  for (const [column, totals] of [[1, nextTotals], [2, afterTotals]] as const) {
    for (const page of totals.keys()) {
      const on = [...arrivals.keys()].reduce((all, landing) => all + wentOn(landing, page), 0);
      if (on > 0) into(["o", String(column), node(column, page)], 0, on);
    }
  }
  [landingTotals, nextTotals, afterTotals].forEach((totals, column) => {
    const more = [...totals.keys()].filter((page) => !shown[column].has(page)).length;
    if (more > 0) into(["m", String(column)], 0, more);
  });

  const onwardRows: OnwardRow[] = [...arrivals.keys()].map((landing) => {
    const top = [...(first.get(landing) ?? new Map<string, { visits: number }>()).entries()].sort((left, right) => right[1].visits - left[1].visits || left[0].localeCompare(right[0]))[0];
    const on = Math.min(arrivals.get(landing)?.visits ?? 0, wentOn(landing, landing));
    return { landing, next: on > 0 && top ? top[0] : "", visits: on, times: on > 0 && top ? Math.min(on, top[1].visits) : 0 };
  });
  return { flow: [...rows.values()], onward: onwardRows };
}

// ---------------------------------------------------------------------------
// Read back: the chart
// ---------------------------------------------------------------------------

/** A kept flow row read back, its conversions already counted as the website counts them. */
export type KeptFlowRow = { parts: string[]; visits: number; times: number; conversions: number };

export type FlowNode = {
  /** `${column}:${page}`: a page may stand in two columns. */
  id: string;
  column: 0 | 1 | 2;
  /** The page's number, or `MORE`. */
  page: string;
  /** How many pages a "more" box holds; 0 for a page. */
  more: number;
  visits: number;
  /** Visits that left the website there. */
  left: number;
  /** Conversions made on the page in this column: on arrival for a landing page, else after the route into it. */
  conversions: number;
};

export type FlowBand = {
  from: string;
  to: string;
  visits: number;
  conversions: number;
  /** The landing pages whose visits took this route: a landing page followed lights its routes two steps on. */
  landings: string[];
};

export type FlowChart = {
  columns: Array<{ visits: number; left: number; conversions: number }>;
  nodes: FlowNode[];
  bands: FlowBand[];
};

/** The kept flow as the chart draws it: three columns, the busiest pages first and "more" last, and the routes between. */
export function flowChart(rows: readonly KeptFlowRow[]): FlowChart {
  const nodes = new Map<string, FlowNode>();
  const nodeOf = (column: 0 | 1 | 2, page: string) => {
    const id = `${column}:${page}`;
    let node = nodes.get(id);
    if (!node) nodes.set(id, (node = { id, column, page, more: 0, visits: 0, left: 0, conversions: 0 }));
    return node;
  };
  const bands = new Map<string, FlowBand>();
  const band = (from: FlowNode, to: FlowNode, visits: number, conversions: number, landing: string) => {
    const key = `${from.id}\u0000${to.id}`;
    const held = bands.get(key) ?? { from: from.id, to: to.id, visits: 0, conversions: 0, landings: [] };
    held.visits += visits;
    held.conversions += conversions;
    if (!held.landings.includes(landing)) held.landings.push(landing);
    bands.set(key, held);
  };
  const went = new Map<string, number>();
  const more = new Map<string, number>();
  for (const row of rows) {
    const [kind, ...rest] = row.parts;
    if (kind === "a") {
      const landing = nodeOf(0, rest[0] ?? "");
      landing.visits += row.visits;
      landing.left += Math.max(0, row.visits - row.times);
      landing.conversions += row.conversions;
    } else if (kind === "b") {
      const to = nodeOf(1, rest[1] ?? "");
      to.visits += row.visits;
      to.conversions += row.conversions;
      band(nodeOf(0, rest[0] ?? ""), to, row.visits, row.conversions, rest[0] ?? "");
    } else if (kind === "c") {
      const to = nodeOf(2, rest[2] ?? "");
      to.visits += row.visits;
      to.conversions += row.conversions;
      band(nodeOf(1, rest[1] ?? ""), to, row.visits, row.conversions, rest[0] ?? "");
    } else if (kind === "o") went.set(`${rest[0]}:${rest[1]}`, (went.get(`${rest[0]}:${rest[1]}`) ?? 0) + row.times);
    else if (kind === "m") more.set(rest[0] ?? "", row.times);
  }
  for (const node of nodes.values()) {
    if (node.page === MORE) node.more = more.get(String(node.column)) ?? 0;
    if (node.column > 0) node.left = Math.max(0, node.visits - (went.get(node.id) ?? 0));
  }
  const ordered = [...nodes.values()].sort((left, right) => left.column - right.column || Number(left.page === MORE) - Number(right.page === MORE) || right.visits - left.visits || left.page.localeCompare(right.page));
  const columns = [0, 1, 2].map((column) => {
    const own = ordered.filter((node) => node.column === column);
    return { visits: own.reduce((all, node) => all + node.visits, 0), left: own.reduce((all, node) => all + node.left, 0), conversions: own.reduce((all, node) => all + node.conversions, 0) };
  });
  return { columns, nodes: ordered, bands: [...bands.values()] };
}
