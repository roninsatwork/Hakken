import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { parseShownAnswer, plainAnswer } from "./aiShownParse";
import { aiAskFor } from "./dataForSeoRegistry";
import { parseAiDemand } from "./aiDemand";
import { APP_ENGINES, aiAppOperationId, aiCitationOperationId, engineForOperationId, readsAsShown } from "./seoAiEngines";
import { unpackColumn } from "./utils/packedColumns";

/**
 * Discovery's AI apps and AI demand (discovery-local-reputation-ai-plan.md,
 * step 3): the two apps read as shown and Google AI Mode asked only while a
 * company has "AI apps" on (D5, D16, D17), each answer read into the shape
 * the models' answers are filed in plus what only an app shows, and AI
 * demand's monthly figures kept once per search. The answers are the shapes
 * bought on 2026-10-09, written by hand; nothing here calls the supplier.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

describe("asking", () => {
  test("the apps and Google AI Mode only while AI apps is on; the models otherwise", () => {
    const question = "Who is the best web design agency in Guildford?";
    expect(aiAskFor("chatgpt", question, undefined, false)?.operation.id).toBe(aiCitationOperationId("chatgpt"));
    expect(aiAskFor("ai_mode", question, undefined, false)).toBeNull();
    const app = aiAskFor("chatgpt", question, undefined, true)!;
    expect(app.operation.id).toBe(aiAppOperationId("chatgpt"));
    expect(app.params).toEqual({ keyword: question, location_code: 2826, language_code: "en", force_web_search: true });
    expect(aiAskFor("ai_mode", question, undefined, true)?.operation.path).toBe("/v3/serp/google/ai_mode/live/advanced");
    // Claude and Perplexity have no app: asked through their models either way.
    expect(aiAskFor("claude", question, undefined, true)?.operation.id).toBe(aiCitationOperationId("claude"));
  });

  test("an app's or AI Mode's answer still answers to its engine's line (D17)", () => {
    const secondApp = APP_ENGINES[1];
    expect(engineForOperationId(aiAppOperationId(secondApp))).toBe(secondApp);
    expect(engineForOperationId(aiCitationOperationId("ai_mode"))).toBe("ai_mode");
    expect(readsAsShown(aiAppOperationId("chatgpt"))).toBe(true);
    expect(readsAsShown(aiCitationOperationId("chatgpt"))).toBe(false);
  });
});

describe("reading an answer as shown", () => {
  test("the app's words, its cards, the pages it read and its searches", () => {
    const parsed = parseShownAnswer(aiAppOperationId("chatgpt"), [{
      sources: [{ url: "https://threebestrated.co.uk/website-designers-in-guildford", title: "3 Best" }],
      search_results: [
        { url: "https://www.sortlist.co.uk/web-design/guildford" },
        { url: "https://www.sortlist.co.uk/web-design/guildford?force_isolation=true" },
        { url: "https://www.ronins.co.uk/web-design-surrey/" },
      ],
      fan_out_queries: ["best web design agency Guildford", "best web design agency guildford"],
      items: [
        { type: "chat_gpt_text", markdown: "Here's my shortlist. [threebestrated.co.uk](https://threebestrated.co.uk)" },
        { type: "chat_gpt_local_businesses", items: [{ title: "evince", domain: "www.evince.uk", rating: { value: 5 }, reviews_count: 141, address: "12B Market St, Guildford" }] },
        { type: "chat_gpt_images", markdown: "![Work](https://images.example/x.png)" },
        { type: "chat_gpt_text", markdown: "1. **[Ronins](https://ronins.co.uk)** — clear communication." },
      ],
    }]);
    expect(parsed.answer).toBe("Here's my shortlist.\n1. **Ronins** — clear communication.");
    expect(parsed.businesses).toEqual([{ name: "evince", host: "evince.uk", rating: 5, reviews: 141, address: "12B Market St, Guildford" }]);
    expect(parsed.read).toEqual(["https://www.sortlist.co.uk/web-design/guildford", "https://www.ronins.co.uk/web-design-surrey/"]);
    expect(parsed.fanOutQueries).toEqual(["best web design agency Guildford"]);
    expect(parsed.sources).toEqual([{ url: "https://threebestrated.co.uk/website-designers-in-guildford", title: "3 Best" }]);
  });

  test("Google AI Mode: its words, the pages linked under them, and its cards on Google Maps", () => {
    const parsed = parseShownAnswer(aiCitationOperationId("ai_mode"), [{ items: [{
      type: "ai_overview",
      markdown: "Several agencies stand out.[[1]](https://www.google.com/searchviewer/10?svid=a)",
      references: [
        { domain: "www.google.com", url: "https://www.google.com/searchviewer/10?svid=a", title: "evince" },
        { domain: "clutch.co", url: "https://clutch.co/uk/web-designers/surrey", title: "Clutch" },
      ],
    }] }]);
    expect(parsed.answer).toBe("Several agencies stand out.");
    expect(parsed.sources).toEqual([{ url: "https://clutch.co/uk/web-designers/surrey", title: "Clutch" }]);
    expect(parsed.businesses).toEqual([{ name: "evince" }]);
  });

  test("marks are not words", () => {
    expect(plainAnswer("Best `choice` [[2]](https://g.co/x) here [evince.uk](https://evince.uk) and [the list](https://x.y/z).")).toBe("Best choice  here  and the list.");
  });
});

describe("AI demand", () => {
  const answer = [{ items: [
    { keyword: "How much does a website cost UK", ai_search_volume: 904, ai_monthly_searches: [{ year: 2026, month: 9, ai_search_volume: 904 }, { year: 2026, month: 8, ai_search_volume: 723 }] },
    { keyword: "web design guildford", ai_search_volume: 0, ai_monthly_searches: [] },
  ] }];

  test("each search's figure and its months, oldest first", () => {
    expect(parseAiDemand(answer)).toEqual([
      { keyword: "how much does a website cost uk", volume: 904, months: [723, 904], month: "2026-09" },
      { keyword: "web design guildford", volume: 0, months: [], month: null },
    ]);
  });

  test("kept once per search and place, and not rewritten when nothing moved", async () => {
    const t = harness();
    const rows = parseAiDemand(answer);
    await t.mutation(internal.aiDemand.writeAiDemand, { locationCode: 2826, rows });
    const first = await t.run(async (ctx) => await ctx.db.query("aiSearchVolumes").collect());
    expect(first).toHaveLength(2);
    expect(unpackColumn(first.find((row) => row.volume === 904)!.months)).toEqual([723, 904]);
    vi.advanceTimersByTime(60_000);
    await t.mutation(internal.aiDemand.writeAiDemand, { locationCode: 2826, rows });
    const again = await t.run(async (ctx) => await ctx.db.query("aiSearchVolumes").collect());
    expect(again.map((row) => row.updatedAt)).toEqual(first.map((row) => row.updatedAt));
  });
});
