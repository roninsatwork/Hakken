import { describe, expect, it } from "vitest";
import { movementBoundaryChecksum } from "./movementBoundaryChecksum";

describe("movementBoundaryChecksum", () => {
  it("is stable across object key order and insignificant float noise", () => {
    expect(movementBoundaryChecksum({ b: 2, a: 1.0000001 })).toBe(
      movementBoundaryChecksum({ a: 1.0000002, b: 2 }),
    );
  });

  it("changes when a boundary value changes materially", () => {
    expect(movementBoundaryChecksum({ owner: "player-retarget" })).not.toBe(
      movementBoundaryChecksum({ owner: "neutral" }),
    );
  });
});
