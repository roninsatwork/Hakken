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

  it("goes back to the page a record belongs to when opened from a bookmark, and never off the app", () => {
    at("/app/sites/site_1/keywords/pages/page", "path=%2F&from=2026-08-01");
    expect(renderHook(() => useSiteBackHref("site_1", "page")).result.current).toBe("/app/sites/site_1/keywords/pages?from=2026-08-01");

    for (const outside of ["https://elsewhere.test/", "//elsewhere.test/app/sites/x", "/admin/settings"]) {
      at("/app/sites/site_1/keywords/keyword", `keyword=korda&back=${encodeURIComponent(outside)}`);
      expect(renderHook(() => useSiteBackHref("site_1", "keyword")).result.current).toBe("/app/sites/site_1/keywords");
    }
  });
});
