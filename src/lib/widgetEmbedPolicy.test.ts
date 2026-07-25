import { describe, expect, test } from "vitest";
import { decideWidgetEmbed, widgetIdFromPathname } from "./widgetEmbedPolicy";

const ALLOWED = ["acmecorp.com"];

describe("widget embed policy", () => {
  test("recognises widget iframe paths only", () => {
    expect(widgetIdFromPathname("/w/abc123")).toBe("abc123");
    expect(widgetIdFromPathname("/w/abc123/")).toBe("abc123");
    expect(widgetIdFromPathname("/w/abc123/extra")).toBeNull();
    expect(widgetIdFromPathname("/admin/widgets")).toBeNull();
    expect(widgetIdFromPathname("/w/")).toBeNull();
  });

  test("allows an embed from an approved host and pins frame-ancestors to it", () => {
    const decision = decideWidgetEmbed({
      allowedDomains: ALLOWED,
      widgetExists: true,
      referer: "https://acmecorp.com/pricing",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.frameAncestors).toBe("https://acmecorp.com https://*.acmecorp.com");
  });

  test("blocks an embed from an unapproved host", () => {
    const decision = decideWidgetEmbed({
      allowedDomains: ALLOWED,
      widgetExists: true,
      referer: "https://evil.test/steal",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe("referer_not_allowed");
    expect(decision.refererHost).toBe("evil.test");
  });

  test("blocks a lookalike host that merely ends with the allowed name", () => {
    expect(
      decideWidgetEmbed({
        allowedDomains: ALLOWED,
        widgetExists: true,
        referer: "https://acmecorp.com.evil.test/",
      }).allowed,
    ).toBe(false);
  });

  test("allows direct visits, which are not embeds", () => {
    // No referer means nobody is framing us, so there is no host site to
    // authorise. frame-ancestors still constrains the framed case.
    const decision = decideWidgetEmbed({
      allowedDomains: ALLOWED,
      widgetExists: true,
      referer: null,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.frameAncestors).toBe("https://acmecorp.com https://*.acmecorp.com");
  });

  test("denies unknown or inactive widgets without leaking a permissive header", () => {
    const decision = decideWidgetEmbed({
      allowedDomains: undefined,
      widgetExists: false,
      referer: "https://acmecorp.com/",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe("unknown_widget");
    expect(decision.frameAncestors).toBe("'none'");
  });

  test("a widget with no configured domains is embeddable nowhere", () => {
    const decision = decideWidgetEmbed({
      allowedDomains: [],
      widgetExists: true,
      referer: "https://acmecorp.com/",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.frameAncestors).toBe("'none'");
  });

  test("honours an explicit wildcard allowlist", () => {
    const decision = decideWidgetEmbed({
      allowedDomains: ["*"],
      widgetExists: true,
      referer: "https://anywhere.test/",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.frameAncestors).toBe("*");
  });
});
