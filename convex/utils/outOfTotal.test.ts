import { describe, expect, it } from "vitest";
import { outOfTotal } from "./outOfTotal";

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe("outOfTotal", () => {
  it("always adds up to the total, on any figures", () => {
    for (const values of [[1, 1, 1], [35739, 1207, 900, 12, 3], [1, 2, 3, 4, 5, 6, 7], [999, 1], [33, 33, 34], [0.4, 0.4, 0.2], [7]]) {
      expect(sum(outOfTotal(values))).toBe(100);
      expect(sum(outOfTotal(values, 1000))).toBe(1000);
    }
  });

  it("gives the spare ones to the biggest leftovers, the same way every time", () => {
    expect(outOfTotal([1, 1, 1])).toEqual([34, 33, 33]);
    expect(outOfTotal([50, 30, 20])).toEqual([50, 30, 20]);
    expect(outOfTotal([38, 48, 8, 3, 3])).toEqual([38, 48, 8, 3, 3]);
  });

  it("says nought for all nought, and copes with one row or none", () => {
    expect(outOfTotal([0, 0, 0])).toEqual([0, 0, 0]);
    expect(outOfTotal([])).toEqual([]);
    expect(outOfTotal([5])).toEqual([100]);
  });

  it("never gives a square for a negative figure", () => {
    expect(outOfTotal([-5, 10])).toEqual([0, 100]);
  });

  it("shows a thing too small for a square as none, with the rest still adding up", () => {
    expect(outOfTotal([10000, 1])).toEqual([100, 0]);
  });
});
