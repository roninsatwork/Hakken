import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isSiteMenuPath, sitePageForPath } from "./sitePages";
import { useRecordBack, useSiteBackHref, useSiteListHref, useSiteRecordHref } from "./siteRecordLinks";

const { address } = vi.hoisted(() => ({ address: { pathname: "/app/sites/site_1/keywords", search: "" } }));

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ siteId: "site_1" }),
  usePathname: () => address.pathname,
  useSearchParams: () => new URLSearchParams(address.search),
}));
vi.mock("convex/react", () => ({ useQuery: () => undefined }));

const at = (pathname: string, search = "") => {
  address.pathname = pathname;
  address.search = search;
};

/**
 * Every click in Sites opens a screen with a back button (Anthony,
 * 2026-09-24): the link carries where it was clicked from, and Back returns
 * there as it was left — or, for a bookmark, to the page the record belongs to.
 */
describe("record screens and the way back", () => {
  it("files a record's screen under the menu page it belongs to", () => {
    expect(sitePageForPath("/app/sites/site_1/keywords/keyword", "site_1").id).toBe("keywordsAll");
    expect(sitePageForPath("/app/sites/site_1/keywords/pages/page", "site_1").id).toBe("keywordsPages");
    expect(sitePageForPath("/app/sites/site_1/keywords/pages", "site_1").id).toBe("keywordsPages");
    expect(isSiteMenuPath("/app/sites/site_1/keywords/pages", "site_1")).toBe(true);
    expect(isSiteMenuPath("/app/sites/site_1/keywords/pages/page", "site_1")).toBe(false);
  });

  it("links to a record with the dates and the page, filters and table page it was opened from", () => {
    at("/app/sites/site_1/keywords", "from=2026-08-01&to=2026-09-24&band=p01_03&p=3");
    const { result } = renderHook(() => useSiteRecordHref("site_1"));
    const href = new URL(result.current({ kind: "keyword", keyword: "carp rods" }), "https://app.test");

    expect(href.pathname).toBe("/app/sites/site_1/keywords/keyword");
    expect(href.searchParams.get("keyword")).toBe("carp rods");
    expect(href.searchParams.get("from")).toBe("2026-08-01");
    // A page's own filters travel only as the way back, never onto the record.
    expect(href.searchParams.get("band")).toBeNull();
    expect(href.searchParams.get("back")).toBe("/app/sites/site_1/keywords?from=2026-08-01&to=2026-09-24&band=p01_03&p=3");
  });

  it("links to a list narrowed by its filters, with the way back", () => {
    at("/app/sites/site_1/keywords/bands", "");
    const { result } = renderHook(() => useSiteListHref("site_1"));
    const href = new URL(result.current("keywords", { band: "p04_10" }), "https://app.test");

    expect(href.pathname).toBe("/app/sites/site_1/keywords");
    expect(href.searchParams.get("band")).toBe("p04_10");
    expect(href.searchParams.get("back")).toBe("/app/sites/site_1/keywords/bands");
  });

  it("goes back where the record was opened from, and names the page", () => {
    at("/app/sites/site_1/keywords/keyword", `keyword=korda&back=${encodeURIComponent("/app/sites/site_1/keywords?p=3")}`);
    const { result } = renderHook(() => useRecordBack("keyword"));

    expect(result.current.href).toBe("/app/sites/site_1/keywords?p=3");
    expect(result.current.label).toBe("sites.record.backTo");
  });

  it("files Tracked fan-out queries as a menu page, and a query opened from it goes back there by its name", () => {
    expect(isSiteMenuPath("/app/sites/site_1/google/fan-out", "site_1")).toBe(true);
    expect(sitePageForPath("/app/sites/site_1/google/fan-out", "site_1").id).toBe("googleTrackedFanOut");

    at("/app/sites/site_1/google/fan-out", "verdict=TOP_THREE");
    const href = new URL(renderHook(() => useSiteRecordHref("site_1")).result.current({ kind: "keyword", keyword: "ai automation agency london uk" }), "https://app.test");
    expect(href.pathname).toBe("/app/sites/site_1/keywords/keyword");
    expect(href.searchParams.get("back")).toBe("/app/sites/site_1/google/fan-out?verdict=TOP_THREE");

    at(href.pathname, href.search.slice(1));
    const back = renderHook(() => useRecordBack("keyword")).result.current;
    expect(back.href).toBe("/app/sites/site_1/google/fan-out?verdict=TOP_THREE");
    // "Back to Tracked fan-out queries": the menu page's own name in the record's back words.
    expect(back.label).toBe("sites.record.backTo");
    expect(back.page).toBe("sites.menu.pages.googleTrackedFanOut");
    // Which reads, in each language, as "Back to Tracked fan-out queries".
    for (const [language, expected] of [["en", "Back to Tracked fan-out queries"], ["it", "Query fan-out monitorate"]] as const) {
      const words = JSON.parse(readFileSync(join(process.cwd(), "messages", `${language}.json`), "utf8"));
      expect(words.sites.record.backTo.replace("{page}", words.sites.menu.pages.googleTrackedFanOut)).toContain(expected);
    }
  });

  it("goes back to the page a record belongs to when opened from a bookmark, and never off the app", () => {
    at("/app/sites/site_1/keywords/pages/page", "path=%2F&from=2026-08-01");
    expect(renderHook(() => useSiteBackHref("site_1", "page")).result.current).toBe("/app/sites/site_1/keywords/pages?from=2026-08-01");

    for (const outside of ["https://elsewhere.test/", "//elsewhere.test/app/sites/x", "/admin/settings"]) {
      at("/app/sites/site_1/keywords/keyword", `keyword=korda&back=${encodeURIComponent(outside)}`);
      expect(renderHook(() => useSiteBackHref("site_1", "keyword")).result.current).toBe("/app/sites/site_1/keywords");
    }
  });
});
