import { describe, expect, it } from "vitest";
import { clarityHeatmapHref, duration } from "./ClarityParts";

/** The links into Clarity open where they say (agents-and-clarity-plan.md, CS8), and times read as a person says them. */
describe("Clarity's shared parts", () => {
  it("opens a page's own heatmap, as Clarity's heatmaps list does (checked in Clarity, 2026-10-16)", () => {
    expect(clarityHeatmapHref("proj1", "https://www.example.com/ai-agency/")).toBe(
      "https://clarity.microsoft.com/projects/view/proj1/heatmaps?heatmapType=0&url=https%3A%2F%2Fwww.example.com%2Fai-agency%2F&URL=2%3B6%3B%5Ehttps%3A%2F%2Fwww%5C.example%5C.com%2Fai-agency%2F(%5C%3F.*)%3F%24",
    );
  });

  it("says a visit's time in seconds, minutes and hours", () => {
    expect([duration(44), duration(62), duration(996), duration(3725), duration(null)]).toEqual(["44s", "1m 02s", "16m 36s", "1h 02m", "–"]);
  });
});
