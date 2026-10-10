import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { AI_ENGINES } from "./seoAiEngines";

/**
 * One page (discovery-detail-and-hakken-sees-plan.md §3): every answer read
 * from the ChatGPT app that opened a page, whether it cited it, and what was
 * cited in its place — with What Hakken sees saying what to do first.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

const SURREY = "https://www.ronins.co.uk/web-design-surrey/";
const CLUTCH = "https://clutch.co/uk/web-designers/surrey";

async function seed() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: "Member", email: "m@ronins.co.uk", role: "ADMIN" as const, companyId, createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
    const answers = [
      { prompt: "Who is the best web design agency in Guildford?", day: "2026-10-08", read: [SURREY, CLUTCH], cited: [CLUTCH] },
      { prompt: "Best web design agency in Surrey?", day: "2026-10-08", read: [`${SURREY}?utm=x`, CLUTCH], cited: [SURREY] },
      { prompt: "Affordable web designer near Guildford", day: "2026-10-01", read: [SURREY], cited: [CLUTCH, "https://brightside.co.uk/"] },
    ];
    for (const answer of answers) {
      await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: holdId, prompt: answer.prompt, engines: [...AI_ENGINES], isActive: true, createdAt: Date.now() });
      const pullId = await ctx.db.insert("seoDataPulls", { operationId: "ai_app_chatgpt", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: answer.prompt, attempts: 0, costUsd: 0.004, sandbox: false, submittedAt: Date.now() });
      const textId = await ctx.db.insert("aiAnswerTexts", { pullId, prompt: answer.prompt, engine: "chatgpt", locationCode: 2826, day: answer.day, text: "An answer.", sources: answer.cited, createdAt: Date.now() });
      await ctx.db.insert("aiAnswerIndex", { textId, pullId, prompt: answer.prompt, engine: "chatgpt", locationCode: 2826, day: answer.day });
      for (const [at, url] of answer.cited.entries()) {
        await ctx.db.insert("aiCitations", { prompt: answer.prompt, engine: "chatgpt", locationCode: 2826, day: answer.day, pullId, kind: "SOURCE", mentionedText: url, url, position: at + 1, createdAt: Date.now() });
      }
      await ctx.db.insert("aiAnswerExtras", { pullId, prompt: answer.prompt, engine: "chatgpt", locationCode: 2826, day: answer.day, businesses: [], read: answer.read, searches: [] });
    }
    return { userId, holdId };
  });
  return { as: t.withIdentity({ subject: ids.userId }), siteId: ids.holdId };
}

describe("One page", () => {
  test("every answer that read it, whether each cited it, and what was cited in its place", async () => {
    const { as, siteId } = await seed();
    const page = await as.query(api.siteAiPageDetail.aiPageDetail, { siteId, url: SURREY });
    expect(page).toMatchObject({ host: "ronins.co.uk", path: "/web-design-surrey/", whose: "YOURS", read: 3, cited: 1 });
    expect(page.answers.map((row) => row.cited).sort()).toEqual([false, false, true]);
    expect(page.instead.map((row) => [row.host, row.times])).toEqual([["clutch.co", 2], ["brightside.co.uk", 1]]);
    // clutch.co's page was read twice and cited once of those.
    expect(page.instead[0].wins).toBe(0.5);
  });

  test("What Hakken sees: read three times, cited once; fix its first lines and be where it lost", async () => {
    const { as, siteId } = await seed();
    const { seen } = await as.query(api.siteAiPageDetail.aiPageDetail, { siteId, url: SURREY });
    expect(seen.says).toEqual([{ code: "readCitedSome", a: 3, b: 1 }, { code: "citedInstead", text: "clutch.co/uk/web-designers/surrey", a: 2 }]);
    expect(seen.steps).toEqual([
      { code: "firstLines", link: "seePage", to: { record: "page", key: "/web-design-surrey/" } },
      { code: "getListedOn", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } },
    ]);
  });

  test("a page never read says so", async () => {
    const { as, siteId } = await seed();
    const page = await as.query(api.siteAiPageDetail.aiPageDetail, { siteId, url: "https://nowhere.example/" });
    expect(page.read).toBe(0);
    expect(page.seen).toEqual({ says: [{ code: "notRead" }], steps: [] });
  });
});
