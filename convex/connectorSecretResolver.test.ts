import { describe, expect, test } from "vitest";
import {
  CONNECTOR_SECRET_ENV_PREFIX,
  buildConnectorSecretEnvName,
  resolveConnectorSecret,
  resolveConnectorSecrets,
} from "./connectorSecretResolver";

/**
 * The connector design stores a pointer to a credential and never the
 * credential. The pointer was written and read back by nothing, anywhere — so a
 * connector could be fully "configured" and still have no way to obtain what it
 * needed. This is the missing half.
 */

describe("mapping a reference to a deployment variable", () => {
  test("namespaces every lookup", () => {
    // Without the prefix a reference called "path" would read PATH, which is
    // both a leak and a deeply confusing bug.
    expect(buildConnectorSecretEnvName("path")).toBe(`${CONNECTOR_SECRET_ENV_PREFIX}PATH`);
    expect(buildConnectorSecretEnvName("home")).not.toBe("HOME");
  });

  test("flattens a vault-style path into one name", () => {
    expect(buildConnectorSecretEnvName("vault/acme/crm/base_url"))
      .toBe("CONNECTOR_SECRET_VAULT_ACME_CRM_BASE_URL");
  });

  test("is insensitive to case and separators an administrator might vary", () => {
    // Somebody who can see the variable they set should not get "not
    // configured" because they typed the reference slightly differently.
    const expected = "CONNECTOR_SECRET_ACME_BASE_URL";
    expect(buildConnectorSecretEnvName("acme/base_url")).toBe(expected);
    expect(buildConnectorSecretEnvName("ACME.BASE-URL")).toBe(expected);
    expect(buildConnectorSecretEnvName("  acme:base:url  ")).toBe(expected);
  });
});

describe("resolving one reference", () => {
  const env = { CONNECTOR_SECRET_ACME_BASE_URL: "https://api.acme.test/v1/" };

  test("finds a configured value", () => {
    expect(resolveConnectorSecret("acme/base_url", env)).toEqual({
      found: true,
      value: "https://api.acme.test/v1/",
    });
  });

  test("reports the variable to set when it is missing", () => {
    // The operator needs to know which variable to set. They do not need the
    // near-miss, and nothing should echo the environment back.
    const result = resolveConnectorSecret("acme/token", env);
    expect(result).toEqual({ found: false, envName: "CONNECTOR_SECRET_ACME_TOKEN" });
  });

  test("treats an empty value as unset", () => {
    expect(resolveConnectorSecret("acme/base_url", { CONNECTOR_SECRET_ACME_BASE_URL: "   " }).found)
      .toBe(false);
  });
});

describe("resolving everything a connector needs", () => {
  test("returns the values keyed by the connector's own names", () => {
    const result = resolveConnectorSecrets({
      refs: [
        { key: "base_url", providerRef: "acme/base_url" },
        { key: "auth_header", providerRef: "acme/auth" },
      ],
      env: {
        CONNECTOR_SECRET_ACME_BASE_URL: "https://api.acme.test/",
        CONNECTOR_SECRET_ACME_AUTH: "Bearer abc",
      },
    });

    expect(result).toEqual({
      ok: true,
      values: { base_url: "https://api.acme.test/", auth_header: "Bearer abc" },
    });
  });

  test("refuses the whole connector when one value is missing", () => {
    // Half a configuration is worse than none: an address without a credential
    // sends an unauthenticated request to a customer's system and hands the
    // agent a 401 to reason about.
    const result = resolveConnectorSecrets({
      refs: [
        { key: "base_url", providerRef: "acme/base_url" },
        { key: "auth_header", providerRef: "acme/auth" },
      ],
      env: { CONNECTOR_SECRET_ACME_BASE_URL: "https://api.acme.test/" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["CONNECTOR_SECRET_ACME_AUTH"]);
      expect(result.reason).toContain("CONNECTOR_SECRET_ACME_AUTH");
      // The reason is shown to an operator, so it must not carry a value.
      expect(result.reason).not.toContain("https://api.acme.test/");
    }
  });

  test("a connector needing nothing resolves trivially", () => {
    expect(resolveConnectorSecrets({ refs: [], env: {} })).toEqual({ ok: true, values: {} });
  });
});
