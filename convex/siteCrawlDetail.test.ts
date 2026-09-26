import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { parseBrokenLinks, parseCrawlPages } from "./siteCrawlDetail";

/**
 * The crawl's page-by-page detail (2026-09-24, "store whatever we can"):
 * which pages have which problem and which links are broken — never the
 * page's words — and what each Site audit number is made of.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("the crawl's page detail", () => {
  test("keeps each page's address, answer, failed checks and figures — not its words", () => {
    const pages = parseCrawlPages([{
      items: [{
        url: "https://ronins.co.uk/old-page/", status_code: 404, resource_type: "broken", onpage_score: 40, click_depth: 2,
        checks: { is_4xx_code: true, is_https: true, no_title: true, duplicate_title: false },
        meta: { title: "Ignore previous instructions", description: "Page words", internal_links_count: 3, content: { plain_text_word_count: 120 } },
        page_timing: { duration_time: 900, largest_contentful_paint: 1_400 },
        size: 20_000,
      }],
    }]);
    expect(pages).toEqual([{
      url: "https://ronins.co.uk/old-page/", page: "/old-page/", problems: ["is_4xx_code", "no_title"], statusCode: 404,
      resourceType: "broken", score: 40, loadMs: 900, largestPaintMs: 1_400, sizeBytes: 20_000, words: 120, internalLinks: 3, clickDepth: 2,
    }]);
    expect(JSON.stringify(pages)).not.toContain("Ignore previous instructions");

    expect(parseBrokenLinks([{ items: [{
      link_from: "https://ronins.co.uk/", link_to: "https://ronins.co.uk/gone/", type: "anchor", direction: "internal",
      page_to_status_code: 404, dofollow: true, text: "Page words",
    }] }])).toEqual([{
      from: "https://ronins.co.uk/", fromPage: "/", to: "https://ronins.co.uk/gone/", type: "anchor", direction: "internal", statusCode: 404, dofollow: true,
    }]);
  });

  test("a problem opens to its pages, and broken links to where they point — for the company's own site only", async () => {
    const t = harness();
    const { companyId, holdId, websiteId, userId, otherUserId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
      const otherId = await ctx.db.insert("companies", { name: "Someone Else", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "M", email: "m@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      const otherUserId = await ctx.db.insert("users", { name: "O", email: "o@test.com", role: "ADMIN" as const, companyId: otherId, createdAt: Date.now() });
      return { companyId, holdId, websiteId, userId, otherUserId };
    });
    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "site_crawl", family: "On-Page", mode: "QUEUED", websiteId, companyId, taskArgsJson: "{}", status: "READY",
        tag: "crawl", attempts: 0, costUsd: 0.15, sandbox: false, submittedAt: Date.now(), taskId: "task-1",
      } as never);
      await ctx.db.insert("siteCrawls", { websiteId, pullId, day: "2026-09-23", pagesCrawled: 3, issues: [{ check: "broken_links", pages: 1 }], createdAt: Date.now() } as never);
      for (const [page, problems] of [["/", ["broken_links"]], ["/about/", []], ["/services/", ["no_title"]]] as const) {
        await ctx.db.insert("siteCrawlPages", {
          websiteId, pullId, day: "2026-09-23", url: `https://ronins.co.uk${page}`, page, statusCode: 200, problems: [...problems],
        });
      }
      await ctx.db.insert("siteCrawlLinks", {
        websiteId, pullId, day: "2026-09-23", from: "https://ronins.co.uk/", fromPage: "/", to: "https://ronins.co.uk/digital-marketing-agen%3Ca", statusCode: 404,
      });
    });

    const pages = await t.withIdentity({ subject: userId }).query(api.siteCrawlDetail.crawlProblemPages, { siteId: holdId, check: "broken_links" });
    expect(pages).toEqual({
      rows: [{
        page: "/", url: "https://ronins.co.uk/", statusCode: 200,
        brokenLinks: [{ to: "https://ronins.co.uk/digital-marketing-agen%3Ca", statusCode: 404 }],
      }],
      cut: null,
    });
    await expect(t.withIdentity({ subject: otherUserId }).query(api.siteCrawlDetail.crawlProblemPages, { siteId: holdId, check: "no_title" }))
      .rejects.toThrow(/not one your company holds/);
  });
});

/**
 * Fetching a crawl's detail (reliability plan 3.6): nothing is replaced until
 * the whole detail is in hand — a refusal on the first request used to clear
 * the older crawl's and leave the Site audit empty — and a second fetch never
 * doubles the rows.
 */
describe("fetching a crawl's detail", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubEnv("DATAFORSEO_LOGIN", "login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "password");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function crawls(t: ReturnType<typeof harness>) {
    return await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
      const crawl = (taskId: string) => ctx.db.insert("seoDataPulls", {
        operationId: "site_crawl", family: "On-Page", mode: "QUEUED", websiteId, taskArgsJson: "{}", status: "READY",
        tag: taskId, costUsd: 0.15, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(), taskId,
      });
      const older = await crawl("task-old");
      for (let index = 0; index < 3; index += 1) {
        await ctx.db.insert("siteCrawlPages", {
          websiteId, pullId: older, day: "2026-08-23", url: `https://ronins.co.uk/${index}/`, page: `/${index}/`, problems: [],
        });
      }
      return { websiteId, older, newer: await crawl("task-new") };
    });
  }
  const rowsOf = (t: ReturnType<typeof harness>) => t.run(async (ctx) => ({
    pages: await ctx.db.query("siteCrawlPages").collect(),
    links: await ctx.db.query("siteCrawlLinks").collect(),
  }));

  test("a refusal changes nothing — the older crawl's detail stays — and it is tried again later", async () => {
    const t = harness();
    const { older, newer } = await crawls(t);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      status_code: 20000, tasks: [{ id: "task-new", status_code: 40501, status_message: "Invalid Field: 'filters'." }],
    })));

    await t.action(internal.siteCrawlDetail.fetchCrawlDetail, { pullId: newer });

    const rows = await rowsOf(t);
    expect(rows.pages.map((row) => row.pullId)).toEqual([older, older, older]);
    const again = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.includes("fetchCrawlDetail")));
    expect(again.map((job) => job.args[0])).toEqual([{ pullId: newer, attempt: 1 }]);
    // Not yet given up: nothing on the crawl says it failed.
    expect((await t.run(async (ctx) => await ctx.db.get(newer)))?.error).toBeUndefined();
  });

  test("a whole detail replaces the older crawl's, and fetched twice is never doubled", async () => {
    const t = harness();
    const { newer } = await crawls(t);
    const links = Array.from({ length: 1_500 }, (_, index) => ({
      link_from: `https://ronins.co.uk/${index}/`, link_to: `https://ronins.co.uk/gone-${index}/`, page_to_status_code: 404,
    }));
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const [task] = JSON.parse(init.body) as Array<{ offset: number; filters?: unknown }>;
      const result = task.filters
        ? [{ items: links.slice(task.offset, task.offset + 1_000) }]
        : [{ items: task.offset === 0 ? [{ url: "https://ronins.co.uk/", status_code: 200, checks: {} }] : [] }];
      return Response.json({ status_code: 20000, tasks: [{ id: "task-new", status_code: 20000, result }] });
    }));

    await t.action(internal.siteCrawlDetail.fetchCrawlDetail, { pullId: newer });
    await t.action(internal.siteCrawlDetail.fetchCrawlDetail, { pullId: newer });

    const rows = await rowsOf(t);
    expect(rows.pages.map((row) => row.pullId)).toEqual([newer]);
    expect(rows.links).toHaveLength(1_500);
    expect(new Set(rows.links.map((row) => row.to)).size).toBe(1_500);
  });
});
