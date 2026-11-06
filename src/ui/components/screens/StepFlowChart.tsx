"use client";

import { PageFlowChart, type PageFlowBand, type PageFlowNode } from "./PageFlowChart";

/**
 * The steps to a sale, or any steps a visit can stop at (Anthony, 2026-11-05, on Funnel's Way 2: "this is good as a standard
 * shared component but its way too deep and take up too much space"; funnel-way-1-plan-2026-11-05.md, step 4): each step a box
 * as tall as its visits, a band to the next, and a red tail for those that stopped there, in `PageFlowChart`'s look, with its
 * rollover and hover. Short on purpose: its tallest box is 120 pixels. Channels' How far people got is its first page, inside `MapCard`.
 */
export type FlowStep = { id: string; name: string; visits: number; visitsBefore?: number | null };

export type StepFlowWords = {
  /** Under the first step's name. */
  everyVisit: string;
  /** Under the others: "62% of all visits". */
  ofAll: (percent: number) => string;
  stopped: (visits: string) => string;
  visits: (visits: string) => string;
  /** The hover's lines. */
  visitsLabel: string;
  before?: string;
  ofAllLabel: string;
  stoppedLabel: string;
  ofStepLabel: (name: string) => string;
  route: (from: string, to: string) => string;
  /** The key under the chart. */
  stoppedKey: string;
};

/** How tall the first step is drawn. */
export const STEP_CHART_HEIGHT = 120;

const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

/** The steps as the chart's boxes and bands. */
export function stepFlowParts(steps: readonly FlowStep[], words: StepFlowWords, format: (value: number) => string): { nodes: PageFlowNode[]; bands: PageFlowBand[] } {
  const first = steps[0]?.visits ?? 0;
  const nodes = steps.map((step, at): PageFlowNode => {
    const next = steps[at + 1];
    const stopped = next ? Math.max(0, step.visits - next.visits) : 0;
    return {
      id: step.id,
      column: at,
      label: step.name,
      visits: step.visits,
      left: stopped,
      conversions: 0,
      hover: `${step.name}: ${words.visits(format(step.visits))}`,
      readout: {
        heading: step.name,
        lines: [
          { value: format(step.visits), label: words.visitsLabel },
          ...(words.before && step.visitsBefore != null ? [{ value: format(step.visitsBefore), label: words.before }] : []),
          ...(at > 0 ? [{ value: `${percentOf(step.visits, first)}%`, label: words.ofAllLabel }] : []),
          ...(next ? [{ value: format(stopped), label: words.stoppedLabel }] : []),
        ],
      },
    };
  });
  const bands = steps.slice(1).map((step, at): PageFlowBand => {
    const from = steps[at];
    return {
      from: from.id,
      to: step.id,
      visits: Math.min(step.visits, from.visits),
      conversions: 0,
      landings: [],
      hover: `${words.route(from.name, step.name)}: ${words.visits(format(step.visits))}`,
      readout: {
        heading: words.route(from.name, step.name),
        lines: [
          { value: format(step.visits), label: words.visitsLabel },
          { value: `${percentOf(step.visits, from.visits)}%`, label: words.ofStepLabel(from.name) },
        ],
      },
    };
  });
  return { nodes, bands };
}

export function StepFlowChart({ steps, words, format }: { steps: readonly FlowStep[]; words: StepFlowWords; format: (value: number) => string }) {
  const { nodes, bands } = stepFlowParts(steps, words, format);
  const first = steps[0]?.visits ?? 0;
  const columns = steps.map((step, at) => {
    const next = steps[at + 1];
    return {
      title: step.name,
      summary: <>{at === 0 ? words.everyVisit : words.ofAll(percentOf(step.visits, first))}{next ? <><br />{words.stopped(format(Math.max(0, step.visits - next.visits)))}</> : null}</>,
    };
  });
  return <div data-part="step-flow"><PageFlowChart columns={columns} nodes={nodes} bands={bands} mostHeight={STEP_CHART_HEIGHT} legend={{ left: words.stoppedKey }} figuresOf={(node) => words.visits(format(node.visits))} /></div>;
}
