import { afterEach, describe, expect, test, vi } from "vitest";
import { memoryMb, memoryNow } from "./stepMemory";

/**
 * A step's memory is what its own objects hold, not the process's resident
 * size: in a warm runtime that counts the loaded code and what earlier
 * actions left, and a 50-page rehearsal read 330 to 410 MB by it (2026-10-15).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a step's memory (collection-reliability-plan.md, RR5)", () => {
  test("is the heap in use and the buffers beside it, in MB, never the resident size", () => {
    vi.spyOn(process, "memoryUsage").mockReturnValue({ rss: 420 * 1_048_576, heapTotal: 90 * 1_048_576, heapUsed: 60 * 1_048_576, external: 5 * 1_048_576, arrayBuffers: 12 * 1_048_576 });
    expect(memoryMb()).toBe(72);
    expect(memoryNow()).toEqual({ memoryMb: 72 });
  });

  test("none where the runtime cannot say", () => {
    vi.spyOn(process, "memoryUsage").mockImplementation(() => {
      throw new Error("not in this runtime");
    });
    expect(memoryMb()).toBeNull();
    expect(memoryNow()).toEqual({});
  });
});
