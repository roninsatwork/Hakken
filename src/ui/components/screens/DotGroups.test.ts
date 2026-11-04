import { describe, expect, it } from "vitest";
import { tightLogAxis } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { dotGroupOf, dotGroupsOf } from "./DotGroups";

const NAMES = { rightHigh: "Busy, often", rightLow: "Busy, seldom", leftHigh: "Quiet, often", leftLow: "Quiet, seldom" };

describe("the dot chart's scale", () => {
  it("stops close to the dots, not at the next power of ten", () => {
    expect(tightLogAxis([230, 1_273])).toEqual({ ticks: [200, 500, 1_000, 2_000], domain: [200, 2_000] });
  });

  it("has somewhere to go when every dot sits on one mark", () => {
    expect(tightLogAxis([500, 500]).domain).toEqual([500, 1_000]);
  });

  it("ignores figures it can't place, and copes with none", () => {
    expect(tightLogAxis([0, 50, 90]).domain).toEqual([50, 100]);
    expect(tightLogAxis([]).domain).toEqual([1, 10]);
  });
});

describe("four named groups", () => {
  it("counts a dot on a line as past it", () => {
    const split = { x: 100, y: 10 };
    expect(dotGroupOf({ x: 100, y: 10 }, split)).toBe("rightHigh");
    expect(dotGroupOf({ x: 100, y: 9 }, split)).toBe("rightLow");
    expect(dotGroupOf({ x: 99, y: 10 }, split)).toBe("leftHigh");
    expect(dotGroupOf({ x: 99, y: 9 }, split)).toBe("leftLow");
  });

  it("keeps all four in the key, and named dots out of it", () => {
    const groups = dotGroupsOf([{ x: 200, y: 20, label: "A", named: true }, { x: 200, y: 20, label: "B" }], { x: 100, y: 10 }, NAMES);
    expect(groups.filter((group) => group.inKey !== false).map((group) => group.name).sort()).toEqual(Object.values(NAMES).sort());
    const named = groups.find((group) => group.labelled);
    expect(named).toMatchObject({ inKey: false, name: "Busy, often", points: [{ label: "A" }] });
    expect(groups.find((group) => group.key === "rightHigh")?.points.map((point) => point.label)).toEqual(["B"]);
  });
});
