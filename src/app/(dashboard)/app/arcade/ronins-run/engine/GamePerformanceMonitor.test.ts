import { describe, expect, it, vi } from 'vitest';
import { GamePerformanceMonitor } from './GamePerformanceMonitor';

describe('Night Heist performance samples', () => {
  it('separates frame cadence from engine work and preserves stalls in the report', () => {
    const report = vi.fn();
    const monitor = new GamePerformanceMonitor(report);
    for (let i = 0; i < 475; i++) monitor.record(20, 2);
    for (let i = 0; i < 5; i++) monitor.record(40, 7);
    expect(report).not.toHaveBeenCalled();
    monitor.record(300, 21);
    expect(report).toHaveBeenCalledExactlyOnceWith({
      frames: 481,
      durationMs: 10_000,
      fps: 48.1,
      frameP95Ms: 20,
      workP95Ms: 2,
      workMaxMs: 21,
      framesOver34Ms: 6,
      clampedTimeMs: 200,
    });
  });

  it('discards an incomplete window on pause and starts a fresh window', () => {
    const report = vi.fn();
    const monitor = new GamePerformanceMonitor(report);
    for (let i = 0; i < 450; i++) monitor.record(20, 15);
    monitor.reset();
    for (let i = 0; i < 500; i++) monitor.record(20, 1);
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0][0]).toMatchObject({ frames: 500, fps: 50, workMaxMs: 1 });
    monitor.record(20, 1);
    expect(report).toHaveBeenCalledOnce();
  });

  it('ignores invalid measurements without poisoning the window', () => {
    const report = vi.fn();
    const monitor = new GamePerformanceMonitor(report);
    monitor.record(Number.NaN, 2);
    monitor.record(100, Number.POSITIVE_INFINITY);
    monitor.record(-100, 2);
    monitor.record(20, -1);
    for (let i = 0; i < 500; i++) monitor.record(20, 0);
    expect(report.mock.calls[0][0]).toMatchObject({ frames: 500, fps: 50, workMaxMs: 0 });
  });
});
