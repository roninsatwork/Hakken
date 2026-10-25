import { describe, expect, it } from "vitest";

import { isE2EAuthRuntimeEnabled } from "./e2eAuthEnvironment";

describe("the deterministic E2E auth environment gate", () => {
  it("requires both enablement and an explicit local label", () => {
    expect(isE2EAuthRuntimeEnabled({ E2E_AUTH_ENABLED: "1" })).toBe(false);
    expect(isE2EAuthRuntimeEnabled({ E2E_AUTH_ENABLED: "1", E2E_AUTH_ENVIRONMENT: "preview" })).toBe(false);
    expect(isE2EAuthRuntimeEnabled({ E2E_AUTH_ENABLED: "1", E2E_AUTH_ENVIRONMENT: "local" })).toBe(true);
  });

  it("never enables in a production runtime even if both flags were copied there", () => {
    expect(isE2EAuthRuntimeEnabled({
      E2E_AUTH_ENABLED: "1",
      E2E_AUTH_ENVIRONMENT: "local",
      NODE_ENV: "production",
    })).toBe(false);
  });
});
