import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";

/**
 * The eye asks the Insights team (sees-conversion-specialist-plan-2026-10-30.md):
 * a press starts one run of the Head of Strategy's, which picks the
 * specialist, has it write from the page's figures, has the Editor's code
 * check every number, and saves the bubble; the answer is kept three hours
 * for that page and its filters; a bubble the Editor sends back leaves the
 * rule's words standing, and the next press asks again.
 */
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (original) => ({ ...(await original<typeof import("./aiProviderRegistry")>()), generateTextWithResolvedModel: generate }));

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => { useFixedDay("2026-10-30"); generate.mockReset(); });
afterEach(() => vi.useRealTimers());

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "User", email: "user@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    for (const role of [INSIGHTS_LEAD_ROLE, "INSIGHTS_CONVERSION", "INSIGHTS_EDITOR"]) {
      await ctx.db.insert("agents", { name: role, systemKey: role, modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
    }
    return { companyId, siteId, userId };
  });
}

const ask = (siteId: Id<"companyWebsites">) => ({
  siteId,
  screen: "googleAnalytics.conversions",
  about: "Conversions: every conversion this website counts, for last month",
  path: "/app/analytics/site/conversions",
  period: "lastMonth",
  country: "gbr",
  device: "",
  facts: [
    { key: "conv.total.now", value: 28623, unit: "count" as const, label: "conversions last month" },
    { key: "conv.purchases.now", value: 1258, unit: "count" as const, label: "purchases last month" },
    { key: "conv.purchases.before", value: 1091, unit: "count" as const, label: "purchases the month before" },
  ],
  links: [{ label: "Tracking health", href: "/app/analytics/site/tracking-health" }],
  shop: true,
});

/** The team's three answers: the Head's choice, the specialist's bubble, and the Head's second look (kept as is unless given). */
const answers = (head: unknown, specialist: unknown, secondLook: unknown = { useful: true }) => {
  generate.mockImplementation(async (request: { systemInstruction?: string }) => {
    const system = request.systemInstruction ?? "";
    const answer = system.includes("Choose which specialist") ? head : system.includes("A specialist wrote the bubble below") ? secondLook : specialist;
    return { text: JSON.stringify(answer), inputTokens: 100, outputTokens: 40 };
  });
};

describe("the eye asks the Insights team", () => {
  test("a press starts the Head's run, the specialist writes from the page's figures, the Editor passes it, and it is kept three hours", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION", why: "It is about conversions." }, {
      says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."],
      steps: [{ words: "Check the counts that never happened.", link: 0 }],
    });
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    expect(first).toEqual({ key: "googleAnalytics.conversions|lastMonth|||gbr|", status: "RESEARCHING" });
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "RESEARCHING", says: [] });
    await finishScheduled(t);
    const written = await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key });
    expect(written).toMatchObject({
      status: "WRITTEN",
      says: ["1,258 purchases last month, up from 1,091."],
      steps: [{ words: "Check the counts that never happened.", link: "Tracking health", href: "/app/analytics/site/tracking-health" }],
      role: "INSIGHTS_CONVERSION",
    });
    // Three model calls — the Head's choice, the specialist's words, the Head's second look — on one run of the Head's, with its cost.
    expect(generate).toHaveBeenCalledTimes(3);
    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "SUCCESS", title: "What Hakken sees: acme-shop.test" });
    expect(runs[0].inputTokens).toBe(300);
    // Pressed again within three hours: the same answer, nothing asked.
    const again = await user.mutation(api.seesAsk.askSees, ask(siteId));
    expect(again).toEqual({ key: first.key, status: "WRITTEN" });
    await finishScheduled(t);
    expect(generate).toHaveBeenCalledTimes(3);
    // Another device is another answer (S9).
    const mobile = await user.mutation(api.seesAsk.askSees, { ...ask(siteId), device: "mobile" });
    expect(mobile.status).toBe("RESEARCHING");
    expect(mobile.key).not.toBe(first.key);
    // The week's written bubbles, for the weekly run (S10).
    const week = await t.query(internal.seesAsk.weekSeesAnswers, { holdId: siteId, week: "2026-10-26" });
    expect(week.length).toBeGreaterThanOrEqual(1);
    expect(week[0].says[0]).toBe("1,258 purchases last month, up from 1,091.");
  });

  test("a typed number is sent back by the Editor: the bubble keeps the rule's words and the next press asks again", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["3 in 4 baskets were left without buying."], steps: [] });
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    const failed = await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key });
    expect(failed).toMatchObject({ status: "FAILED", says: [] });
    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs[0]).toMatchObject({ status: "FAILED" });
    expect(runs[0].error).toContain("typed a number");
    // Asked again on the next press: a second run.
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.total.now]] conversions last month."], steps: [] });
    await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "WRITTEN", says: ["28,623 conversions last month."] });
    expect(await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).length)).toBe(2);
  });

  test("the Head's second look can say more useful words, kept only when the Editor passes them (A5)", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.total.now]] conversions last month."], steps: [] }, {
      useful: false, says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."], steps: [{ words: "Check the counts.", link: 0 }],
    });
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "WRITTEN", says: ["1,258 purchases last month, up from 1,091."] });
    // A rewrite that types a number goes back, and the specialist's words stand.
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.total.now]] conversions last month."], steps: [] }, { useful: false, says: ["About 1,300 purchases."], steps: [] });
    await user.mutation(api.seesAsk.askSees, { ...ask(siteId), device: "mobile" });
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: "googleAnalytics.conversions|lastMonth|||gbr|mobile" })).toMatchObject({ status: "WRITTEN", says: ["28,623 conversions last month."] });
  });

  test("a bubble is kept as an eval page with Anthony's sentences, and the set is graded on the team as it stands (A6)", async () => {
    const t = harness();
    const { siteId, userId, companyId } = await seed(t);
    const superId = await t.run(async (ctx) => await ctx.db.insert("users", { name: "Super", email: "super@platform.test", role: "SUPER_ADMIN", createdAt: 1 }));
    const user = t.withIdentity({ subject: userId });
    const admin = t.withIdentity({ subject: superId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."], steps: [] });
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    const answerId = await t.run(async (ctx) => (await ctx.db.query("seesAnswers").collect())[0]._id);
    const pageId = await admin.mutation(api.seesAsk.keepSeesEvalPage, { answerId, expected: ["1,258 purchases, up from 1,091 the month before, worth more than ever."] });
    void companyId;
    void first;
    // Graded: the team names both of Anthony's figures.
    const [runId] = await admin.mutation(api.seesAsk.gradeSeesEvalNow, {});
    expect(runId).toBeDefined();
    await finishScheduled(t);
    const results = await admin.query(api.seesAsk.seesEvalResults, {});
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ pageId, host: "acme-shop.test", expected: ["1,258 purchases, up from 1,091 the month before, worth more than ever."] });
    expect(results[0].latest).toMatchObject({ passed: true, score: 1, says: ["1,258 purchases last month, up from 1,091."] });
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run?.finalOutput).toContain("1 page graded: 1 passed the Editor; 100% of Anthony's figures named.");
    // The team as it stands next time names one figure only: the score says so.
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.total.now]] conversions last month."], steps: [] });
    await admin.mutation(api.seesAsk.gradeSeesEvalNow, {});
    await finishScheduled(t);
    const again = await admin.query(api.seesAsk.seesEvalResults, {});
    expect(again[0].latest).toMatchObject({ passed: true, score: 0 });
    expect(again[0].latest?.notes.join(" ")).toContain("Not named: 1258, 1091.");
  });

  test("another company's website is not asked about, and a page with no figures is refused", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const strangerId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Elsewhere", createdAt: 1 });
      return await ctx.db.insert("users", { name: "Stranger", email: "stranger@elsewhere.test", role: "USER", companyId, createdAt: 1 });
    });
    const stranger = t.withIdentity({ subject: strangerId });
    await expect(stranger.mutation(api.seesAsk.askSees, ask(siteId))).rejects.toThrow();
    const user = t.withIdentity({ subject: userId });
    await expect(user.mutation(api.seesAsk.askSees, { ...ask(siteId), facts: [] })).rejects.toThrow("no figures");
  });
});
