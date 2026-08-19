import { describe, expect, it } from "vitest";

import {
  collectBackendEnvKeys,
  evaluateDeployment,
  parseEnvListOutput,
  REQUIRED_KEYS,
} from "./verify-deployment-environment.mjs";

/**
 * The checker exists because a missing env key fails as a feature that
 * silently does nothing (maintenance plan M2.2). Two properties keep it
 * honest: a missing required key must be named, and a key the backend reads
 * that the classification has never heard of must fail the run — otherwise
 * the classification rots exactly the way .env.example did.
 */

describe("verify-deployment-environment", () => {
  it("classifies every key the backend actually reads", () => {
    const backendKeys = collectBackendEnvKeys();
    const { unclassified } = evaluateDeployment(backendKeys, []);

    expect(backendKeys.length).toBeGreaterThan(30);
    expect(unclassified).toEqual([]);
  });

  it("names a missing required key", () => {
    const everythingButAuth = REQUIRED_KEYS.filter((key) => key !== "AUTH_GOOGLE_ID");
    const { missingRequired } = evaluateDeployment([], everythingButAuth);

    expect(missingRequired).toEqual(["AUTH_GOOGLE_ID"]);
  });

  it("reports an absent feature group as the feature, not a wall of keys", () => {
    const { missingFeatures } = evaluateDeployment([], REQUIRED_KEYS);
    const voice = missingFeatures.find((entry) => entry.feature === "Voice sessions");

    expect(voice?.missing).toEqual(["VOICE_RELAY_URL", "VOICE_RELAY_SECRET"]);
  });

  it("is clean when everything required is set", () => {
    const { missingRequired } = evaluateDeployment([], REQUIRED_KEYS);

    expect(missingRequired).toEqual([]);
  });

  it("reads names out of convex env list output", () => {
    const output = "AUTH_GOOGLE_ID=abc123\nRESEND_API_KEY=re_xyz\nnot a key line\n";

    expect(parseEnvListOutput(output)).toEqual(["AUTH_GOOGLE_ID", "RESEND_API_KEY"]);
  });
});
