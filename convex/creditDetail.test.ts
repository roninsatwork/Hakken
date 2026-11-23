import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { creditAssistantReply, creditChatAppQuestion, creditSeesPress } from "./creditHooks";
import { chargeCreditsNow } from "./creditLedger";
import { sectionOfScreen, sectionOfWork } from "./creditKinds";

/**
 * What a charge saves beside its credits for Usage (Anthony, 2026-11-23: "lets add all the detail to the capture"):
 * its section on every charge, and the website, screen, page and what was asked for the eye, Ask Hakken and MCP. And
 * the one-off fill that gives older charges the same, moving their credits under the website they were for.
 */

const modules = import.meta.glob("./**/*.*s");
const asCtx = (ctx: unknown) => ctx as MutationCtx;
/** 10 November 2026, midday in London: every charge here is made on a fixed day, never the clock's. */
const AT = Date.UTC(2026, 10, 10, 12);

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (raw) => {
    const ctx = asCtx(raw);
    const company = await ctx.db.insert("companies", { name: "Acme", createdAt: AT });
    const user = await ctx.db.insert("users", { email: "owner@example.com", name: "Owner", role: "ADMIN", companyId: company });
    const website = await ctx.db.insert("websites", { host: "acme.com", displayHost: "acme.com", firstSeenAt: AT });
    const hold = await ctx.db.insert("companyWebsites", { companyId: company, websiteId: website, createdAt: AT });
    return { company, user, website, hold };
  });
}

async function press(ctx: MutationCtx, seeded: Awaited<ReturnType<typeof seed>>, screen: string) {
  const id = await ctx.db.insert("seesAnswers", {
    companyId: seeded.company, companyWebsiteId: seeded.hold, key: `${screen}:last-month`, screen, path: "/app/search-console/x/performance",
    status: "WRITTEN", says: [], steps: [], askedAt: AT, week: "2026-W46", about: "Performance: clicks and impressions, last month", askedBy: seeded.user,
  });
  return (await ctx.db.get(id))!;
}

const chargeOf = (ctx: MutationCtx, runKey: string) => ctx.db.query("creditCharges").withIndex("by_run_key", (q) => q.eq("runKey", runKey)).first();

describe("a charge's section", () => {
  test("comes from the screen for the eye, and from the kind of work for the rest", () => {
    expect(sectionOfScreen("searchConsole.performance")).toBe("searchConsole");
    expect(sectionOfScreen("googleAnalytics.event:purchase")).toBe("googleAnalytics");
    expect(sectionOfScreen("unknown.page")).toBeNull();
    expect(sectionOfWork("sees", "insights.thisWeek")).toBe("insights");
    expect(sectionOfWork("rankings")).toBe("visibility");
    expect(sectionOfWork("backlinks")).toBe("visibility");
    expect(sectionOfWork("assistant")).toBe("assistant");
    expect(sectionOfWork("chatApps", "searchConsole.keywords")).toBe("mcp");
    expect(sectionOfWork("taskReports")).toBe("hakkenTasks");
    expect(sectionOfWork("keywordResearch")).toBe("keywordResearch");
  });
});

describe("what each charge saves as it is made", () => {
  test("a press of the eye saves its website and screen, and its section is the screen's", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const charge = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const answer = await press(ctx, seeded, "searchConsole.performance");
      await creditSeesPress(ctx, answer);
      return await chargeOf(ctx, `sees:${answer._id}:${AT}`);
    });
    expect(charge).toMatchObject({ kind: "sees", websiteId: seeded.website, screen: "searchConsole.performance", section: "searchConsole" });
  });

  test("an Ask Hakken reply saves the conversation's website, the page it began on and its title", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const charge = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const threadId = await ctx.db.insert("threads", {
        userId: seeded.user, companyId: seeded.company, companyWebsiteId: seeded.hold, title: "Why did clicks fall?", createdAt: AT, updatedAt: AT,
        startedOn: { path: "/app/search-console/x/performance", about: "Performance", dates: "Last month", findings: [], said: [] },
      });
      const messageId = await ctx.db.insert("messages", { threadId, role: "assistant", content: "Because…", createdAt: AT });
      await creditAssistantReply(ctx, await ctx.db.get(threadId), messageId, { inputTokens: 10, outputTokens: 10 });
      return await chargeOf(ctx, `message:${messageId}`);
    });
    expect(charge).toMatchObject({ kind: "assistant", websiteId: seeded.website, page: "/app/search-console/x/performance", detail: "Why did clicks fall?", section: "assistant" });
  });

  test("an MCP question saves the app, the tool, the screen and dates it read, and the website it named", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const charge = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const requestId = await ctx.db.insert("chatAppRequests", {
        userId: seeded.user, companyId: seeded.company, app: "claude", method: "tools/call", tool: "search_console", detail: "searchConsole.newLost",
        website: "https://www.acme.com/", period: "lastMonth", outcome: "answered", at: AT,
      });
      await creditChatAppQuestion(ctx, { companyId: seeded.company, userId: seeded.user, requestId });
      return await chargeOf(ctx, `chatApp:${requestId}`);
    });
    expect(charge).toMatchObject({
      kind: "chatApps", websiteId: seeded.website, app: "claude", tool: "search_console", screen: "searchConsole.newLost", period: "lastMonth", section: "mcp",
    });
  });

  test("a collection's charge gets its section from its kind of work", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const charge = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      await chargeCreditsNow(ctx, { companyId: seeded.company, kind: "rankings", runKey: "cycle:one", how: "scheduled", websiteId: seeded.website }, 1000, {}, AT);
      return await chargeOf(ctx, "cycle:one");
    });
    expect(charge?.section).toBe("visibility");
  });
});

describe("filling in older charges", () => {
  test("a press charged with no website gets one, and its credits move under that website", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const runKey = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const answer = await press(ctx, seeded, "googleAnalytics.visitors");
      const key = `sees:${answer._id}:${AT}`;
      // As charges were made before 23 November: no website, no screen, no section.
      await chargeCreditsNow(ctx, { companyId: seeded.company, kind: "sees", runKey: key, how: "byHand", userId: seeded.user }, 1, {}, AT);
      const charge = await chargeOf(ctx, key);
      await ctx.db.patch(charge!._id, { section: undefined, screen: undefined });
      return key;
    });

    const first = await t.mutation(internal.creditDetail.fillChargeDetail, {});
    expect(first).toEqual({ filled: 1, moved: 1, done: true });

    const after = await t.run(async (raw) => {
      const ctx = asCtx(raw);
      const charge = await chargeOf(ctx, runKey);
      const rows = await ctx.db.query("creditMonthRollups").withIndex("by_company_month", (q) => q.eq("companyId", seeded.company).eq("month", "2026-11")).collect();
      return { charge, rows: rows.map((row) => ({ websiteKey: row.websiteKey, credits: row.credits, runs: row.runs, people: row.byHandUsers?.length ?? 0 })) };
    });
    expect(after.charge).toMatchObject({ websiteId: seeded.website, screen: "googleAnalytics.visitors", section: "googleAnalytics" });
    expect(after.rows).toEqual(expect.arrayContaining([
      { websiteKey: "none", credits: 0, runs: 0, people: 1 },
      { websiteKey: seeded.website, credits: 8, runs: 1, people: 1 },
    ]));

    // Run again: nothing is filled or moved twice.
    expect(await t.mutation(internal.creditDetail.fillChargeDetail, {})).toEqual({ filled: 0, moved: 0, done: true });
  });

  test("a charge whose record is gone still gets its section, and keeps its credits where they were", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    await t.run(async (raw) => {
      const ctx = asCtx(raw);
      await chargeCreditsNow(ctx, { companyId: seeded.company, kind: "chatApps", runKey: "chatApp:gone", how: "byHand", userId: seeded.user }, 1, {}, AT);
      const charge = await chargeOf(ctx, "chatApp:gone");
      await ctx.db.patch(charge!._id, { section: undefined });
    });
    expect(await t.mutation(internal.creditDetail.fillChargeDetail, {})).toEqual({ filled: 1, moved: 0, done: true });
    const charge = await t.run(async (raw) => await chargeOf(asCtx(raw), "chatApp:gone"));
    expect(charge).toMatchObject({ section: "mcp" });
    expect(charge?.websiteId).toBeUndefined();
  });
});
