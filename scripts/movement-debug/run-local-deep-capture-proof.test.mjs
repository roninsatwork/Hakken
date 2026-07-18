import { describe, expect, it, vi } from "vitest";
import {
  buildLocalDeepCaptureProofPlan,
  parseLocalDeepCaptureProofArgs,
  runLocalDeepCaptureProof,
} from "./run-local-deep-capture-proof.mjs";

describe("local Deep Capture proof", () => {
  it("recovers the preserved download before running strict schema-v3 proof", async () => {
    const args = parseLocalDeepCaptureProofArgs([
      "--packet", "downloads/deep-take.json",
      "--out", "tmp/local-proof",
      "--local-test-auth",
      "--secret", "test-secret",
      "--headed",
    ]);
    const plan = buildLocalDeepCaptureProofPlan(args);

    expect(plan.sourcePacketPath).toMatch(/downloads\/deep-take\.json$/);
    expect(plan.recoveredSessionPath).toMatch(/tmp\/local-proof\/recovered-session\.json$/);
    expect(plan.recovery.args).toEqual([
      "--packet", plan.sourcePacketPath,
      "--out", plan.recoveredSessionPath,
    ]);
    expect(plan.proof.args).toEqual(expect.arrayContaining([
      "--deep-capture",
      "--packet", plan.recoveredSessionPath,
      "--local-test-auth",
      "--secret", "test-secret",
      "--headed",
    ]));

    const runProcess = vi.fn(async () => undefined);
    await runLocalDeepCaptureProof([
      "--packet", "downloads/deep-take.json",
      "--out", "tmp/local-proof",
      "--preflight-only",
    ], { runProcess });
    expect(runProcess).toHaveBeenCalledTimes(1);
    expect(runProcess.mock.calls[0]?.[0]).toMatch(/recover-local-movement-packet\.mjs$/);
  });
});
