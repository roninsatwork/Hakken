import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { finishScheduled } from "@/src/test/finishScheduled";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { AUTO_CLASSIFY_DECISION } from "./utils/autoClassify";

const { generate, prepare, ask } = vi.hoisted(() => ({ generate: vi.fn(), prepare: vi.fn(), ask: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));
vi.mock("./decisionActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./decisionActions")>()),
  prepareDecisions: prepare,
  runDecisions: ask,
}));

/**
 * A website's Auto Classify run, step by step (docs/plans/active/
 * auto-classify-plan.md, AC3–AC10), with the writing model and the Decision
 * stood in for: a group without a description is described first and the cost
 * charged to the run; each page is asked with the website, its groups and the
 * run it belongs to; the answers are kept and the run ends with its summary.
 * It stops, saying why, when the Decision is off or the model gives no answer.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const PAGES: Array<[string, number]> = [["/", 499], ["/contact", 32], ["/hinges.html", 20], ["/discounts", 56]];

async function setUp(t: Harness) {
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Period House Group", createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "morehandles.test", displayHost: "morehandles.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    const superId = await ctx.db.insert("users", { name: "Super", email: "super@morehandles.test", role: "SUPER_ADMIN", createdAt: now });
    for (const [page, clicks] of PAGES) {
      await ctx.db.insert("holdPages", { companyWebsiteId: siteId, page, crawled: true, shown: true, clicks, ranks: true });
    }
    await ctx.db.insert("decisionSettings", { scope: "global", decisionKey: AUTO_CLASSIFY_DECISION, mode: "ACT", updatedAt: now });
    return { companyId, siteId, superId };
  });
  const as = t.withIdentity({ subject: ids.superId });
  const hinges = await as.mutation(api.pageClassifications.createPageClassification, {
    companyWebsiteId: ids.siteId, name: "Hinges", type: "PRODUCT", lines: [{ kind: "STARTS_WITH", value: "/hinges/" }], description: "Pages for hinges.",
  });
  const brand = await as.mutation(api.pageClassifications.createPageClassification, {
    companyWebsiteId: ids.siteId, name: "Brand", type: "COMPANY", lines: [{ kind: "EXACT", value: "/" }],
  });
  return { ...ids, as, hinges, brand };
}

/** The Decision's answer for one page: the label it picks, how sure, and who answered. */
function answering(pick: (page: string) => string, source: "TYPESAFE" | "RULES" = "TYPESAFE") {
  ask.mockImplementation(async (_ctx: unknown, args: { state: { page: { address: string } } }) => ({
    [AUTO_CLASSIFY_DECISION]: {
      key: AUTO_CLASSIFY_DECISION,
      answer: { kind: "pick-one", choice: source === "RULES" ? "other" : pick(args.state.page.address) },
      certainty: source === "RULES" ? null : "SURE",
      mode: "ACT",
      verdict: source === "RULES" ? "RULES" : "ACT",
      outcome: "RECORDED",
      source,
      action: null,
    },
  }));
}

const stateOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first());

describe("a website's Auto Classify run", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prepare.mockReset().mockResolvedValue({ modes: { [AUTO_CLASSIFY_DECISION]: "ACT" } });
    generate.mockReset().mockResolvedValue({
      text: "\"Pages about the business itself: its home, contact, delivery and returns pages. Not product pages, which go in their own groups.\"",
      inputTokens: 300,
      outputTokens: 40,
    });
    ask.mockReset();
    answering((page) => (page === "/hinges.html" ? "group-a" : page === "/contact" ? "group-b" : "none"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("describes the group that has none, asks each page under its run, keeps the answers and ends with its summary", async () => {
    const t = harness();
    const s = await setUp(t);
    expect(await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId })).toBe("STARTED");
    const runId = (await stateOf(t, s.siteId))!.agentRunId!;

    await finishScheduled(t);

    // The Brand group described by Hakken, the Hinges group's own words kept.
    const groups = await t.run(async (ctx) => ({ brand: await ctx.db.get(s.brand), hinges: await ctx.db.get(s.hinges) }));
    expect(groups.brand).toMatchObject({ description: expect.stringMatching(/^Pages about the business itself/), descriptionBy: "HAKKEN" });
    expect(groups.hinges).toMatchObject({ description: "Pages for hinges.", descriptionBy: "PERSON" });

    // Each page asked with the website, its groups (with the description just written) and the run it belongs to.
    const asked = ask.mock.calls.map(([, args]) => args as { state: { page: { address: string }; groups: Array<{ label: string; name: string; description: string }> }; requests: Array<{ subjectId: string }>; links: { agentRunId: string } });
    expect(asked.map((call) => call.state.page.address).sort()).toEqual(["/contact", "/discounts", "/hinges.html"]);
    expect(asked[0].links.agentRunId).toBe(runId);
    expect(asked[0].requests[0].subjectId).toBe(asked[0].state.page.address);
    expect(asked[0].state.groups.map((group) => [group.label, group.name])).toEqual([["group-a", "Hinges"], ["group-b", "Brand"]]);
    expect(asked[0].state.groups[1].description).toMatch(/^Pages about the business itself/);

    // The answers kept and shown; the run ended with its summary, its cost on the run and the cost screens.
    const pages = await s.as.query(api.pageClassifications.pageClassificationPages, { companyWebsiteId: s.siteId, page: 1, rows: 15 });
    expect(pages?.rows.find((row) => row.page === "/hinges.html")).toMatchObject({ classificationId: s.hinges, how: "BY_AUTO", certainty: "SURE" });
    expect(pages?.rows.find((row) => row.page === "/contact")).toMatchObject({ classificationId: s.brand, how: "BY_AUTO" });
    expect(pages?.rows.find((row) => row.page === "/discounts")).toMatchObject({ classificationId: null, how: "NONE" });
    expect(await stateOf(t, s.siteId)).toMatchObject({ status: "DONE", total: 3, done: 3, placed: 2 });

    const { run, spend, lines } = await t.run(async (ctx) => ({
      run: await ctx.db.get(runId),
      spend: await ctx.db.query("agentTransactions").collect(),
      lines: await ctx.db.query("agentLogs").withIndex("by_run", (q) => q.eq("runId", runId)).collect(),
    }));
    expect(run).toMatchObject({ status: "SUCCESS", inputTokens: 300, outputTokens: 40 });
    expect(run?.finalOutput).toBe("Sorted morehandles.test: 3 pages asked, 2 given a group. The rest stay Unclassified, for a person or a rule.");
    expect(spend.map((row) => row.actionContext)).toContain("Auto Classify: describing the Brand group");
    expect(lines.map((line) => line.interactionType)).toEqual(expect.arrayContaining(["What there is to do", "Described groups", "Sorted pages 1–3 of 3"]));
  });

  test("switched off meanwhile, it stops and says where to switch it on", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId });
    prepare.mockResolvedValue({ modes: { [AUTO_CLASSIFY_DECISION]: "OFF" } });

    await finishScheduled(t);

    expect(ask).not.toHaveBeenCalled();
    expect(await stateOf(t, s.siteId)).toMatchObject({ status: "STOPPED", stopped: expect.stringContaining("Admin → AI → Decisions") });
  });

  test("when the model gives no answer, nothing is kept, the run stops saying so, and the pages are left for the next run", async () => {
    const t = harness();
    const s = await setUp(t);
    answering(() => "none", "RULES");
    await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId });
    const runId = (await stateOf(t, s.siteId))!.agentRunId!;

    await finishScheduled(t);

    expect(await stateOf(t, s.siteId)).toMatchObject({ status: "STOPPED", done: 0, stopped: expect.stringContaining("gave no answer") });
    expect((await t.run(async (ctx) => await ctx.db.get(runId)))?.status).toBe("FAILED");
    const records = await t.run(async (ctx) => await ctx.db.query("pageClassificationAuto").collect());
    expect(records).toEqual([]);
  });
});
