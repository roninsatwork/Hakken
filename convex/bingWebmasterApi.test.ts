import { afterEach, describe, expect, test, vi } from "vitest";
import { callBing, dayOfBingDate, pageInfo, positionOf, queryStats, sitesForHost, trafficDays } from "./bingWebmasterApi";

/**
 * Bing Webmaster's answers read as Hakken reads them
 * (docs/plans/active/bing-webmaster-plan.md §2): WCF dates, the account's
 * sites matched to the website, refusals named, keyword rows. Bing faked at
 * the network.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));
}

describe("Bing's dates", () => {
  test("a WCF date is the day where it was written", () => {
    // 16 Sept 2011, 07:00 UTC: midnight in Bing's -0700.
    expect(dayOfBingDate("/Date(1316156400000-0700)/")).toBe("2011-09-16");
    expect(dayOfBingDate("/Date(1760140800000)/")).toBe("2025-10-11");
    expect(dayOfBingDate("2026-10-11T00:00:00")).toBe("2026-10-11");
    expect(dayOfBingDate("yesterday")).toBeNull();
    expect(dayOfBingDate(42)).toBeNull();
  });

  test("a position of -1 or 0 is Bing having none", () => {
    expect(positionOf(4.37)).toBe(4.37);
    expect(positionOf(-1)).toBeNull();
    expect(positionOf(0)).toBeNull();
  });
});

describe("the account's sites that are this website", () => {
  test("the one verified site that is the whole website is chosen without asking, https first", () => {
    const fit = sitesForHost([
      { site: "http://www.ronins.co.uk/", verified: true },
      { site: "https://www.ronins.co.uk/", verified: true },
      { site: "https://another.test/", verified: true },
    ], "ronins.co.uk");
    expect(fit.readable.map((entry) => entry.site)).toEqual(["https://www.ronins.co.uk/", "http://www.ronins.co.uk/"]);
    expect(fit.only).toBeNull();
    expect(sitesForHost([{ site: "https://www.ronins.co.uk/", verified: true }], "ronins.co.uk").only?.site).toBe("https://www.ronins.co.uk/");
  });

  test("a site the account has not verified is not read, but said", () => {
    const fit = sitesForHost([{ site: "https://www.ronins.co.uk/", verified: false }], "ronins.co.uk");
    expect(fit.readable).toEqual([]);
    expect(fit.unverified).toHaveLength(1);
  });

  test("part of the website is offered, never chosen alone", () => {
    const fit = sitesForHost([{ site: "https://www.ronins.co.uk/blog/", verified: true }], "ronins.co.uk");
    expect(fit.readable).toHaveLength(1);
    expect(fit.only).toBeNull();
  });
});

describe("calling Bing", () => {
  test("refusals are named as Google's are", async () => {
    answer(401, "expired");
    expect(await callBing("GetUserSites", "token", {})).toMatchObject({ ok: false, reason: "EXPIRED" });
    answer(400, '{"ErrorCode":14,"Message":"NotAuthorized"}');
    expect(await callBing("GetQueryStats", "token", { siteUrl: "https://www.ronins.co.uk/" })).toMatchObject({ ok: false, reason: "ACCESS" });
    answer(503, "unavailable");
    expect(await callBing("GetQueryStats", "token", {})).toMatchObject({ ok: false, reason: "BUSY" });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    expect(await callBing("GetQueryStats", "token", {})).toMatchObject({ ok: false, reason: "UNREACHABLE" });
  });

  test("the site and the token travel as Bing asks", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ d: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await queryStats("token-1", "https://www.ronins.co.uk/");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://www.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=https%3A%2F%2Fwww.ronins.co.uk%2F");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
  });

  test("keyword rows: each keyword's week, clicks, impressions and position when shown", async () => {
    answer(200, { d: [
      { Query: "ronins", Date: "/Date(1760140800000)/", Clicks: 5, Impressions: 41, AvgImpressionPosition: 4.37, AvgClickPosition: 2 },
      { Query: "  ", Date: "/Date(1760140800000)/", Clicks: 1, Impressions: 1, AvgImpressionPosition: 1 },
      { Query: "ai agency", Date: "/Date(1760140800000)/", Clicks: 0, Impressions: 10, AvgImpressionPosition: -1 },
    ] });
    const read = await queryStats("token", "https://www.ronins.co.uk/");
    expect(read).toEqual({ ok: true, rows: [
      { key: "ronins", day: "2025-10-11", clicks: 5, impressions: 41, position: 4.37 },
      { key: "ai agency", day: "2025-10-11", clicks: 0, impressions: 10, position: null },
    ] });
  });

  test("daily totals come back a day each, oldest first", async () => {
    answer(200, { d: [
      { Date: "/Date(1760227200000)/", Clicks: 1, Impressions: 63 },
      { Date: "/Date(1760140800000)/", Clicks: 2, Impressions: 70 },
    ] });
    expect(await trafficDays("token", "https://www.ronins.co.uk/")).toEqual({ ok: true, days: [
      { day: "2025-10-11", clicks: 2, impressions: 70 },
      { day: "2025-10-12", clicks: 1, impressions: 63 },
    ] });
  });

  test("a page Bing does not hold is not in its index, not a failure", async () => {
    answer(400, '{"ErrorCode":8,"Message":"InvalidUrl"}');
    expect(await pageInfo("token", "https://www.ronins.co.uk/", "https://www.ronins.co.uk/venture-studio/")).toEqual({ ok: true, info: { inIndex: false, lastRead: null, status: null } });
    answer(200, { d: { Url: "https://www.ronins.co.uk/", HttpStatus: 200, LastCrawledDate: "/Date(1760140800000)/" } });
    expect(await pageInfo("token", "https://www.ronins.co.uk/", "https://www.ronins.co.uk/")).toEqual({ ok: true, info: { inIndex: true, lastRead: "2025-10-11", status: 200 } });
  });
});
