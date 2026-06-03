import { describe, expect, it } from "vitest";
import { resolveHandSideByWrist } from "./handMatching";

describe("resolveHandSideByWrist", () => {
  it("matches the left hand when the detected wrist is closer to the left pose wrist", () => {
    expect(resolveHandSideByWrist({
      handWrist: { x: 0.2, y: 0.4 },
      leftWrist: { x: 0.22, y: 0.42 },
      rightWrist: { x: 0.75, y: 0.42 },
    })).toBe("left");
  });

  it("matches the right hand when the detected wrist is closer to the right pose wrist", () => {
    expect(resolveHandSideByWrist({
      handWrist: { x: 0.7, y: 0.5 },
      leftWrist: { x: 0.1, y: 0.5 },
      rightWrist: { x: 0.72, y: 0.5 },
    })).toBe("right");
  });

  it("uses the available left pose wrist when only the left side is visible", () => {
    expect(resolveHandSideByWrist({
      handWrist: { x: 0.3, y: 0.6 },
      leftWrist: { x: 0.31, y: 0.61 },
    })).toBe("left");
  });

  it("uses the available right pose wrist when only the right side is visible", () => {
    expect(resolveHandSideByWrist({
      handWrist: { x: 0.6, y: 0.6 },
      rightWrist: { x: 0.62, y: 0.6 },
    })).toBe("right");
  });

  it("falls back when there is no wrist data to compare", () => {
    expect(resolveHandSideByWrist({ fallback: "left" })).toBe("left");
  });
});
