import { describe, expect, it } from "vitest";
import { planDenseCaptureBenchmarkIngest } from "./ingest-dense-capture-benchmark.mjs";

function entry(name, modifiedAtMs = 1, size = 1_000) {
  return { isFile: true, modifiedAtMs, name, size };
}

describe("dense capture benchmark ingest", () => {
  it("selects one newest non-empty download for every required scenario", () => {
    const report = planDenseCaptureBenchmarkIngest({
      entries: [
        entry("near-camera-old.webm", 1),
        entry("near-camera-new.webm", 2),
        entry("far-camera-test.webm"),
        entry("front-back-turn-test.webm"),
        entry("floor-work-test.webm"),
        entry("body-occlusion-test.webm"),
        entry("loose-clothing-test.webm"),
      ],
    });

    expect(report).toMatchObject({ failures: [], passed: true });
    expect(report.selected).toHaveLength(6);
    expect(report.selected.find(({ scenario }) => scenario === "near-camera")?.name)
      .toBe("near-camera-new.webm");
  });

  it("rejects empty, unrelated, and incomplete download packs", () => {
    const report = planDenseCaptureBenchmarkIngest({
      entries: [
        entry("near-camera-empty.webm", 1, 0),
        entry("holiday.webm"),
        { isFile: false, modifiedAtMs: 1, name: "far-camera-folder.webm", size: 1_000 },
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      "No downloaded near-camera benchmark clip was found.",
      "No downloaded far-camera benchmark clip was found.",
      "No downloaded loose-clothing benchmark clip was found.",
    ]));
  });
});
