import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diagnoseReplayStudioBundleFilename,
  diagnoseReplayStudioBundleTempDir,
} from "./lib/diagnose-replay-studio-bundle-path.mjs";

describe("Replay Studio diagnosis wrapper", () => {
  it("keeps the transient esbuild bundle outside repository scratch output", () => {
    const tempDirPrefix = diagnoseReplayStudioBundleTempDir();
    const bundlePath = resolve(tempDirPrefix, diagnoseReplayStudioBundleFilename(1234));

    expect(tempDirPrefix).toBe(resolve(tmpdir(), "hakken-movement-diagnose-"));
    expect(bundlePath).toContain(resolve(tmpdir()));
    expect(bundlePath).not.toContain(resolve("tmp/movement-replay-lab"));
    expect(bundlePath).not.toContain(resolve("scripts/movement-debug"));
  });
});
