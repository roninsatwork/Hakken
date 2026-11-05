import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepFlowChart, stepFlowParts, type StepFlowWords } from "./StepFlowChart";

const words: StepFlowWords = {
  everyVisit: "Every visit",
  ofAll: (percent) => `${percent}% of all visits`,
  stopped: (visits) => `${visits} stopped here`,
  visits: (visits) => `${visits} visits`,
  visitsLabel: "Visits",
  before: "Visits in September",
  ofAllLabel: "Of all visits",
  stoppedLabel: "Stopped here",
  ofStepLabel: (name) => `Of the visits at ${name}`,
  route: (from, to) => `${from} to ${to}`,
  stoppedKey: "Red shows people who stopped here",
};
const steps = [
  { id: "a", name: "Arrived", visits: 35739, visitsBefore: 37507 },
  { id: "b", name: "Saw a product", visits: 22190, visitsBefore: 24587 },
  { id: "c", name: "Bought", visits: 1205, visitsBefore: 1246 },
];
const format = (value: number) => value.toLocaleString("en-GB");

describe("StepFlowChart", () => {
  it("each step keeps what stopped there, and the last keeps nothing", () => {
    const { nodes, bands } = stepFlowParts(steps, words, format);
    expect(nodes.map((node) => node.left)).toEqual([13549, 20985, 0]);
    expect(bands.map((band) => [band.from, band.to, band.visits])).toEqual([["a", "b", 22190], ["b", "c", 1205]]);
  });

  it("a step never sends on more visits than it had", () => {
    const { bands } = stepFlowParts([{ id: "a", name: "A", visits: 10 }, { id: "b", name: "B", visits: 15 }], words, format);
    expect(bands[0].visits).toBe(10);
  });

  it("is short: its tallest box is 120 pixels, and each step says its share of all visits", () => {
    render(<StepFlowChart steps={steps} words={words} format={format} />);
    const tallest = document.querySelector('[data-node="a"] rect.text-border-dim');
    expect(Number(tallest?.getAttribute("height"))).toBe(120);
    expect(screen.getByText(/62% of all visits/)).toBeInTheDocument();
    expect(screen.getByText("Red shows people who stopped here")).toBeInTheDocument();
  });

  it("rolling over a step shows its figures", () => {
    render(<StepFlowChart steps={steps} words={words} format={format} />);
    const box = document.querySelector('[data-node="b"]') as SVGGElement;
    const area = document.querySelector('[data-part="page-flow"]') as HTMLElement;
    fireEvent.mouseEnter(box);
    fireEvent.mouseMove(area, { clientX: 10, clientY: 10 });
    expect(screen.getByText("Of all visits")).toBeInTheDocument();
    expect(screen.getByText("24,587")).toBeInTheDocument();
  });
});
