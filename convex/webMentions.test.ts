import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { namesIt, parseMentions, rowsOf } from "./webMentions";
import { linkGapParams, mentionPhraseAskedFor, mentionsParams } from "./dataForSeoMentionOperations";
import { shownMention } from "./siteWebMentions";

/**
 * Web mentions (discovery-local-reputation-ai-plan.md, step 6, D13, D20):
 * pages in English from the UK only, each once, with its kind and tone; the
 * AI check's rule while it is off; and a website's pages kept once, newest
 * first, each marked whether it links to the website. The answers are the
 * shapes bought on 2026-10-09, written by hand.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

const page = (url: string, extra: Record<string, unknown> = {}, info: Record<string, unknown> = {}) => ({
  type: "content_analysis_search", url, domain: new URL(url).hostname, domain_rank: 412, language: "en", country: "GB", page_types: ["news"],
  fetch_time: "2026-10-06 10:00:00 +00:00",
  content_info: { title: "The 10 best web design agencies in Surrey", snippet: "Ronins builds fast websites.", connotation_types: { positive: 0.6, negative: 0.05, neutral: 0.35 }, ...info },
  ...extra,
});

describe("reading a search", () => {
  test("English pages from the UK or nowhere in particular, each once, with kind and tone", () => {
    const found = parseMentions([{ items: [
      page("https://surreybusinessnews.co.uk/best"),
      page("https://surreybusinessnews.co.uk/best"),
      page("https://www.beslist.nl/korda", { language: "nl", country: "NL" }),
      page("https://hypestat.com/info/x", { country: "IN" }),
      page("https://ukbusinessforums.co.uk/threads/1", { country: null, page_types: ["message-boards"] }, { connotation_types: { positive: 0.1, negative: 0.5, neutral: 0.4 } }),
      page("https://sumansangamaashray.com/ronins-honour", { language: null, country: null }, { language: null }),
    ] }]);
    expect(found.map((row) => row.host)).toEqual(["surreybusinessnews.co.uk", "ukbusinessforums.co.uk"]);
    expect(found[0]).toMatchObject({ kind: 1, tone: 1, strength: 412, day: "2026-10-06", title: "The 10 best web design agencies in Surrey" });
    expect(found[1]).toMatchObject({ kind: 3, tone: 2 });
  });

  test("what a search is sent, and read back", () => {
    expect(mentionsParams("Ronins", 100)).toEqual({ keyword: "\"Ronins\"", limit: 100 });
    expect(mentionPhraseAskedFor(mentionsParams("Ronins", 100))).toBe("ronins");
    expect(linkGapParams(["a.co.uk", "b.co.uk"], "ronins.co.uk")).toEqual({ targets: { 1: "a.co.uk", 2: "b.co.uk" }, exclude_targets: ["ronins.co.uk"], limit: 100 });
  });

  test("while the AI check is off, a page counts when it names the address or the whole name", () => {
    const website = { host: "ronins.co.uk", name: "Ronins" };
    expect(namesIt({ title: "Agencies", snippet: "Ronins builds fast websites." }, website)).toBe(true);
    expect(namesIt({ title: "Forty-seven roninsamurai tales", snippet: "" }, website)).toBe(false);
    expect(namesIt({ title: null, snippet: "see ronins.co.uk" }, website)).toBe(true);
  });
});

describe("keeping", () => {
  test("new pages added newest first, each once, and whether it links to the website", async () => {
    const t = harness();
    const websiteId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
      const pullId = await ctx.db.insert("seoDataPulls", { operationId: "backlinks", family: "Backlinks", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "b", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now() });
      await ctx.db.insert("siteBacklinks", {
        websiteId: id, pass: "ALL", pullId, day: "2026-10-01", domainFrom: "surreybusinessnews.co.uk", urlFrom: "https://surreybusinessnews.co.uk/best",
        urlTo: "https://ronins.co.uk/", pageTo: "/", dofollow: true, status: "LIVE", isBroken: false, domainRank: 300, searchText: "surreybusinessnews.co.uk",
      } as never);
      return id;
    });
    const row = (url: string, day: string) => ({ url, host: new URL(url).hostname, title: "A page", day, kind: 1, tone: 1, strength: 300, about: 1 });
    await t.mutation(internal.webMentions.writeMentions, { websiteId, found: [row("https://surreybusinessnews.co.uk/best", "2026-10-06"), row("https://harbourbakery.co.uk/blog", "2026-10-08")] });
    await t.mutation(internal.webMentions.writeMentions, { websiteId, found: [row("https://harbourbakery.co.uk/blog", "2026-10-08")] });
    const [part] = await t.run(async (ctx) => await ctx.db.query("webMentionParts").collect());
    const rows = rowsOf(part);
    expect(rows.map((entry) => [entry.host, entry.day, entry.linked])).toEqual([["harbourbakery.co.uk", "2026-10-08", 0], ["surreybusinessnews.co.uk", "2026-10-06", 1]]);
  });

  test("a page about another of the name is left out, unless its website links here", () => {
    const row = { url: "https://a.example/x", host: "a.example", title: null, day: "2026-10-08", kind: 1, tone: 0, strength: 0, linked: 0, about: 0 };
    expect(shownMention(row)).toBe(false);
    expect(shownMention({ ...row, linked: 1 })).toBe(true);
    expect(shownMention({ ...row, about: null })).toBe(true);
  });
});
