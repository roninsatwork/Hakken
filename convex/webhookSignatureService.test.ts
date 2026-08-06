import { describe, expect, test } from "vitest";
import {
  REPLAY_WINDOW_SECONDS,
  SIGNATURE_HEADER,
  SIGNATURE_VERSION,
  TIMESTAMP_HEADER,
  buildSignatureHeaders,
  buildSignaturePayload,
  formatSignature,
  hmacSha256Hex,
  shouldSign,
} from "./webhookSignatureService";

describe("what gets signed", () => {
  test("the version, the timestamp and the body, joined", () => {
    expect(buildSignaturePayload(1_700_000_000, '{"a":1}')).toBe('v1.1700000000.{"a":1}');
  });

  test("the timestamp is inside the signed content, not beside it", () => {
    // Signing the body alone lets someone who captures one delivery replay it
    // forever. Signed together, the signature cannot be moved to a fresh
    // timestamp.
    expect(buildSignaturePayload(1, "x")).not.toBe(buildSignaturePayload(2, "x"));
  });

  test("the signature names its scheme, so a receiver never has to guess", () => {
    expect(formatSignature("abc")).toBe(`${SIGNATURE_VERSION}=abc`);
  });

  test("a replay window is published for receivers to enforce", () => {
    expect(REPLAY_WINDOW_SECONDS).toBe(300);
  });
});

describe("whether to sign at all", () => {
  test("a secret means sign", () => {
    expect(shouldSign("s3cret")).toBe(true);
  });

  test("no secret means send unsigned, exactly as before", () => {
    // A destination configured before signing existed keeps working. Turning
    // every existing integration off in the name of security would be its own
    // outage.
    expect(shouldSign(undefined)).toBe(false);
    expect(shouldSign("")).toBe(false);
    expect(shouldSign("   ")).toBe(false);
  });
});

describe("the headers a delivery carries", () => {
  test("none at all when there is nothing to sign with", () => {
    return expect(
      buildSignatureHeaders({ secret: undefined, body: "{}", nowMs: 0 })
    ).resolves.toEqual({});
  });

  test("a timestamp in seconds and a versioned signature", async () => {
    const headers = await buildSignatureHeaders({
      secret: "s3cret",
      body: '{"a":1}',
      nowMs: 1_700_000_000_123,
      sign: async () => "deadbeef",
    });

    expect(headers[TIMESTAMP_HEADER]).toBe("1700000000");
    expect(headers[SIGNATURE_HEADER]).toBe("v1=deadbeef");
  });

  test("the same body at a different moment signs differently", async () => {
    const sign = async (_secret: string, payload: string) => payload;
    const first = await buildSignatureHeaders({ secret: "s", body: "x", nowMs: 1_000, sign });
    const second = await buildSignatureHeaders({ secret: "s", body: "x", nowMs: 2_000, sign });

    expect(first[SIGNATURE_HEADER]).not.toBe(second[SIGNATURE_HEADER]);
  });
});

describe("the signature itself", () => {
  test("is a real HMAC, reproducible by any receiver", async () => {
    // The published test vector for HMAC-SHA256 with key "key" over
    // "The quick brown fox jumps over the lazy dog". A receiver computing this
    // from our documentation must get the same answer.
    expect(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
    );
  });

  test("a different secret gives a different signature", async () => {
    const a = await hmacSha256Hex("one", "body");
    const b = await hmacSha256Hex("two", "body");

    expect(a).not.toBe(b);
  });

  test("is hex, so it survives a header", async () => {
    expect(await hmacSha256Hex("k", "b")).toMatch(/^[0-9a-f]{64}$/);
  });
});
