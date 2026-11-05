import { OTHER_GROUPS } from "./landingFlow";
import { flowBoxes, type BoxNames, type FlowForBoxes } from "./landingFlowRoutes";
import { pageName } from "./pageNames";

/**
 * Funnel's figures as the eye and Ask Hakken read them (funnel-way-1-plan-2026-11-05.md, steps 7 and 8), from the same boxes
 * as the chart: the Classifications people leave from, the biggest routes between named pages, the visits with no page known,
 * and the busy pages that lose people. Always the whole website's, so nothing here changes with a tick.
 */
type Busy = { visitsAtLeast: number; pages: number; losing: number; lost: number; top: ReadonlyArray<{ key: string; address: string; visits: number; left: number }> };
type FlowForFigures = Omit<FlowForBoxes, "ticked"> & { onward: number; left: number; noPageVisits: number; busy: Busy | null };

export type FunnelFigures = {
  leftPercent: number | null;
  classifications: Array<{ name: string; visits: number; left: number; leftPercent: number; conversions: number }>;
  busy: { visits: number; pages: number; losing: number; lost: number; top: Array<{ key: string; name: string; address: string; visits: number; left: number; leftPercent: number }> };
  /** The biggest routes between two pages with names, from the second page to the third. */
  routes: Array<{ from: string; to: string; fromVisits: number; visits: number }>;
  noPageVisits: number;
  everyVisit: number;
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 0);
const ROUTES_KEPT = 5;

export function funnelFigures(flow: FlowForFigures, names: BoxNames): FunnelFigures {
  const everyVisit = flow.onward + flow.left;
  const built = flowBoxes({ nodes: flow.nodes, bands: flow.bands, ticked: [] }, names);
  const routes = built.routes.flatMap((route) => {
    const from = built.byId.get(route.from);
    const to = built.byId.get(route.to);
    if (!from || !to || from.column !== 1 || from.isGroup || to.isGroup || from.name === to.name) return [];
    return [{ from: from.name, to: to.name, fromVisits: built.said(from), visits: built.saidRoute(route) }];
  }).sort((left, right) => right.visits - left.visits).slice(0, ROUTES_KEPT);
  return {
    leftPercent: everyVisit > 0 ? percent(flow.left, everyVisit) : null,
    classifications: built.boxes.filter((box) => box.column === 0 && box.isGroup && box.kind !== OTHER_GROUPS).map((box) => ({ name: box.name, visits: box.visits, left: box.left, leftPercent: percent(box.left, box.visits), conversions: box.conversions })),
    busy: {
      visits: flow.busy?.visitsAtLeast ?? 0,
      pages: flow.busy?.pages ?? 0,
      losing: flow.busy?.losing ?? 0,
      lost: flow.busy?.lost ?? 0,
      top: (flow.busy?.top ?? []).map((page) => ({ key: page.key, name: pageName(page.address), address: page.address, visits: page.visits, left: page.left, leftPercent: percent(page.left, page.visits) })),
    },
    routes,
    noPageVisits: flow.noPageVisits,
    everyVisit,
  };
}
