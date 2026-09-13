export interface FrameSample {
  frames: number;
  durationMs: number;
  fps: number;
  frameP95Ms: number;
  workP95Ms: number;
  workMaxMs: number;
  framesOver34Ms: number;
  clampedTimeMs: number;
}

/** Opt-in development measurement. It never reads or changes gameplay state. */
export class GamePerformanceMonitor {
  private intervals: number[] = [];
  private work: number[] = [];
  private duration = 0;
  constructor(private report: (sample: FrameSample) => void) {}

  reset() {
    this.intervals = [];
    this.work = [];
    this.duration = 0;
  }

  record(frameMs: number, workMs: number) {
    if (!Number.isFinite(frameMs) || !Number.isFinite(workMs) || frameMs <= 0 || workMs < 0) return;
    this.intervals.push(frameMs);
    this.work.push(workMs);
    this.duration += frameMs;
    if (this.duration < 10_000) return;
    const percentile95 = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.ceil(sorted.length * 0.95) - 1];
    };
    const round = (value: number) => Math.round(value * 100) / 100;
    this.report({
      frames: this.intervals.length,
      durationMs: round(this.duration),
      fps: round((this.intervals.length * 1000) / this.duration),
      frameP95Ms: round(percentile95(this.intervals)),
      workP95Ms: round(percentile95(this.work)),
      workMaxMs: round(Math.max(...this.work)),
      framesOver34Ms: this.intervals.filter((value) => value > 34).length,
      clampedTimeMs: round(this.intervals.reduce((sum, value) => sum + Math.max(0, value - 100), 0)),
    });
    this.reset();
  }
}
