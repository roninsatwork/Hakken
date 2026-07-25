import { describe, expect, test } from "vitest";
import { assertSafeReferenceValue, assertSafeSecretRefs } from "./connectorSecretPolicy";

/**
 * Connectors store pointers into a vault, never credentials. These tests exist
 * separately from the OAuth flow that used to be their only caller: that flow is
 * currently unavailable, and a guard exercised only inside a disabled feature is
 * one nobody notices breaking.
 */

describe("connector secret references", () => {
  test("accepts opaque reference keys", () => {
    expect(() => assertSafeSecretRefs(["vault/slack/acme/bot", "kv:hubspot.token"])).not.toThrow();
  });

  test("rejects a pasted Slack bot token", () => {
    // The realistic mistake: an administrator pastes the credential into a field
    // labelled "reference" and the platform becomes a place secrets leak from.
    expect(() => assertSafeSecretRefs(["xoxb-1234-5678-abcdefg"]))
      .toThrow("must not contain raw secret values");
  });

  test("rejects other well-known credential shapes", () => {
    expect(() => assertSafeSecretRefs(["sk-abcdefghijklmnop"])).toThrow();
    expect(() => assertSafeSecretRefs(["ghp_abcdefghijklmnop"])).toThrow();
    expect(() => assertSafeSecretRefs(["-----BEGIN PRIVATE KEY-----"])).toThrow();
  });

  test("rejects anything that is not reference-shaped", () => {
    expect(() => assertSafeSecretRefs(["has spaces"])).toThrow("opaque reference keys");
    expect(() => assertSafeSecretRefs(["a"])).toThrow();
    expect(() => assertSafeSecretRefs(["x".repeat(200)])).toThrow();
  });
});

describe("connector reference values", () => {
  test("accepts an opaque account or token reference", () => {
    expect(() => assertSafeReferenceValue("workspace/acme", "OAuth account reference")).not.toThrow();
    expect(() => assertSafeReferenceValue("vault/slack/acme/bot", "OAuth token reference")).not.toThrow();
  });

  test("rejects a raw Google access token", () => {
    expect(() => assertSafeReferenceValue("ya29.a0AfB_byC", "OAuth token reference"))
      .toThrow("must not contain a raw secret value");
  });

  test("names the field it is complaining about", () => {
    // The message is the whole remediation, so it has to say which field.
    expect(() => assertSafeReferenceValue("bad value!", "OAuth account reference"))
      .toThrow("OAuth account reference must be an opaque reference key.");
  });
});
