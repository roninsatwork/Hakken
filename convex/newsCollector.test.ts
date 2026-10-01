import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const { generate, fetchPage } = vi.hoisted(() => ({ generate: vi.fn(), fetchPage: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));
vi.mock("./utils/safeWorkflowHttp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils/safeWorkflowHttp")>()),
  fetchWorkflowAction: fetchPage,
}));

/**
 * The News Collector (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 5): what is new in each source that is on goes live in News at once,
 * summarised in plain English by the agent's model, with the cost on the run.
 * Nothing is collected twice, a taken-down item never comes back, a new
 * source gives only its newest few, and the spend limit stops the run.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const day = (n: number) => new Date(Date.UTC(2026, 8, n, 9)).toUTCString();

function rss(items: Array<{ slug: string; day: number }>): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>${items.map((item) => `
    <item><title>Post ${item.slug}</title><link>https://blog.example/news/${item.slug}</link>
    <pubDate>${day(item.day)}</pubDate><description>What post ${item.slug} says.</description></item>`).join("")}
  </channel></rss>`;
}

const YOUTUBE_FEED = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <entry><id>yt:video:v1</id><title>Ranking in AI Overviews</title><link rel="alternate" href="https://www.youtube.com/watch?v=v1"/>
  <published>2026-09-29T15:00:00Z</published><media:group><media:description>What AI Overviews cite.</media:description></media:group></entry>
</feed>`;

/** The web, as the collector fetches it: each address's body, or a 404. */
function serve(pages: Record<string, string>) {
  fetchPage.mockReset().mockImplementation(async (url: string) =>
    url in pages ? { status: 200, body: pages[url], headers: {} } : { status: 404, body: "", headers: {} });
}

async function collector(t: ReturnType<typeof harness>, extra: { maxCostUsd?: number } = {}) {
  return await t.run(async (ctx) => await ctx.db.insert("agents", {
    name: "News Collector", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "NEWS_COLLECTOR",
    systemPrompt: "Summarise plainly.", createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  }));
}

async function source(t: ReturnType<typeof harness>, kind: "WEBSITE" | "YOUTUBE" | "X_ACCOUNT", name: string, address: string, lastCheckedAt?: number) {
  return await t.run(async (ctx) => await ctx.db.insert("newsSources", {
    kind, name, address, isOn: true, createdAt: Date.now(), updatedAt: Date.now(), ...(lastCheckedAt ? { lastCheckedAt } : {}),
  }));
}

async function run(t: ReturnType<typeof harness>, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "MANUAL", objective: "collect", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.newsAgentRunActions.runNewsRoleNow, { role: "NEWS_COLLECTOR", runId });
  return await t.run(async (ctx) => await ctx.db.get(runId));
}

const items = (t: ReturnType<typeof harness>) => t.run(async (ctx) => await ctx.db.query("newsItems").collect());

describe("the News Collector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    generate.mockReset().mockImplementation(async (args: { contents: Array<{ text: string }> }) => {
      const asked = JSON.parse(args.contents[0].text) as { title: string };
      return {
        text: JSON.stringify({ title: asked.title, summary: `In short: ${asked.title}.`, meaning: "Check your rankings." }),
        inputTokens: 1_000,
        outputTokens: 200,
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.FIRECRAWL_API_KEY;
  });

  test("a website's feed: what is new goes live in English, summarised, newest first, and asks for its translations", async () => {
    const t = harness();
    const agentId = await collector(t);
    const sourceId = await source(t, "WEBSITE", "The Blog", "https://blog.example/news/", Date.now() - 86_400_000);
    serve({
      "https://blog.example/news/": `<html><head><link rel="alternate" type="application/rss+xml" href="/news/feed/"></head></html>`,
      "https://blog.example/news/feed/": rss([{ slug: "older-post", day: 20 }, { slug: "newest-post", day: 29 }]),
    });

    const finished = await run(t, agentId);

    expect(finished).toMatchObject({ status: "SUCCESS" });
    expect(finished?.finalOutput).toMatch(/^Added 2 items to News and spent \$/);
    const saved = (await items(t)).sort((one, other) => other.publishedAt - one.publishedAt);
    expect(saved.map((item) => [item.titleEn, item.summaryEn, item.meaningEn, item.url, item.kind, item.sourceName])).toEqual([
      ["Post newest-post", "In short: Post newest-post.", "Check your rankings.", "https://blog.example/news/newest-post", "WEBSITE", "The Blog"],
      ["Post older-post", "In short: Post older-post.", "Check your rankings.", "https://blog.example/news/older-post", "WEBSITE", "The Blog"],
    ]);
    // The agent's own instructions lead what the model is told.
    expect(generate.mock.calls[0][0].systemInstruction).toMatch(/^Summarise plainly\./);
    const read = await t.run(async (ctx) => await ctx.db.get(sourceId));
    expect(read).toMatchObject({ lastCheckedAt: Date.now(), lastItemAt: Date.now() });
    const scheduled = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));
    expect(scheduled.filter((name) => name.includes("translateNow"))).toHaveLength(2);
    // Each model call is on the run, as a step and in the ledger.
    const ledger = await t.run(async (ctx) => await ctx.db.query("agentTransactions").collect());
    expect(ledger).toHaveLength(2);
    expect(ledger[0].actionContext).toMatch(/^Summarising "Post .*" from The Blog$/);
  });

  test("nothing is collected twice, and an item taken down never comes back", async () => {
    const t = harness();
    const agentId = await collector(t);
    await source(t, "WEBSITE", "The Blog", "https://blog.example/news/feed/", Date.now() - 86_400_000);
    serve({ "https://blog.example/news/feed/": rss([{ slug: "kept-post", day: 20 }, { slug: "removed-post", day: 21 }]) });
    await t.run(async (ctx) => await ctx.db.insert("newsTakenDown", { externalKey: "https://blog.example/news/removed-post", takenDownAt: Date.now() }));

    expect((await run(t, agentId))?.finalOutput).toMatch(/^Added 1 item to News/);
    expect((await run(t, agentId))?.finalOutput).toMatch(/^Added 0 items to News/);
    expect((await items(t)).map((item) => item.titleEn)).toEqual(["Post kept-post"]);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("a source read for the first time gives only its newest five", async () => {
    const t = harness();
    const agentId = await collector(t);
    await source(t, "WEBSITE", "The Blog", "https://blog.example/news/feed/");
    serve({ "https://blog.example/news/feed/": rss(Array.from({ length: 8 }, (_, index) => ({ slug: `post-number-${index + 1}`, day: index + 1 }))) });

    await run(t, agentId);

    expect((await items(t)).map((item) => item.titleEn).sort()).toEqual(
      ["Post post-number-4", "Post post-number-5", "Post post-number-6", "Post post-number-7", "Post post-number-8"],
    );
  });

  test("a YouTube channel is read through the feed its page names", async () => {
    const t = harness();
    const agentId = await collector(t);
    await source(t, "YOUTUBE", "Ahrefs", "https://www.youtube.com/@AhrefsCom", Date.now() - 86_400_000);
    serve({
      "https://www.youtube.com/@AhrefsCom": `<script>{"externalId":"UCWquNQV8Y0_defMKnGKrFOQ"}</script>`,
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCWquNQV8Y0_defMKnGKrFOQ": YOUTUBE_FEED,
    });

    await run(t, agentId);

    expect(await items(t)).toMatchObject([{ kind: "YOUTUBE", titleEn: "Ranking in AI Overviews", url: "https://www.youtube.com/watch?v=v1" }]);
  });

  test("a website with no feed is read through Firecrawl: the articles its page links to", async () => {
    const t = harness();
    const agentId = await collector(t);
    await source(t, "WEBSITE", "No Feed Ltd", "https://nofeed.example/blog", Date.now() - 86_400_000);
    serve({ "https://nofeed.example/blog": "<html><body>Our blog</body></html>" });
    process.env.FIRECRAWL_API_KEY = "test-key";
    const firecrawl = vi.fn(async (_url: string, init: RequestInit) => {
      const asked = JSON.parse(String(init.body)) as { url: string; formats: string[] };
      return Response.json(asked.formats.includes("links")
        ? { data: { markdown: "Our blog", links: ["https://nofeed.example/blog/local-search-is-changing-fast", "https://nofeed.example/blog/tag/news"] } }
        : { data: { markdown: "Local search is changing fast, and here is how.", metadata: { title: "Local search is changing" } } });
    });
    vi.stubGlobal("fetch", firecrawl);

    await run(t, agentId);

    expect(await items(t)).toMatchObject([{ titleEn: "Local search is changing", url: "https://nofeed.example/blog/local-search-is-changing-fast" }]);
    expect(JSON.parse(generate.mock.calls[0][0].contents[0].text)).toMatchObject({ text: "Local search is changing fast, and here is how." });
  });

  test("a source that cannot be read says so, and the rest are still read; an X account waits for X access", async () => {
    const t = harness();
    const agentId = await collector(t);
    await source(t, "WEBSITE", "Gone", "https://gone.example/feed", Date.now() - 2 * 86_400_000);
    await source(t, "X_ACCOUNT", "Search Liaison", "searchliaison", Date.now() - 86_400_000);
    await source(t, "WEBSITE", "The Blog", "https://blog.example/news/feed/", Date.now() - 3600_000);
    serve({ "https://blog.example/news/feed/": rss([{ slug: "still-read", day: 29 }]) });

    const finished = await run(t, agentId);

    expect(finished).toMatchObject({ status: "SUCCESS" });
    expect((await items(t)).map((item) => item.titleEn)).toEqual(["Post still-read"]);
    const steps = await t.run(async (ctx) => await ctx.db.query("agentRunSteps").collect());
    expect(steps.find((step) => step.input === "Could not read Gone")).toMatchObject({ status: "FAILED" });
    expect(steps.find((step) => step.input === "Skipped Search Liaison")?.output).toMatch(/X access/);
  });

  test("stops at the agent's spend limit, saying so", async () => {
    const t = harness();
    const agentId = await collector(t, { maxCostUsd: 0.001 });
    const model = await t.query(internal.aiModels.resolveModelConfigForExecution, { useCase: "agent" });
    await t.run(async (ctx) => await ctx.db.insert("aiModels", {
      modelId: model.modelId, displayName: "Priced", isEnabled: true, isDefault: false, lastSyncedAt: Date.now(),
      standardInputCostBelow200k: 1, outputResponseCost: 1,
    }));
    await source(t, "WEBSITE", "The Blog", "https://blog.example/news/feed/", Date.now() - 86_400_000);
    serve({ "https://blog.example/news/feed/": rss([{ slug: "first-post", day: 28 }, { slug: "second-post", day: 29 }]) });

    const finished = await run(t, agentId);

    expect(finished?.finalOutput).toMatch(/Added 1 item to News and spent \$0\.00\. Stopped because it reached its spend limit/);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("with no source switched on, it says so and calls nothing", async () => {
    const t = harness();
    const agentId = await collector(t);

    expect((await run(t, agentId))?.finalOutput).toBe("No News source is switched on, so nothing was read.");
    expect(generate).not.toHaveBeenCalled();
  });
});
