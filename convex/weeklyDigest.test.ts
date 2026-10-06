import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { readerFields } from "./contentTranslation";
import schema from "./schema";
import { isoWeekKey } from "./weeklyDigest";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));

/**
 * The Weekly Digest agent (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 9). What must hold: it writes the week's issue once, from the week's
 * News with Google updates first, with an opening from its own instructions
 * and model, translated before anything is sent; in Test it queues only super
 * admins, every run; in Live every user who has the digest on, once a week;
 * it sends nothing itself and starts the Email Sender; and a week with no
 * News writes nothing.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const NOW = Date.UTC(2026, 9, 1, 9);

async function world(t: ReturnType<typeof harness>, mode: "TEST" | "LIVE", options: { withSender?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const digest = await ctx.db.insert("agents", {
      name: "Weekly Digest", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "WEEKLY_DIGEST",
      plannerMode: mode, systemPrompt: "Write the week's opening plainly.", createdAt: now, updatedAt: now,
    });
    if (options.withSender !== false) {
      await ctx.db.insert("agents", {
        name: "Email Sender", modelId: "none", thinkingMode: false, isActive: true, systemKey: "EMAIL_SENDER", createdAt: now, updatedAt: now,
      });
    }
    const admin = await ctx.db.insert("users", { name: "Anthony", email: "anthony@hakken.example", role: "SUPER_ADMIN", lastLoginAt: now });
    const anna = await ctx.db.insert("users", { name: "Anna", email: "anna@korda.example", role: "USER" });
    const marco = await ctx.db.insert("users", { name: "Marco", email: "marco@korda.example", role: "USER" });
    const quiet = await ctx.db.insert("users", { name: "Quiet", email: "quiet@korda.example", role: "USER" });
    await ctx.db.insert("users", { name: "No address", role: "USER" });
    await ctx.db.insert("readerPreferences", { userId: marco, newsDigest: true, language: "it", unsubscribeToken: "a".repeat(64), updatedAt: now });
    await ctx.db.insert("readerPreferences", { userId: quiet, newsDigest: false, unsubscribeToken: "b".repeat(64), updatedAt: now });
    const item = (kind: "WEBSITE" | "GOOGLE_UPDATE", title: string, daysAgo: number) => ctx.db.insert("newsItems", {
      kind, sourceName: kind === "GOOGLE_UPDATE" ? "Google" : "The Blog", titleEn: title, summaryEn: `About ${title}.`, meaningEn: "",
      url: `https://example.com/${title.replaceAll(" ", "-")}`, publishedAt: now - daysAgo * 86_400_000, externalKey: title, createdAt: now,
    });
    const newest = await item("WEBSITE", "Newest post", 1);
    const update = await item("GOOGLE_UPDATE", "October core update", 3);
    const older = await item("WEBSITE", "Older post", 5);
    await item("WEBSITE", "Last month", 20);
    return { digest, admin, anna, marco, quiet, items: { newest, update, older } };
  });
}

async function run(t: ReturnType<typeof harness>, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "write", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.newsAgentRunActions.runNewsRoleNow, { role: "WEEKLY_DIGEST", runId });
  return await t.run(async (ctx) => await ctx.db.get(runId));
}

const outbox = (t: ReturnType<typeof harness>) => t.run(async (ctx) => await ctx.db.query("outboxMessages").collect());
const issues = (t: ReturnType<typeof harness>) => t.run(async (ctx) => await ctx.db.query("weeklyDigestIssues").collect());
const scheduled = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => ({ name: job.name, args: job.args })));

describe("the Weekly Digest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    generate.mockReset().mockImplementation(async (args: { systemInstruction: string }) => (args.systemInstruction.startsWith("Translate")
      ? { text: JSON.stringify({ intro: "Una settimana tranquilla, con un aggiornamento di Google." }), inputTokens: 50, outputTokens: 20 }
      : { text: "\"A quiet week, with one Google update.\"", inputTokens: 900, outputTokens: 60 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("weeks are ISO weeks", () => {
    expect(isoWeekKey(NOW)).toBe("2026-W40");
    expect(isoWeekKey(Date.UTC(2027, 0, 1))).toBe("2026-W53");
    expect(isoWeekKey(Date.UTC(2025, 11, 29))).toBe("2026-W01");
  });

  test("in Test it writes the week's issue, translated, and queues only super admins, then starts the Email Sender", async () => {
    const t = harness();
    const { digest, admin, items } = await world(t, "TEST");

    const finished = await run(t, digest);

    expect(finished).toMatchObject({ status: "SUCCESS" });
    expect(finished?.finalOutput).toBe("Wrote the 2026-W40 issue in Test, for super admins only, with 3 items; queued 1 email. Started the Email Sender to send them.");
    const [issue] = await issues(t);
    expect(issue).toMatchObject({ weekKey: "2026-W40", mode: "TEST", introEn: "A quiet week, with one Google update." });
    // Google updates first, then the newest; nothing from before the week.
    expect(issue.itemIds).toEqual([items.update, items.newest, items.older]);
    // The agent's own instructions lead what the model is told.
    expect(generate.mock.calls[0][0].systemInstruction).toMatch(/^Write the week's opening plainly\./);
    // Translated before anything is sent.
    const italian = await t.run(async (ctx) => await readerFields(ctx, "weeklyDigestIssues", issue._id, { intro: issue.introEn }, "it"));
    expect(italian.intro).toBe("Una settimana tranquilla, con un aggiornamento di Google.");
    expect((await outbox(t)).map((row) => [row.userId, row.status])).toEqual([[admin, "WAITING"]]);
    expect((await scheduled(t)).some((job) => job.name.includes("runNewsRoleNow") && (job.args[0] as { role: string }).role === "EMAIL_SENDER")).toBe(true);
    // The opening's cost is on the run, so its spend limit can stop it.
    expect(finished?.costUsd).toBeTypeOf("number");
  });

  // insights-helpful-content-plan.md, IH19: the week's Helpful content, with Hakken's summary and the original — never the article's words.
  test("the issue carries the Helpful content added that week that readers can see, each with its summary and the original", async () => {
    const t = harness();
    const { digest, admin } = await world(t, "TEST");
    const helpfulId = await t.run(async (ctx) => {
      const now = Date.now();
      const article = (title: string, extra: { shown: boolean; daysAgo: number }) => ctx.db.insert("libraryArticles", {
        url: `https://ahrefs.test/${title.replaceAll(" ", "-")}`, title, publication: "Ahrefs", status: extra.shown ? "IN_KNOWLEDGE" : "DRAFT",
        words: 3000, summaryEn: `${title}, summed up.`, shown: extra.shown, createdAt: now - extra.daysAgo * 86_400_000, updatedAt: now,
      });
      await article("A draft", { shown: false, daysAgo: 1 });
      await article("Last month's", { shown: true, daysAgo: 20 });
      return await article("Link building for SEO", { shown: true, daysAgo: 2 });
    });

    await run(t, digest);
    const [issue] = await issues(t);
    expect(issue.helpfulIds).toEqual([helpfulId]);
    expect(JSON.parse(generate.mock.calls[0][0].contents[0].text).newHelpfulContent).toEqual([
      { title: "Link building for SEO", publication: "Ahrefs", summary: "Link building for SEO, summed up." },
    ]);
    const [row] = await outbox(t);
    expect(row.userId).toBe(admin);
    const rendered = await t.query(internal.outboxTemplates.renderOutboxMessage, { messageId: row._id });
    expect("email" in rendered && rendered.email.text).toContain("HELPFUL CONTENT");
    expect("email" in rendered && rendered.email.text).toContain("Link building for SEO, summed up.");
    expect("email" in rendered && rendered.email.text).toContain("https://ahrefs.test/Link-building-for-SEO");
  });

  test("in Live it queues every user who has it on, in their language, once a week", async () => {
    const t = harness();
    const { digest, admin, anna, marco } = await world(t, "LIVE");

    expect((await run(t, digest))?.finalOutput).toMatch(/^Wrote the 2026-W40 issue with 3 items; queued 3 emails\./);
    const rows = await outbox(t);
    expect(rows.map((row) => [row.userId, row.language, row.idempotencyKey]).sort()).toEqual([
      [admin, "en", `WEEKLY_NEWS_DIGEST:2026-W40:${admin}`],
      [anna, "en", `WEEKLY_NEWS_DIGEST:2026-W40:${anna}`],
      [marco, "it", `WEEKLY_NEWS_DIGEST:2026-W40:${marco}`],
    ].sort());

    // Again the same week: nothing written, nothing queued.
    expect((await run(t, digest))?.finalOutput).toBe("The 2026-W40 issue was already written and queued, so nothing was sent twice.");
    expect(await outbox(t)).toHaveLength(3);
    expect(await issues(t)).toHaveLength(1);
  });

  test("a week with no News writes nothing and calls no model", async () => {
    const t = harness();
    const { digest } = await world(t, "LIVE");
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("newsItems").collect()) await ctx.db.patch(row._id, { publishedAt: NOW - 30 * 86_400_000 });
    });

    expect((await run(t, digest))?.finalOutput).toBe("Nothing was added to News this week, so no issue was written.");
    expect(generate).not.toHaveBeenCalled();
    expect(await issues(t)).toHaveLength(0);
  });

  test("with no Email Sender, it says how to make one, and the emails wait", async () => {
    const t = harness();
    const { digest } = await world(t, "TEST", { withSender: false });

    expect((await run(t, digest))?.finalOutput).toMatch(/There is no Email Sender agent to send them: create one from its template and give it the role\.$/);
    expect(await outbox(t)).toHaveLength(1);
  });
});
