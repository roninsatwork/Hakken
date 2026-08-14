import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CONNECTOR_TOKEN_ENCRYPTION_UNCONFIGURED_MESSAGE,
  decryptConnectorToken,
  encryptConnectorToken,
  isConnectorTokenEncryptionConfigured,
} from "./connectorTokenCrypto";

/**
 * The ciphertext discipline for OAuth tokens: what goes into the database
 * must be useless without the deployment's own key, and a wrong or tampered
 * value must fail loudly rather than decrypt to garbage.
 */
describe("connector token encryption", () => {
  const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
  const OTHER_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");

  beforeEach(() => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("round-trips a token, and the ciphertext is not the plaintext", async () => {
    const stored = await encryptConnectorToken("ya29.a0AfB_secret-token");
    expect(stored).not.toContain("ya29");
    expect(await decryptConnectorToken(stored)).toBe("ya29.a0AfB_secret-token");
  });

  test("two encryptions of the same token differ (fresh IV each time)", async () => {
    const first = await encryptConnectorToken("same-token");
    const second = await encryptConnectorToken("same-token");
    expect(first).not.toBe(second);
  });

  test("a wrong key fails to decrypt rather than returning garbage", async () => {
    const stored = await encryptConnectorToken("secret");
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", OTHER_KEY);
    await expect(decryptConnectorToken(stored)).rejects.toThrow();
  });

  test("tampered ciphertext fails to decrypt", async () => {
    const stored = await encryptConnectorToken("secret");
    const bytes = Buffer.from(stored, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    await expect(decryptConnectorToken(bytes.toString("base64"))).rejects.toThrow();
  });

  test("an unconfigured deployment refuses with the message naming the fix", async () => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", "");
    expect(isConnectorTokenEncryptionConfigured()).toBe(false);
    await expect(encryptConnectorToken("secret")).rejects.toThrow(
      CONNECTOR_TOKEN_ENCRYPTION_UNCONFIGURED_MESSAGE
    );
  });

  test("a short or malformed key counts as unconfigured", () => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from("short").toString("base64"));
    expect(isConnectorTokenEncryptionConfigured()).toBe(false);
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", "not base64 at all !!!");
    expect(isConnectorTokenEncryptionConfigured()).toBe(false);
  });
});
