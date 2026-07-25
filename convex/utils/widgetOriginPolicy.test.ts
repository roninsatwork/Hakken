import { describe, expect, test } from "vitest";
import {
  allowsAnyDomain,
  buildFrameAncestors,
  isHostAllowed,
  normalizeAllowedDomain,
  parseHostFromUrl,
} from "./widgetOriginPolicy";

describe("widget origin policy", () => {
  test("normalizes the shapes admins actually type", () => {
    expect(normalizeAllowedDomain("https://AcmeCorp.com/")).toBe("acmecorp.com");
    expect(normalizeAllowedDomain("http://acmecorp.com")).toBe("acmecorp.com");
    expect(normalizeAllowedDomain("  acmecorp.com  ")).toBe("acmecorp.com");
  });

  test("parses hosts only from absolute http(s) urls", () => {
    expect(parseHostFromUrl("https://acmecorp.com/pricing")).toBe("acmecorp.com");
    expect(parseHostFromUrl("//acmecorp.com")).toBeNull();
    expect(parseHostFromUrl("javascript:alert(1)")).toBeNull();
    expect(parseHostFromUrl("not a url")).toBeNull();
  });

  test("rejects urls carrying embedded credentials", () => {
    // https://acmecorp.com@evil.test/ resolves to evil.test while reading as
    // the allowed host.
    expect(parseHostFromUrl("https://acmecorp.com@evil.test/")).toBeNull();
  });

  test("matches apex and subdomains but not lookalike suffixes", () => {
    const allowed = ["acmecorp.com"];
    expect(isHostAllowed("acmecorp.com", allowed)).toBe(true);
    expect(isHostAllowed("shop.acmecorp.com", allowed)).toBe(true);
    expect(isHostAllowed("ACMECORP.com", allowed)).toBe(true);
    expect(isHostAllowed("notacmecorp.com", allowed)).toBe(false);
    expect(isHostAllowed("acmecorp.com.evil.test", allowed)).toBe(false);
    expect(isHostAllowed("evil.test", allowed)).toBe(false);
  });

  test("denies by default when nothing is configured", () => {
    expect(isHostAllowed("acmecorp.com", [])).toBe(false);
    expect(isHostAllowed("acmecorp.com", undefined)).toBe(false);
    expect(buildFrameAncestors([])).toBe("'none'");
    expect(buildFrameAncestors(undefined)).toBe("'none'");
  });

  test("honours an explicit wildcard", () => {
    expect(allowsAnyDomain(["*"])).toBe(true);
    expect(isHostAllowed("anything.test", ["*"])).toBe(true);
    expect(buildFrameAncestors(["*"])).toBe("*");
    expect(buildFrameAncestors(["acmecorp.com", "*"])).toBe("*");
  });

  test("emits apex and wildcard sources so the header matches isHostAllowed", () => {
    expect(buildFrameAncestors(["https://acmecorp.com/"])).toBe(
      "https://acmecorp.com https://*.acmecorp.com",
    );

    const both = buildFrameAncestors(["acmecorp.com", "partner.test"]);
    expect(both).toBe(
      "https://acmecorp.com https://*.acmecorp.com https://partner.test https://*.partner.test",
    );
  });

  test("drops malformed entries rather than emitting a broken header", () => {
    // A CSP source list with whitespace or a path in it silently invalidates
    // the directive, which would fail open.
    expect(buildFrameAncestors(["acme corp.com", "acmecorp.com/path", "acmecorp.com"])).toBe(
      "https://acmecorp.com https://*.acmecorp.com",
    );
    expect(buildFrameAncestors(["acme corp.com"])).toBe("'none'");
  });

  test("deduplicates entries that normalize to the same host", () => {
    expect(buildFrameAncestors(["acmecorp.com", "https://acmecorp.com/"])).toBe(
      "https://acmecorp.com https://*.acmecorp.com",
    );
  });
});
