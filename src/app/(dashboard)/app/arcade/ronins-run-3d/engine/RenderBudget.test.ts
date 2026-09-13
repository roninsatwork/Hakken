import { expect, it } from "vitest";
import { FrameTiming, GRAPHICS, renderPixelRatio } from "./RenderBudget";

it("bounds fullscreen pixel work on a retina display for every graphics preset", () => {
  for (const quality of ["quiet", "balanced", "detailed"] as const) {
    const ratio = renderPixelRatio(quality, 3840, 2160, 2);
    expect(3840 * 2160 * ratio * ratio).toBeLessThanOrEqual(
      GRAPHICS[quality].pixels + 0.01,
    );
    expect(renderPixelRatio(quality, 800, 600, 1)).toBeLessThanOrEqual(1);
  }
});
it("measures actual frame gaps and excludes paused time from the next sample", () => {
  const timing = new FrameTiming();
  for (let i = 0; i < 120; i++) timing.record(1000 + (i * 1000) / 60);
  expect(timing.snapshot().fps).toBeCloseTo(60);
  timing.record(5000);
  expect(timing.snapshot().worst).toBeGreaterThan(2000);
  timing.reset();
  for (let i = 0; i < 30; i++) timing.record(20000 + (i * 1000) / 30);
  expect(timing.snapshot().fps).toBeCloseTo(30);
  expect(timing.snapshot().worst).toBeLessThan(34);
});
