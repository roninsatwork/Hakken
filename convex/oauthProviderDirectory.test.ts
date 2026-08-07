import { describe, expect, test } from "vitest";

import { enabledOAuthProviders, gatedOAuthProviders } from "./oauthProviderDirectory";

describe("oauthProviderDirectory", () => {
  test("google is always enabled, credentials or not", () => {
    const enabled = enabledOAuthProviders({});
    expect(enabled.map((p) => p.id)).toEqual(["google"]);
  });

  test("a provider appears once both of its credentials exist", () => {
    const enabled = enabledOAuthProviders({
      AUTH_MICROSOFT_ENTRA_ID_ID: "client-id",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "secret",
    });
    expect(enabled.map((p) => p.id)).toEqual(["google", "microsoft-entra-id"]);
  });

  /**
   * Half a configuration draws no button. The failure a secretless provider
   * produces lands on the person signing in, not the person configuring.
   */
  test("half a configuration enables nothing", () => {
    const enabled = enabledOAuthProviders({
      AUTH_LINKEDIN_SECRET: "secret",
      AUTH_MICROSOFT_ENTRA_ID_ID: "   ",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "secret",
    });
    expect(enabled.map((p) => p.id)).toEqual(["google"]);
  });

  test("buttons keep a stable order however the env is written", () => {
    const enabled = enabledOAuthProviders({
      AUTH_LINKEDIN_ID: "a",
      AUTH_LINKEDIN_SECRET: "b",
      AUTH_MICROSOFT_ENTRA_ID_ID: "c",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "d",
    });
    expect(enabled.map((p) => p.id)).toEqual(["google", "microsoft-entra-id", "linkedin"]);
  });

  test("the gated list never contains the always-on legacy provider", () => {
    const gated = gatedOAuthProviders({
      AUTH_GOOGLE_ID: "a",
      AUTH_GOOGLE_SECRET: "b",
      AUTH_LINKEDIN_ID: "c",
      AUTH_LINKEDIN_SECRET: "d",
    });
    expect(gated.map((p) => p.id)).toEqual(["linkedin"]);
  });
});
