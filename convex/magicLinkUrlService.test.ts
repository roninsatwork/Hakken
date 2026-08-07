import { describe, expect, test } from "vitest";

import { CONSENT_CODE_PARAM, buildConsentUrl } from "./magicLinkUrlService";

const SITE = "https://sonae.example.com";

describe("buildConsentUrl", () => {
  /**
   * The point of the whole module. A mailed link must not carry `code`, because
   * the React client redeems that parameter on mount — which is how a mail
   * gateway spent every link it delivered.
   */
  test("moves the code onto an inert parameter on the consent page", () => {
    const url = new URL(buildConsentUrl(`${SITE}/?code=abc123`, SITE));

    expect(url.pathname).toBe("/verify");
    expect(url.searchParams.get(CONSENT_CODE_PARAM)).toBe("abc123");
    expect(url.searchParams.get("code")).toBeNull();
  });

  test("carries a redirect through so the link still lands where it meant to", () => {
    const url = new URL(buildConsentUrl(`${SITE}/?code=abc123&redirectTo=%2Fapp%2Freports`, SITE));

    expect(url.searchParams.get(CONSENT_CODE_PARAM)).toBe("abc123");
    expect(url.searchParams.get("redirectTo")).toBe("/app/reports");
  });

  test("tolerates a site URL with a trailing slash", () => {
    expect(new URL(buildConsentUrl(`${SITE}/?code=abc123`, `${SITE}/`)).pathname).toBe("/verify");
  });

  /**
   * Every fallback returns the framework's own link rather than a broken one. A
   * link that a scanner can spend still signs a person in; a malformed link
   * strands them, which is worse than the problem being solved.
   */
  test("returns the original URL when no site URL is configured", () => {
    const original = `${SITE}/?code=abc123`;
    expect(buildConsentUrl(original, undefined)).toBe(original);
    expect(buildConsentUrl(original, "   ")).toBe(original);
  });

  test("returns the original URL when there is no code to move", () => {
    const original = `${SITE}/welcome`;
    expect(buildConsentUrl(original, SITE)).toBe(original);
  });

  test("returns the original URL when it cannot be parsed", () => {
    expect(buildConsentUrl("not a url", SITE)).toBe("not a url");
  });
});
