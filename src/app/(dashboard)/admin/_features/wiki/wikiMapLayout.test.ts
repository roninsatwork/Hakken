import { describe, expect, it } from "vitest";
import { runForceLayout } from "./wikiMapLayout";

const rows = [
  {
    pageId: "alpha",
    kind: "PRODUCT",
    title: "Alpha",
    subjectKey: "alpha",
    links: ["PRODUCT:beta", "PRODUCT:alpha"],
  },
  {
    pageId: "beta",
    kind: "PRODUCT",
    title: "Beta",
    subjectKey: "beta",
    links: ["PRODUCT:alpha"],
  },
  {
    pageId: "orphan",
    kind: "SOURCE",
    title: "Orphan",
    subjectKey: "orphan",
    links: [],
  },
];

describe("runForceLayout", () => {
  it("keeps the map deterministic and deduplicates reciprocal links", () => {
    const first = runForceLayout(rows);
    const second = runForceLayout(rows);

    expect(second).toEqual(first);
    expect(first.nodes.map(({ pageId, degree }) => ({ pageId, degree }))).toEqual([
      { pageId: "alpha", degree: 1 },
      { pageId: "beta", degree: 1 },
      { pageId: "orphan", degree: 0 },
    ]);
    expect(first.edges).toHaveLength(1);
    expect(first.edges[0].map((node) => node.pageId)).toEqual(["alpha", "beta"]);
    expect(first.nodes.every((node) => node.x >= 70 && node.x <= 930)).toBe(true);
    expect(first.nodes.every((node) => node.y >= 70 && node.y <= 630)).toBe(true);
  });
});
