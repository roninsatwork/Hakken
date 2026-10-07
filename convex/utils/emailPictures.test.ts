import { describe, expect, it } from "vitest";
import { PICTURE_HEIGHT, PICTURE_WIDTH, rasterBars } from "./emailPictures";

/** The task alert's four weeks as a picture (hakken-tasks-plan.md, item 3.2, board EmailAlertB). */
describe("a chart drawn as a picture", () => {
  const at = (raster: ReturnType<typeof rasterBars>, x: number, y: number) => raster.pixels[y * raster.width + x];

  it("draws a bar a day, a marked day in its own colour, at twice the size for sharp screens", () => {
    const raster = rasterBars({ values: [10, 5, 10], marked: [false, true, false] });
    expect([raster.width, raster.height]).toEqual([PICTURE_WIDTH * 2, PICTURE_HEIGHT * 2]);
    const bottom = raster.height - 1;
    const middle = (index: number) => Math.round((index + 0.4) * (raster.width / 3));
    expect([at(raster, middle(0), bottom), at(raster, middle(1), bottom), at(raster, middle(2), bottom)]).toEqual([1, 2, 1]);
    // The tallest reaches near the top, and the sheet shows above a shorter one.
    expect(at(raster, middle(0), Math.round(raster.height * 0.15))).toBe(1);
    expect(at(raster, middle(1), Math.round(raster.height * 0.15))).toBe(0);
  });

  it("dashes the rule's line across at its value", () => {
    const raster = rasterBars({ values: [20, 20], marked: [false, false], line: 10 });
    const y = raster.height - Math.round((10 / 20) * raster.height * 0.9);
    const row = Array.from(raster.pixels.subarray(y * raster.width, (y + 1) * raster.width));
    expect(row.filter((pixel) => pixel === 3).length).toBeGreaterThan(raster.width / 3);
    expect(row.filter((pixel) => pixel === 3).length).toBeLessThan(raster.width);
  });

  it("shows a day with nothing as a sliver, so it reads as a day", () => {
    const raster = rasterBars({ values: [0, 8], marked: [true, false] });
    expect(at(raster, 10, raster.height - 1)).toBe(2);
  });
});
