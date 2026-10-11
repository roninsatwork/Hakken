import { describe, expect, test } from "vitest";
import { beforeKey, siteNameOf, splitBeforeKey } from "./googleAnalyticsLists";
import { assistantOf } from "./utils/aiAssistants";

/**
 * The page before (docs/plans/active/google-analytics-plan.md §18.6.4): each
 * view's `pageReferrer` as a page of the website, another website, or none —
 * and another website named as people know it.
 */

const ADDRESSES = ["www.acme-shop.test", "acme-shop.test"];

describe("the page before", () => {
  test("a page of the website by its path, www. or not; another website by its host; nothing as none", () => {
    expect(beforeKey("https://www.acme-shop.test/ai-agency/?ref=menu", ADDRESSES)).toBe("page:/ai-agency/");
    expect(beforeKey("https://acme-shop.test", ADDRESSES)).toBe("page:/");
    expect(beforeKey("https://www.google.co.uk/", ADDRESSES)).toBe("site:google.co.uk");
    expect(beforeKey("https://chatgpt.com/c/abc", ADDRESSES)).toBe("site:chatgpt.com");
    for (const nothing of ["", "(not set)", "(direct)", "android-app://com.slack"]) expect(beforeKey(nothing, ADDRESSES)).not.toMatch(/^page:/);
    expect(beforeKey("", ADDRESSES)).toBe("none");
    expect(beforeKey("not an address", ADDRESSES)).toBe("none");
    expect(splitBeforeKey("page:~4")).toEqual({ kind: "page", value: "~4" });
    expect(splitBeforeKey("site:bing.com")).toEqual({ kind: "site", value: "bing.com" });
    expect(splitBeforeKey("none")).toEqual({ kind: "none", value: "" });
  });

  test("another website named as people know it, else its own address", () => {
    expect(siteNameOf("www.google.co.uk", assistantOf)).toBe("Google");
    expect(siteNameOf("chatgpt.com", assistantOf)).toBe("ChatGPT");
    expect(siteNameOf("www.perplexity.ai", assistantOf)).toBe("Perplexity");
    expect(siteNameOf("uk.linkedin.com", assistantOf)).toBe("LinkedIn");
    expect(siteNameOf("t.co", assistantOf)).toBe("X");
    expect(siteNameOf("teams.public.onecdn.static.microsoft", assistantOf)).toBe("Microsoft Teams");
    expect(siteNameOf("www.example.org", assistantOf)).toBe("example.org");
  });
});
