import { describe, expect, it } from "vitest";
import { buildFailureKey, pickGroupLabel } from "./agentFailureKeyService";

describe("buildFailureKey", () => {
  it("groups the same failure worded with and without a duration", () => {
    const withDuration = buildFailureKey("Property search timed out after 24000ms");
    const withoutDuration = buildFailureKey("Property search timed out");
    expect(withDuration).toBe(withoutDuration);
  });

  it("groups the same failure carrying different Convex ids", () => {
    const first = buildFailureKey("Tool call mh75esr2sejpx6n4ammbv259kn86729c was rejected");
    const second = buildFailureKey("Tool call kd91xba7zqmr3p8vnnce4718fz20553a was rejected");
    expect(first).toBe(second);
    expect(first).toContain("<id>");
  });

  it("groups the same failure carrying different UUIDs", () => {
    const first = buildFailureKey("Connector 3f2504e0-4f89-11d3-9a0c-0305e82c3301 is offline");
    const second = buildFailureKey("Connector 8a1fe09c-9d2b-41a7-b0f4-6c7d2e5a9910 is offline");
    expect(first).toBe(second);
  });

  it("groups the same failure pointing at different URLs", () => {
    const first = buildFailureKey("Request to https://api.example.com/v1/search failed");
    const second = buildFailureKey("Request to https://api.example.com/v2/lookup failed");
    expect(first).toBe(second);
  });

  it("groups the same failure naming different quoted values", () => {
    const first = buildFailureKey('Missing required argument "postcode"');
    const second = buildFailureKey('Missing required argument "bedrooms"');
    expect(first).toBe(second);
  });

  it("groups the same failure stamped with different timestamps", () => {
    const first = buildFailureKey("Run abandoned at 2026-07-28T09:14:22Z");
    const second = buildFailureKey("Run abandoned at 2026-07-29T17:02:41Z");
    expect(first).toBe(second);
  });

  it("keeps genuinely different failures apart", () => {
    const timeout = buildFailureKey("Property search timed out after 24000ms");
    const refusal = buildFailureKey("The model refused to answer");
    expect(timeout).not.toBe(refusal);
  });

  it("does not collapse ordinary long words into an id", () => {
    const key = buildFailureKey("Authentication was unsuccessful");
    expect(key).toBe("authentication was unsuccessful");
  });

  it("ignores differences in case and spacing", () => {
    expect(buildFailureKey("  Search   TIMED   out ")).toBe(buildFailureKey("search timed out"));
  });

  it("returns undefined when there is no message to key on", () => {
    expect(buildFailureKey(undefined)).toBeUndefined();
    expect(buildFailureKey(null)).toBeUndefined();
    expect(buildFailureKey("")).toBeUndefined();
    expect(buildFailureKey("   ")).toBeUndefined();
  });

  it("caps the key so a stack trace cannot become the grouping key", () => {
    const key = buildFailureKey("failure ".repeat(200));
    expect(key!.length).toBeLessThanOrEqual(200);
  });
});

describe("pickGroupLabel", () => {
  it("shows the shortest wording, as the one least likely to carry a one-off id", () => {
    const label = pickGroupLabel([
      "Property search timed out after 24000ms on run mh75esr2sejpx6n4ammbv259kn86729c",
      "Property search timed out",
      "Property search timed out after 19000ms",
    ]);
    expect(label).toBe("Property search timed out");
  });

  it("falls back rather than showing an empty group heading", () => {
    expect(pickGroupLabel([])).toBe("Unknown failure");
    expect(pickGroupLabel(["   "])).toBe("Unknown failure");
  });
});
