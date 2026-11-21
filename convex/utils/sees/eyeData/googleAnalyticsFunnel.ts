import { funnelFigures } from "../../landingFlowFigures";
import type { BoxNames, flowBoxes } from "../../landingFlowRoutes";

/**
 * What Google Analytics Funnel hands its eye, built in one place for the screen (`FunnelSees`, `LeftEachDayCard`,
 * `LandingFlowCard`) and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The reads and the words come in; the figures
 * `pageFindings` reads come out.
 */

type FunnelFlow = Parameters<typeof funnelFigures>[0] & { held: boolean };

/**
 * The page's own figures: the table's page as shown, the whole website's figures (`website`) to set each landing page
 * beside, the share of every landing page's visits that left without seeing another page (`landingAll`, Overview's own
 * figure, as a percentage already, so `pageData.ts` turns it round once only), and the route chart's figures (`funnel`),
 * whatever is ticked. Nothing while the table's page isn't read.
 */
export function funnelEyeData<Answer extends object>(reads: {
  answer: Answer | null | undefined;
  names: Record<string, string>;
  website: object | undefined;
  /** The share of every landing page's visits that left from the page they landed on, as a fraction. */
  left: number | null;
  flow: FunnelFlow | null | undefined;
}, words: BoxNames) {
  const { answer, names, website, left, flow } = reads;
  if (!answer) return answer;
  const funnel = flow?.held ? funnelFigures(flow, words) : null;
  return {
    ...answer, names, ...(website ? { website } : {}),
    ...(left !== null ? { landingAll: { leftPercent: Math.round(left * 1000) / 10 } } : {}),
    ...(funnel ? { funnel } : {}),
  };
}

/** What the daily chart can show. It opens on People who left straight away. */
export type LeftEachDayShow = "left" | "stayed" | "conversions";
type DayPoint = { day: string; lastDay?: string; visits: number; engaged?: number; conversions: number };

/** The figure a day's point gives for what the chart shows. */
export function leftEachDayFigure(point: DayPoint, show: LeftEachDayShow): number {
  if (show === "conversions") return point.conversions;
  const engaged = point.engaged ?? 0;
  return show === "left" ? Math.max(0, point.visits - engaged) : engaged;
}

const dayForEye = (point: DayPoint) => ({ day: point.day, leftStraightAway: leftEachDayFigure(point, "left"), stayed: leftEachDayFigure(point, "stayed"), conversions: point.conversions });

/** People who left straight away each day, as the eye reads the chart (`leftEachDay`): every day, and the days before where they're held day by day. */
export function leftEachDayForEye(
  now: { points: readonly DayPoint[] } | null | undefined,
  before: { held: boolean; points: readonly DayPoint[] } | null | undefined,
  show: LeftEachDayShow,
) {
  if (!now) return undefined;
  return {
    show,
    days: now.points.map(dayForEye),
    ...(before?.held ? { daysBefore: before.points.map(dayForEye) } : {}),
  };
}

/** The routes the eye is handed: the chart's download has every one. */
const ROUTES_THE_EYE_READS = 60;

type Built = Pick<ReturnType<typeof flowBoxes>, "boxes" | "routes" | "said" | "saidLeft" | "saidRoute">;

/** The route chart as the eye reads it (`flow`): every box and the biggest routes, with the figures the chart says. It has the whole website's from `funnel`. */
export function flowForEye(built: Built | null | undefined) {
  if (!built) return undefined;
  const nameOf = new Map(built.boxes.map((box) => [box.id, box.name]));
  return {
    picked: true,
    rows: built.boxes.map((box) => ({ name: box.name, step: box.column + 1, group: box.isGroup, visits: built.said(box), leftThere: built.saidLeft(box), conversions: box.conversions })),
    routes: built.routes.map((route) => ({ from: nameOf.get(route.from) ?? "", to: nameOf.get(route.to) ?? "", visits: built.saidRoute(route), conversions: route.conversions })).sort((one, other) => other.visits - one.visits).slice(0, ROUTES_THE_EYE_READS),
  };
}
