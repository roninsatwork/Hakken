import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { ANALYTICS_READ } from "./utils/agentTools";

/**
 * The eye asks the Insights team (sees-conversion-specialist-plan-2026-10-30.md):
 * a press starts one run of the Head of Strategy's, which picks the
 * specialist, has it read the website's screens for itself and write
 * (stronger-agents-plan-2026-10-30.md A1), has the Editor's code check every
 * number, and saves the bubble; the answer is kept three hours for that page
 * and its filters while its figures stand; a bubble the Editor sends back is
 * written once more, then leaves the rule's words standing, and the next press
 * asks again. The Head's questions are single asks (`generate`); the
 * specialist's reading is a conversation with tools (`stream`).
 */
const { generate, stream } = vi.hoisted(() => ({ generate: vi.fn(), stream: vi.fn() }));
vi.mock("./aiProviderRegistry", async (original) => ({ ...(await original<typeof import("./aiProviderRegistry")>()), generateTextWithResolvedModel: generate }));
vi.mock("./agentProviderRegistry", async (original) => ({
  ...(await original<typeof import("./agentProviderRegistry")>()),
  getAgentProviderAdapter: () => ({ providerKey: "test", streamTurn: stream }),
}));

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => { useFixedDay("2026-10-30"); generate.mockReset(); stream.mockReset(); });
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

/** A specialist's turn that reads a screen instead of answering. */
const reads = (args: Record<string, unknown>) => ({ read: args });
/** A specialist that takes several turns: each a read or an answer, in order; the last repeated. */
const turns = (...each: unknown[]) => ({ turns: each });

/**
 * The team's three answers: the Head's choice, the specialist's bubble (one answer, or `turns(…)`), and the Head's
 * second look (kept as is unless given). A page with no reads (the eval set's) asks the specialist as a single ask.
 */
const answers = (head: unknown, specialist: unknown, secondLook: unknown = { useful: true }, judge: unknown = null) => {
  const sequence = specialist && typeof specialist === "object" && "turns" in specialist ? (specialist as { turns: unknown[] }).turns : [specialist];
  generate.mockImplementation(async (request: { systemInstruction?: string }) => {
    const system = request.systemInstruction ?? "";
    const answer = system.includes("Choose which specialist") ? head
      : system.includes("A specialist wrote the bubble below") ? secondLook
        : system.includes("Anthony wrote down what a good bubble") ? judge
          : sequence[sequence.length - 1];
    return { text: JSON.stringify(answer), inputTokens: 100, outputTokens: 40 };
  });
  let at = 0;
  stream.mockImplementation(async () => {
    const turn = sequence[Math.min(at, sequence.length - 1)];
    at += 1;
    const read = turn && typeof turn === "object" && "read" in turn ? (turn as { read: Record<string, unknown> }).read : null;
    return read
      ? { text: "", toolCalls: [{ name: ANALYTICS_READ, args: read }], inputTokens: 100, outputTokens: 40, cachedInputTokens: 0, outcome: "RUN_TOOLS" }
      : { text: JSON.stringify(turn), toolCalls: [], inputTokens: 100, outputTokens: 40, cachedInputTokens: 0, outcome: "COMPLETE" };
  });
};

describe("the eye asks the Insights team", () => {
  test("a press starts the Head's run, the specialist writes from the page's figures, the Editor passes it, and it is kept three hours", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION", why: "It is about conversions." }, {
      says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."],
      steps: [{ words: "Find why [[conv.total.now]] conversions hold so few purchases.", link: 0 }],
    });
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    expect(first).toEqual({ key: "googleAnalytics.conversions|lastMonth|||gbr|", status: "RESEARCHING" });
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "RESEARCHING", says: [] });
    await finishScheduled(t);
    const written = await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key });
    expect(written).toMatchObject({
      status: "WRITTEN",
      says: ["1,258 purchases last month, up from 1,091."],
      steps: [{ words: "Find why 28,623 conversions hold so few purchases.", link: "Tracking health", href: "/app/analytics/site/tracking-health" }],
      role: "INSIGHTS_CONVERSION",
    });
    // Three model calls — the Head's choice, the specialist's words, the Head's second look — on one run of the Head's, with its cost.
    expect(generate).toHaveBeenCalledTimes(2);
    expect(stream).toHaveBeenCalledTimes(1);
    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "SUCCESS", title: "The eye: acme-shop.test" });
    expect(runs[0].inputTokens).toBe(300);
    // Pressed again within three hours: the same answer, nothing asked.
    const again = await user.mutation(api.seesAsk.askSees, ask(siteId));
    expect(again).toEqual({ key: first.key, status: "WRITTEN" });
    await finishScheduled(t);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(stream).toHaveBeenCalledTimes(1);
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
      useful: false, says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."], steps: [{ words: "Grow [[conv.purchases.now]] purchases.", link: 0 }],
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

  test("the specialist reads the website's screens for itself: a screen that cannot answer goes back to it as words, and it writes (A1)", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, turns(
      reads({ screen: "channels" }),
      { says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."], steps: [{ words: "Grow [[conv.purchases.now]] purchases.", link: 0 }] },
    ));
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "WRITTEN", says: ["1,258 purchases last month, up from 1,091."] });
    // Two turns: a read, then the words. The read's answer went back inside the conversation, with the reads made for it
    // first — the page's own screen, its map by kind of page and by channel, and for a shop its products — in its opening.
    expect(stream).toHaveBeenCalledTimes(2);
    const opening = (stream.mock.calls[0][0] as { turns: Array<{ parts: Array<{ text?: string }> }> }).turns[0].parts[0].text ?? "";
    expect(opening).toContain("Read for you already");
    expect(opening).toContain("\"screen\":\"conversions\"");
    expect(opening).toContain("\"screen\":\"products\"");
    expect(opening).toContain("\"columns\":\"kind\"");
    expect(opening).toContain("\"columns\":\"channel\"");
    const second = (stream.mock.calls[1][0] as { turns: Array<{ role: string; parts: Array<{ functionResponse?: { response: { content: { problem?: string } } } }> }> }).turns;
    expect(second.at(-1)?.role).toBe("function");
    expect(second.at(-1)?.parts[0].functionResponse?.response.content.problem).toContain("no Google Analytics figures yet");
    // Every read is on the run's log, saying what it read and why it could not.
    const logged = await t.run(async (ctx) => (await ctx.db.query("agentLogs").collect()).filter((line) => line.interactionType === "Read").map((line) => line.responseContent));
    expect(logged).toHaveLength(5);
    expect(logged[0]).toMatch(/^conversions: acme-shop\.test has no Google Analytics figures yet/);
    expect(logged[1]).toMatch(/^conversionsBy, kind: /);
    expect(logged[4]).toMatch(/^channels: /);
  });

  test("the Editor sends tracking advice back when tracking health found nothing wrong, and the specialist writes it again in the same conversation", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, turns(
      { says: ["[[conv.purchases.now]] purchases last month."], steps: [{ words: "Stop counting basket additions as conversions.", link: 0 }] },
      { says: ["[[conv.purchases.now]] purchases last month."], steps: [{ words: "Find why [[conv.total.now]] conversions hold so few purchases.", link: 0 }] },
    ));
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({
      status: "WRITTEN",
      steps: [{ words: "Find why 28,623 conversions hold so few purchases." }],
    });
    expect(stream).toHaveBeenCalledTimes(2);
    const told = (stream.mock.calls[1][0] as { turns: Array<{ role: string; parts: Array<{ text?: string }> }> }).turns.at(-1);
    expect(told?.role).toBe("user");
    expect(told?.parts[0].text).toContain("The Editor sent it back: A step advised on tracking or what counts, and tracking health found nothing wrong: \"Stop counting basket additions as conversions.\"");
  });

  test("the Head's choice of the measurement specialist for a conversions page stands only when tracking health found a fault", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    await t.run(async (ctx) => { await ctx.db.insert("agents", { name: "INSIGHTS_MEASUREMENT", systemKey: "INSIGHTS_MEASUREMENT", modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 }); });
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_MEASUREMENT" }, { says: ["[[conv.purchases.now]] purchases last month."], steps: [] });
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "WRITTEN", role: "INSIGHTS_CONVERSION" });
    const said = await t.run(async (ctx) => (await ctx.db.query("agentLogs").collect()).map((line) => line.responseContent).join(" "));
    expect(said).toContain("tracking health found nothing that breaks the conversion figures: a page about conversions goes to the Conversion specialist");
  });

  test("with Jev's check switched on, a sentence that states a guess as fact goes back, and the specialist writes it again (sees-findings plan, phase 4)", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    vi.stubEnv("TYPESAFE_API_KEY", "typesafe-test-key");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("aiProviders", { providerKey: "typesafe", displayName: "TypeSafe", isEnabled: true, authMode: "environment", status: "healthy", createdAt: now, updatedAt: now });
      await ctx.db.insert("aiModels", { modelId: "typesafe:jev-latest", providerKey: "typesafe", providerModelId: "jev-latest", displayName: "Jev Latest", isEnabled: true, isDefault: false, capabilities: ["decision"], supportedUseCases: ["decision"], lastSyncedAt: now });
      await ctx.db.insert("decisionSettings", { scope: "global", decisionKey: "sees.guess-as-fact", mode: "ACT", updatedAt: now });
    });
    // Jev: sure the first sentence it sees is a guess stated as fact; sure the next is not.
    let jevCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { questions: Record<string, unknown> };
      jevCalls += 1;
      const noul = jevCalls === 1 ? 0.95 : 0.05;
      return Response.json({ model: "jev-latest", answers: Object.fromEntries(Object.keys(body.questions).map((key) => [key, { type: "noul", noul }])), usage: { input_tokens: 30, output_tokens: 5 } });
    }));
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, turns(
      { says: ["[[conv.purchases.now]] purchases, because shoppers simply trusted the shop more."], steps: [] },
      { says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."], steps: [] },
    ));
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "WRITTEN", says: ["1,258 purchases last month, up from 1,091."] });
    const told = (stream.mock.calls[1][0] as { turns: Array<{ parts: Array<{ text?: string }> }> }).turns.at(-1)?.parts[0].text ?? "";
    expect(told).toContain("states a reason the figures don't show as fact");
    // Every answer recorded, as every Decision is.
    const runs = await t.run(async (ctx) => (await ctx.db.query("decisionRuns").collect()).filter((row) => row.decisionKey === "sees.guess-as-fact"));
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.some((row) => row.outcome === "ACTED")).toBe(true);
  });

  test("new figures on the page are new words: a saved bubble stands only while the page's figures do (S3)", async () => {
    const t = harness();
    const { siteId, userId } = await seed(t);
    const user = t.withIdentity({ subject: userId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.purchases.now]] purchases last month."], steps: [] });
    const first = await user.mutation(api.seesAsk.askSees, ask(siteId));
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "WRITTEN", says: ["1,258 purchases last month."] });
    // The night's run moved a figure: the same page, dates and filters, written afresh.
    const moved = { ...ask(siteId), facts: ask(siteId).facts.map((fact) => (fact.key === "conv.purchases.now" ? { ...fact, value: 1262 } : fact)) };
    expect(await user.mutation(api.seesAsk.askSees, moved)).toEqual({ key: first.key, status: "RESEARCHING" });
    await finishScheduled(t);
    expect(await user.query(api.seesAsk.seesAnswer, { siteId, key: first.key })).toMatchObject({ status: "WRITTEN", says: ["1,262 purchases last month."] });
    expect(await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).length)).toBe(2);
  });

  test("a bubble is kept as an eval page with Anthony's sentences, and the set is graded on the team as it stands (A6)", async () => {
    const t = harness();
    const { siteId, userId, companyId } = await seed(t);
    const superId = await t.run(async (ctx) => await ctx.db.insert("users", { name: "Super", email: "super@platform.test", role: "SUPER_ADMIN", createdAt: 1 }));
    const user = t.withIdentity({ subject: userId });
    const admin = t.withIdentity({ subject: superId });
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.purchases.now]] purchases last month, up from [[conv.purchases.before]]."], steps: [] }, undefined, { points: [{ found: true, why: "It says purchases rose." }] });
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
    expect(run?.finalOutput).toContain("1 page graded: 1 passed the Editor; 100% of what Anthony would want found was found.");
    // Kept with where it was looked at, so the team reads the website's screens as the reader saw them.
    expect(await t.run(async (ctx) => await ctx.db.get(pageId))).toMatchObject({ period: "lastMonth", country: "gbr", device: "", shop: true });
    // The team as it stands next time misses Anthony's point: the judge says so, point by point.
    answers({ specialist: "INSIGHTS_CONVERSION" }, { says: ["[[conv.total.now]] conversions last month."], steps: [] }, undefined, { points: [{ found: false, why: "It never mentions purchases." }] });
    await admin.mutation(api.seesAsk.gradeSeesEvalNow, {});
    await finishScheduled(t);
    const again = await admin.query(api.seesAsk.seesEvalResults, {});
    expect(again[0].latest).toMatchObject({ passed: true, score: 0 });
    expect(again[0].latest?.notes.join(" ")).toContain("Missed: 1,258 purchases, up from 1,091 the month before, worth more than ever. — It never mentions purchases.");
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
