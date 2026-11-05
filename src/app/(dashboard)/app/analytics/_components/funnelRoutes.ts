import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { flowBoxes, type BoxNames, type FlowRoute, type RouteBox } from "@/convex/utils/landingFlowRoutes";
import type { FlowReadout, PageFlowBand, PageFlowNode } from "@/src/ui/components/screens/PageFlowChart";

/**
 * Funnel's route chart as it's drawn (funnel-way-1-plan-2026-11-05.md, step 3): the figures are `flowBoxes`, the same ones the
 * eye and Ask Hakken read, and here they become boxes, bands and hovers. Plain code, so it's tested without a screen.
 */
export type FlowAnswer = FunctionReturnType<typeof api.googleAnalyticsFlowReads.analyticsLandingFlow>;

export type RouteWords = BoxNames & {
  otherPagesOf: string;
  pagesNotTicked: string;
  pagesNotTickedLower: string;
  visits: string;
  visitsInBefore: string;
  wentOn: string;
  leftHere: string;
  mostWent: string;
  conversions: string;
  ofVisitsOn: (name: string) => string;
  conversionsAfter: string;
  route: (from: string, to: string) => string;
};

export type { RouteBox };

/** Routes between two columns that wear a dot: on a shop nearly every route has a conversion, and a dot on each hides the chart. */
const DOTS_A_GAP = 5;
/** The chart's size: one scale for every box, whatever's ticked, however big the website. */
const CHART_HEIGHT = 320;
const MOST_SCALE = 0.45;

const fmt = (value: number) => Math.round(value).toLocaleString("en-GB");
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : "0%");

export function routesFrom(flow: FlowAnswer, words: RouteWords) {
  const { boxes: inOrder, routes, byId, tickedIds, drawnVisits, drawnLeft, drawnRoute, lastColumn, columnVisits, said, saidLeft, saidRoute } = flowBoxes(flow, words);
  const everyone = flow.onward + flow.left;
  const scale = Math.min(MOST_SCALE, CHART_HEIGHT / Math.max(1, everyone));
  const notTicked = (box: RouteBox) => box.column === 0 && box.isGroup;
  const boxReadout = (box: RouteBox): FlowReadout => {
    const top = routes.filter((route) => route.from === box.id && !byId.get(route.to)?.isGroup).sort((left, right) => right.visits - left.visits)[0];
    return {
      heading: box.name,
      detail: box.isGroup ? (notTicked(box) ? words.pagesNotTicked : words.otherPagesOf) : box.address,
      lines: [
        { value: fmt(said(box)), label: words.visits },
        ...(box.before !== null ? [{ value: fmt(box.before), label: words.visitsInBefore }] : []),
        ...(saidLeft(box) > 0 || box.column === 0 ? [
          { value: `${fmt(Math.max(0, said(box) - saidLeft(box)))} (${percent(said(box) - saidLeft(box), said(box))})`, label: words.wentOn },
          { value: `${fmt(saidLeft(box))} (${percent(saidLeft(box), said(box))})`, label: words.leftHere },
        ] : []),
        ...(top ? [{ value: byId.get(top.to)?.name ?? "", label: words.mostWent }] : []),
        ...(box.conversions > 0 ? [{ value: fmt(box.conversions), label: words.conversions }] : []),
      ],
    };
  };
  const nodes: PageFlowNode[] = inOrder.map((box) => ({
    id: box.id,
    column: box.column,
    label: box.name,
    visits: drawnVisits.get(box.id) ?? 0,
    left: drawnLeft.get(box.id) ?? 0,
    // On one line, conversions are in the hover and the table.
    conversions: 0,
    hover: `${box.name}: ${fmt(said(box))}`,
    readout: boxReadout(box),
    ...(box.isGroup ? { ending: "uncounted" as const } : {}),
  }));
  // The routes with the most conversions between each two columns wear a dot, up to three sizes as the part draws them.
  const dotted = new Map<FlowRoute, number>();
  for (let column = 0; column < lastColumn; column += 1) {
    const here = routes.filter((route) => byId.get(route.from)?.column === column && route.conversions > 0).sort((left, right) => right.conversions - left.conversions).slice(0, DOTS_A_GAP);
    const most = here[0]?.conversions ?? 1;
    for (const route of here) dotted.set(route, Math.max(1, Math.ceil((3 * route.conversions) / most)));
  }
  const bands: PageFlowBand[] = routes.map((route) => {
    const from = byId.get(route.from);
    const to = byId.get(route.to);
    const fromName = from ? (notTicked(from) ? words.pagesNotTickedLower : from.name) : "";
    const toName = to?.name ?? "";
    return {
      from: route.from,
      to: route.to,
      visits: drawnRoute.get(route) ?? 0,
      conversions: dotted.get(route) ?? 0,
      landings: [],
      hover: `${words.route(fromName, toName)}: ${fmt(saidRoute(route))}`,
      readout: {
        heading: words.route(fromName, toName),
        lines: [
          { value: fmt(saidRoute(route)), label: words.visits },
          { value: percent(saidRoute(route), from ? said(from) : 0), label: words.ofVisitsOn(fromName) },
          ...(route.conversions > 0 ? [{ value: fmt(route.conversions), label: words.conversionsAfter }] : []),
        ],
      },
    };
  });
  return { nodes, bands, scale, boxes: inOrder, routes, tickedIds, columnVisits, said, saidLeft, saidRoute, figureOf: (id: string) => { const box = byId.get(id); return fmt(box ? said(box) : 0); } };
}
