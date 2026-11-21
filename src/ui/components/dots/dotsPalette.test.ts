import { describe, expect, it } from "vitest";

import { DOT_BUCKETS, brandFills, hueBucket, rainbowHue, toHueSaturation } from "./dotsPalette";

describe("the moving dots' colours", () => {
  it("runs the rainbow from blue at the top round to gold at the bottom", () => {
    expect(rainbowHue(0, 0, 0)).toBe(190);
    expect(rainbowHue(1, 0, 0)).toBe(60);
  });

  it("puts every hue in one of the colour groups", () => {
    for (let hue = 0; hue < 360; hue += 7) {
      const bucket = hueBucket(hue);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(DOT_BUCKETS);
    }
  });

  it("spreads a company's colour into shades of its own hue", () => {
    const fills = brandFills("#1a73e8");
    expect(fills).toHaveLength(DOT_BUCKETS);
    const hue = Math.round(toHueSaturation("#1a73e8")!.h);
    for (const fill of fills) expect(fill.startsWith(`hsl(${hue}, `)).toBe(true);
  });

  it("falls back to the brand orange when the colour cannot be read", () => {
    expect(brandFills("not a colour")[0]).toMatch(/^hsl\(16, /);
    expect(toHueSaturation(undefined)).toBeNull();
  });
});
