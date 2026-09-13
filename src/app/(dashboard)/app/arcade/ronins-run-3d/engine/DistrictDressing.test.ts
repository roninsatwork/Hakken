import { describe, expect, it } from "vitest";
import { MARKET, DOCKS, GARDENS } from "../../ronins-run/engine/Levels";
import { isWalkable } from "../../ronins-run/engine/MapData";
import { districtDressing } from "./DistrictDressing";
import { toMap } from "./WorldLayout";

describe.each([MARKET, DOCKS, GARDENS])("$id scenery", (level) => {
  it("keeps solid scenery off the original paths, even where paths overlap", () => {
    const items = districtDressing(level);
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      for (let x = -item.width / 2; x <= item.width / 2; x += 0.11)
        for (let z = -item.depth / 2; z <= item.depth / 2; z += 0.11) {
          const point = toMap(
            item.x + x * Math.cos(item.rotation) + z * Math.sin(item.rotation),
            item.z - x * Math.sin(item.rotation) + z * Math.cos(item.rotation),
          );
          expect(
            isWalkable(point, 0, level),
            `${item.kind} at ${item.x},${item.z}`,
          ).toBe(false);
        }
    }
    const identity =
      level.id === "market"
        ? "stall"
        : level.id === "docks"
          ? "boat"
          : "shrine";
    expect(
      items.filter((item) => item.kind === identity).length,
    ).toBeGreaterThan(0);
  });
});
