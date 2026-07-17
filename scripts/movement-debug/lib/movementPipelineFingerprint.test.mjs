import { describe, expect, it } from "vitest";
import { movementPipelineFingerprintFiles } from "./movementPipelineFingerprint.mjs";

describe("movement pipeline fingerprint", () => {
  it("covers acquisition, setup, lifecycle, and final application owners", () => {
    const files = movementPipelineFingerprintFiles();

    expect(files).toEqual(expect.arrayContaining([
      "src/app/(dashboard)/demos/movements/_hooks/useMovementLivePlayerSetup.ts",
      "src/app/(dashboard)/demos/movements/_hooks/useMovementPlayerTracking.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementPlayerInputContract.ts",
      "src/app/(dashboard)/demos/movements/[id]/play/_components/useVrmAvatarFrameRuntime.ts",
      "src/app/(dashboard)/demos/movements/[id]/play/page.tsx",
      "src/app/(dashboard)/demos/movements/replay-lab/page.tsx",
    ]));
    expect(files.some((file) => file.includes(".test."))).toBe(false);
  });
});
