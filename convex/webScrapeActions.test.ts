import { afterEach, describe, expect, test, vi } from "vitest";
import path from "path";
import { readRepoFile, walkRepoFiles, relativePath, repoRoot } from "@/src/test/driftUtils";
import { fetchPage } from "./webScrapeActions";

/**
 * Every page read goes through Firecrawl's v2 (wiki-sonae-catch-up-plan-2026-11-21.md, 0.1): Sonae's commit `9a0b02a1` says
 * its v1 stops on 2026-12-10 and answers 410 after that, which would have stopped website import, the agents' page reader,
 * the Library's "Read the page" and the money pages' rendered read. Each read asks for the page as it is now (`maxAge: 0`),
 * never v2's copy up to two days old.
 */

const okPage = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => { delete process.env.FIRECRAWL_API_KEY; });

describe("a page read through Firecrawl", () => {
  test("asks v2 for the page as it is now, and keeps the first of a list of titles", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => okPage({
      markdown: "# Door handles\n\nEvery handle we make.",
      links: ["https://example.com/a", { not: "a link" }],
      metadata: { title: ["", "Door handles"], description: "All of them" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await fetchPage({ url: "https://example.com/handles", withLinks: true });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.firecrawl.dev/v2/scrape");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ url: "https://example.com/handles", maxAge: 0, formats: ["markdown", "links"] });
    expect(page).toMatchObject({ status: "success", links: ["https://example.com/a"] });
    expect(page.status === "success" && page.metadata.title).toEqual(["", "Door handles"]);
  });

  test("no Firecrawl call anywhere still uses v1", () => {
    const found = ["convex", "src"].flatMap((folder) => walkRepoFiles(path.join(repoRoot, folder), new Set([".ts", ".tsx"])))
      .map((file) => relativePath(file))
      .filter((file) => file !== "convex/webScrapeActions.test.ts")
      .filter((file) => /api\.firecrawl\.dev\/v1\//.test(readRepoFile(file)));
    expect(found, "Move these to https://api.firecrawl.dev/v2/ (v1 stops on 2026-12-10).").toEqual([]);
  });
});
