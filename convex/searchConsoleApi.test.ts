import { afterEach, describe, expect, test, vi } from "vitest";
import { propertiesForHost, propertyFit, queryAnalytics, GOOGLE_PAGE_ROWS } from "./searchConsoleApi";
import { daysNewestFirst, historyLimitDay, newestWholeDay } from "./searchConsoleDays";

/**
 * Search Console's API as Hakken reads it (docs/plans/active/
 * search-console-plan.md §2): which of an account's properties are a given
 * website, every row of an answer however many pages it takes, what each of
 * Google's refusals means, and which days there are to ask for.
 */

afterEach(() => vi.unstubAllGlobals());

describe("which properties are the website", () => {
  test("a domain property is the site, with or without www; a subdomain's parent covers more than it", () => {
    expect(propertyFit("sc-domain:acme-shop.test", "acme-shop.test")).toBe(0);
    expect(propertyFit("sc-domain:www.acme-shop.test", "acme-shop.test")).toBe(0);
    expect(propertyFit("sc-domain:acme-shop.test", "blog.acme-shop.test")).toBe(3);
    expect(propertyFit("sc-domain:blog.acme-shop.test", "acme-shop.test")).toBeNull();
    expect(propertyFit("sc-domain:notacme-shop.test", "acme-shop.test")).toBeNull();
  });

  test("an address from the root is the whole site; one with a path is part of it", () => {
    expect(propertyFit("https://www.acme-shop.test/", "acme-shop.test")).toBe(1);
    expect(propertyFit("http://acme-shop.test/", "acme-shop.test")).toBe(1);
    expect(propertyFit("https://acme-shop.test/blog/", "acme-shop.test")).toBe(2);
    expect(propertyFit("https://shop.acme-shop.test/", "acme-shop.test")).toBeNull();
    expect(propertyFit("not a property", "acme-shop.test")).toBeNull();
  });

  test("best first; one it cannot read is set apart; the only whole-site one it can read is chosen", () => {
    const matched = propertiesForHost([
      { property: "https://acme-shop.test/blog/", permission: "siteOwner" },
      { property: "http://www.acme-shop.test/", permission: "siteFullUser" },
      { property: "https://www.acme-shop.test/", permission: "siteRestrictedUser" },
      { property: "sc-domain:acme-shop.test", permission: "siteUnverifiedUser" },
      { property: "https://other.test/", permission: "siteOwner" },
    ], "acme-shop.test");
    expect(matched.readable.map((entry) => entry.property)).toEqual([
      "https://www.acme-shop.test/",
      "http://www.acme-shop.test/",
      "https://acme-shop.test/blog/",
    ]);
    expect(matched.unverified.map((entry) => entry.property)).toEqual(["sc-domain:acme-shop.test"]);
    expect(matched.only).toBeNull();

    expect(propertiesForHost([
      { property: "sc-domain:acme-shop.test", permission: "siteOwner" },
      { property: "https://other.test/", permission: "siteOwner" },
    ], "acme-shop.test").only?.property).toBe("sc-domain:acme-shop.test");

    // Part of the site alone is never chosen without asking.
    expect(propertiesForHost([
      { property: "https://acme-shop.test/blog/", permission: "siteOwner" },
    ], "acme-shop.test").only).toBeNull();
  });
});

describe("asking for figures", () => {
  function stubAnswers(answer: (body: { startRow: number; rowLimit: number }) => Response) {
    const bodies: { startRow: number; rowLimit: number; dataState: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { startRow: number; rowLimit: number; dataState: string };
      bodies.push(body);
      return answer(body);
    }));
    return bodies;
  }

  const rows = (count: number) => Array.from({ length: count }, (_, index) => ({
    keys: [`search ${index}`], clicks: 1, impressions: 10, ctr: 0.1, position: 4.2,
  }));

  test("pages by 25,000 until an answer comes back short, fresh figures included", async () => {
    const bodies = stubAnswers((body) => Response.json({ rows: body.startRow === 0 ? rows(GOOGLE_PAGE_ROWS) : rows(3) }));
    const answer = await queryAnalytics("token", "sc-domain:acme-shop.test", {
      startDate: "2026-09-20", endDate: "2026-09-20", type: "web", dimensions: ["query"],
    });
    expect(answer.ok && answer.rows.length).toBe(GOOGLE_PAGE_ROWS + 3);
    expect(answer.ok && answer.requests).toBe(2);
    expect(bodies.map((body) => body.startRow)).toEqual([0, GOOGLE_PAGE_ROWS]);
    expect(bodies[0].dataState).toBe("all");
  });

  test("stops at Google's 50,000 a day", async () => {
    const bodies = stubAnswers(() => Response.json({ rows: rows(GOOGLE_PAGE_ROWS) }));
    const answer = await queryAnalytics("token", "sc-domain:acme-shop.test", {
      startDate: "2026-09-20", endDate: "2026-09-20", type: "web", dimensions: ["page"],
    });
    expect(answer.ok && answer.rows.length).toBe(2 * GOOGLE_PAGE_ROWS);
    expect(bodies).toHaveLength(2);
  });

  test("names the property in the address, encoded", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return Response.json({});
    }));
    await queryAnalytics("token", "https://www.acme-shop.test/", {
      startDate: "2026-09-20", endDate: "2026-09-20", type: "web", dimensions: ["date"],
    });
    expect(urls[0]).toBe(
      "https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.acme-shop.test%2F/searchAnalytics/query",
    );
  });

  test.each([
    [401, "", "EXPIRED"],
    [403, "User does not have sufficient permission for site", "ACCESS"],
    [403, "Quota exceeded for quota metric", "BUSY"],
    [429, "", "BUSY"],
    [503, "", "BUSY"],
    [400, "Invalid dimension for this search type", "REFUSED"],
  ])("answers %i (%s) as %s", async (status, detail, reason) => {
    stubAnswers(() => new Response(detail, { status }));
    const answer = await queryAnalytics("token", "sc-domain:acme-shop.test", {
      startDate: "2026-09-20", endDate: "2026-09-20", type: "web", dimensions: ["query"],
    });
    expect(answer.ok ? null : answer.reason).toBe(reason);
  });

  test("Google out of reach is said so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const answer = await queryAnalytics("token", "sc-domain:acme-shop.test", {
      startDate: "2026-09-20", endDate: "2026-09-20", type: "web", dimensions: ["query"],
    });
    expect(answer.ok ? null : answer.reason).toBe("UNREACHABLE");
  });
});

describe("Google's days", () => {
  test("the newest day asked for is the last whole day in California", () => {
    // Nine in the morning UTC: one o'clock there, so yesterday has ended.
    expect(newestWholeDay(Date.parse("2026-09-27T09:00:00Z"))).toBe("2026-09-26");
    // Half past seven UTC: still yesterday evening there.
    expect(newestWholeDay(Date.parse("2026-09-27T07:30:00Z"))).toBe("2026-09-25");
  });

  test("the history goes back the sixteen months Google keeps", () => {
    expect(historyLimitDay(Date.parse("2026-09-27T09:00:00Z"))).toBe("2025-05-26");
  });

  test("days are listed newest first", () => {
    expect(daysNewestFirst("2026-02-27", "2026-03-02")).toEqual(["2026-03-02", "2026-03-01", "2026-02-28", "2026-02-27"]);
  });
});
