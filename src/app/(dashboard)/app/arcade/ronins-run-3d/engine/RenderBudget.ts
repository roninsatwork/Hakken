export type GraphicsQuality = "quiet" | "balanced" | "detailed";
export const GRAPHICS = {
  quiet: {
    fps: 30,
    pixelRatio: 1,
    pixels: 850_000,
    reflection: 384,
    reflectionHz: 15,
  },
  balanced: {
    fps: 60,
    pixelRatio: 1.25,
    pixels: 1_600_000,
    reflection: 512,
    reflectionHz: 30,
  },
  detailed: {
    fps: 60,
    pixelRatio: 1.5,
    pixels: 2_700_000,
    reflection: 768,
    reflectionHz: 60,
  },
} as const;

export function renderPixelRatio(
  quality: GraphicsQuality,
  width: number,
  height: number,
  deviceRatio: number,
) {
  const budget = GRAPHICS[quality];
  return Math.min(
    deviceRatio || 1,
    budget.pixelRatio,
    Math.sqrt(budget.pixels / Math.max(1, width * height)),
  );
}

/** A rolling wall-clock frame sample. Pause/loading intervals are deliberately excluded. */
export class FrameTiming {
  private frames: { at: number; ms: number }[] = [];
  private previous = 0;
  reset() {
    this.frames = [];
    this.previous = 0;
  }
  record(now: number) {
    if (this.previous) this.frames.push({ at: now, ms: now - this.previous });
    this.previous = now;
    while (this.frames.length && this.frames[0].at < now - 10_000)
      this.frames.shift();
  }
  snapshot() {
    if (!this.frames.length) return { fps: 0, p95: 0, worst: 0, samples: 0 };
    const sorted = this.frames.map((f) => f.ms).sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return {
      fps: 1000 / mean,
      p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
      worst: sorted.at(-1)!,
      samples: sorted.length,
    };
  }
}
