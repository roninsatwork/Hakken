import { expect, it } from "vitest";
import { patrolPan } from "./SpatialFoley";

it("puts a patrol on the correct ear as the camera rotates", () => {
  expect(patrolPan(20, 0, 0)).toBe(1);
  expect(patrolPan(-20, 0, 0)).toBe(-1);
  expect(patrolPan(20, 0, Math.PI)).toBeCloseTo(-1);
  expect(patrolPan(0, -20, Math.PI / 2)).toBeCloseTo(1);
  expect(patrolPan(0, 0, 0)).toBe(0);
});
