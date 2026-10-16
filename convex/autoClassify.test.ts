import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { autoWorkOf } from "./autoClassifyStart";
import { readPageKinds } from "./pageKinds";
import schema from "./schema";
import { AUTO_CLASSIFY_DECISION } from "./utils/autoClassify";
import { AUTO_CLASSIFIER, AUTO_CLASSIFY_STALL_MS } from "./utils/autoClassifyAgent";

/**
 * Auto Classify (docs/plans/active/auto-classify-plan.md): switched off it
 * starts nothing; on, each website is a run of its own under the Auto
 * Classify agent, with its first step and log line; its answers fill only
 * what no person and no line sets, the same on every screen; a page is asked
 * once, and again only when the groups change; a person's description is
 * never written over; a run whose step was lost carries on.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** More Handles' own pages, cut down: [page, clicks]. */
const PAGES: Array<[string, number]> = [
  ["/", 499],
  ["/blog/tubular-latch-guide-choosing-right-latch/", 314],
  ["/hinges/specialist-hinges.html", 53],
  ["/discounts", 56],
  ["/window-furniture.html", 34],
  ["/contact", 32],
  ["/hinges.html", 20],
  ["/ztlka-double-sprung-tubular-latch-architectural-quality.html", 19],
];

async function setUp(t: Harness, options: { on?: boolean } = {}) {
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Period House Group", createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "morehandles.test", displayHost: "morehandles.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    const superId = await ctx.db.insert("users", { name: "Super", email: "super@morehandles.test", role: "SUPER_ADMIN", createdAt: now });
    for (const [page, clicks] of PAGES) {
      await ctx.db.insert("holdPages", { companyWebsiteId: siteId, page, crawled: true, shown: true, clicks, ranks: true });
    }
    if (options.on) {
      await ctx.db.insert("decisionSettings", { scope: "global", decisionKey: AUTO_CLASSIFY_DECISION, mode: "ACT", updatedAt: now });
    }
    return { companyId, websiteId, siteId, superId };
  });
  const as = t.withIdentity({ subject: ids.superId });
  const create = (name: string, lines: Array<{ kind: "STARTS_WITH" | "EXACT"; value: string }>, description?: string) =>
    as.mutation(api.pageClassifications.createPageClassification, { companyWebsiteId: ids.siteId, name, type: "PRODUCT", lines, ...(description !== undefined ? { description } : {}) });
  return { ...ids, as, create };
}

const scheduledNames = (t: Harness) =>
  t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));

const stateOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("autoClassifyRuns").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first());

const toAsk = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => (await autoWorkOf(ctx, (await ctx.db.get(siteId))!)).toAsk.map((row) => row.page));

describe("Auto Classify", () => {
  test("switched off, the button starts nothing and makes nothing", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");

    expect(await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId })).toBe("DECISION_OFF");
    const made = await t.run(async (ctx) => ({
      agents: await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", AUTO_CLASSIFIER.systemKey)).collect(),
      runs: await ctx.db.query("autoClassifyRuns").collect(),
    }));
    expect(made).toEqual({ agents: [], runs: [] });
    expect((await s.as.query(api.autoClassifyStart.autoClassifyStatus, { companyWebsiteId: s.siteId }))?.readiness).toBe("DECISION_OFF");
  });

  test("on, a website's run starts under the Auto Classify agent, with what there is to do on its first step", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");
    await s.create("Brand", [{ kind: "EXACT", value: "/" }], "The business itself.");

    expect(await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId })).toBe("STARTED");

    const { agent, schedule, run, lines } = await t.run(async (ctx) => {
      const agent = (await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", AUTO_CLASSIFIER.systemKey)).first())!;
      const run = (await ctx.db.query("agentRuns").withIndex("by_agent_started", (q) => q.eq("agentId", agent._id)).first())!;
      return {
        agent,
        schedule: await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).first(),
        run,
        lines: await ctx.db.query("agentLogs").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
      };
    });
    expect(agent.name).toBe("Auto Classify");
    expect(schedule?.isActive).toBe(true);
    expect(run).toMatchObject({ title: "Auto Classify: morehandles.test", status: "QUEUED", companyId: s.companyId });
    expect(lines.map((line) => line.interactionType)).toEqual(["What there is to do"]);
    expect(lines[0].responseContent).toContain("Started from the Auto Classify button.");
    // Six pages no person or rule sets: the blog post, the discounts, the window furniture, contact, hinges.html and the latch.
    expect(await stateOf(t, s.siteId)).toMatchObject({ status: "SORTING", total: 6, done: 0, agentRunId: run._id });
    expect(await scheduledNames(t)).toContain("autoClassifyRun:sortStep");
    // A second press while it sorts leaves it to go.
    expect(await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId })).toBe("GOING");
  });

  test("its answers fill only what no person and no line sets, the same on every screen, and a page is asked once", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    const hinges = await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");
    const brand = await s.create("Brand", [{ kind: "EXACT", value: "/" }], "The business itself.");
    await s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: s.siteId, classificationId: brand, pages: ["/window-furniture.html"] });
    await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId });
    const state = (await stateOf(t, s.siteId))!;
    const stamp = await t.run(async (ctx) => (await autoWorkOf(ctx, (await ctx.db.get(s.siteId))!)).stamp);

    await t.mutation(internal.autoClassifySteps.writeAnswers, {
      companyWebsiteId: s.siteId,
      runId: state.agentRunId!,
      stamp,
      since: 0,
      answers: [
        { page: "/hinges.html", classificationId: hinges, band: "SURE" },
        { page: "/contact", classificationId: brand, band: "FAIRLY_SURE" },
        { page: "/discounts", classificationId: null, band: "SURE" },
        { page: "/ztlka-double-sprung-tubular-latch-architectural-quality.html", classificationId: hinges, band: "NOT_SURE" },
      ],
      line: { heading: "Sorted pages 1–4 of 5", detail: "2 given a group." },
    });

    const pages = await s.as.query(api.pageClassifications.pageClassificationPages, { companyWebsiteId: s.siteId, page: 1, rows: 15 });
    const row = (page: string) => pages?.rows.find((entry) => entry.page === page);
    expect(row("/hinges.html")).toMatchObject({ classificationId: hinges, how: "BY_AUTO", certainty: "SURE" });
    expect(row("/contact")).toMatchObject({ classificationId: brand, how: "BY_AUTO", certainty: "FAIRLY_SURE" });
    // None of these, or not sure, leaves the page Unclassified.
    expect(row("/discounts")).toMatchObject({ classificationId: null, how: "NONE", certainty: null });
    expect(row("/ztlka-double-sprung-tubular-latch-architectural-quality.html")).toMatchObject({ classificationId: null, how: "NONE" });
    // A person and a line win.
    expect(row("/window-furniture.html")).toMatchObject({ classificationId: brand, how: "BY_HAND" });
    expect(row("/hinges/specialist-hinges.html")).toMatchObject({ classificationId: hinges, how: "BY_LINE" });
    expect(pages?.summary).toMatchObject({ sorted: 5, notSorted: 3 });

    const onlyAuto = await s.as.query(api.pageClassifications.pageClassificationPages, { companyWebsiteId: s.siteId, page: 1, rows: 15, classification: "BY_AUTO" });
    expect(onlyAuto?.rows.map((entry) => entry.page)).toEqual(["/contact", "/hinges.html"]);

    // The charts' page kinds give the same group.
    const kinds = await t.run(async (ctx) => {
      const read = (await readPageKinds(ctx, s.siteId))!;
      return { hinges: read.kindOf("/hinges.html"), contact: read.kindOf("/contact") };
    });
    expect(kinds).toEqual({ hinges, contact: brand });

    // Asked pages are not asked again under the same groups; only the blog post is left.
    expect(await toAsk(t, s.siteId)).toEqual(["/blog/tubular-latch-guide-choosing-right-latch/"]);
    // A group changed: every page Auto Classify answered is asked again.
    await s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: s.siteId, classificationId: hinges, name: "Door hinges" });
    expect(await toAsk(t, s.siteId)).toHaveLength(5);
  });

  test("the bin takes a page out of Auto Classify, and it is not asked again", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    const hinges = await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");
    await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId });
    const state = (await stateOf(t, s.siteId))!;
    const stamp = await t.run(async (ctx) => (await autoWorkOf(ctx, (await ctx.db.get(s.siteId))!)).stamp);
    await t.mutation(internal.autoClassifySteps.writeAnswers, {
      companyWebsiteId: s.siteId, runId: state.agentRunId!, stamp, since: 0,
      answers: [{ page: "/hinges.html", classificationId: hinges, band: "SURE" }],
      line: { heading: "Sorted pages 1–1 of 6", detail: "1 given a group." },
    });

    expect(await s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: s.siteId, page: "/hinges.html" }))
      .toEqual({ classificationId: null, how: "TAKEN_OUT" });
    // Renaming the group would ask every answered page again — but not one a person took out.
    await s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: s.siteId, classificationId: hinges, name: "Door hinges" });
    expect(await toAsk(t, s.siteId)).not.toContain("/hinges.html");
  });

  test("a person's description is never written over; an empty one is Hakken's to write", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    const hinges = await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Hinges, and only hinges.");
    const detail = () => s.as.query(api.pageClassifications.pageClassificationDetail, { companyWebsiteId: s.siteId, classificationId: hinges });

    expect(await detail()).toMatchObject({ description: "Hinges, and only hinges.", descriptionBy: "PERSON" });
    expect(await t.mutation(internal.autoClassifySteps.saveDescription, { classificationId: hinges, description: "Pages for hinges." })).toBe(false);

    await s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: s.siteId, classificationId: hinges, description: "" });
    expect(await detail()).toMatchObject({ description: null, descriptionBy: null });
    expect(await t.mutation(internal.autoClassifySteps.saveDescription, { classificationId: hinges, description: "Pages for hinges and hinge packs." })).toBe(true);
    expect(await detail()).toMatchObject({ description: "Pages for hinges and hinge packs.", descriptionBy: "HAKKEN" });
  });

  test("a group added, changed or removed sorts the website again two minutes later", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }]);
    expect(await scheduledNames(t)).toEqual(["autoClassifyStart:startForWebsite"]);
  });

  test("a run whose last step was lost carries on from where it was, saying so on its run", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");
    await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId });
    const state = (await stateOf(t, s.siteId))!;
    await t.run(async (ctx) => ctx.db.patch(state._id, { lastStepAt: Date.now() - AUTO_CLASSIFY_STALL_MS - 1_000 }));

    expect(await t.mutation(internal.autoClassifyStart.carryOnStalled, {})).toBe(1);
    expect((await stateOf(t, s.siteId))!.lastStepAt).toBeGreaterThan(Date.now() - 60_000);
    const lines = await t.run(async (ctx) => await ctx.db.query("agentLogs").withIndex("by_run", (q) => q.eq("runId", state.agentRunId!)).collect());
    expect(lines.map((line) => line.interactionType)).toContain("Carried on");
    // A run still moving is left alone.
    expect(await t.mutation(internal.autoClassifyStart.carryOnStalled, {})).toBe(0);
  });

  test("its end closes the agent's run with its summary", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");
    await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId });
    const state = (await stateOf(t, s.siteId))!;

    await t.mutation(internal.autoClassifySteps.finishSiteRun, {
      companyWebsiteId: s.siteId, runId: state.agentRunId!, outcome: "DONE", failed: false, summary: "Sorted morehandles.test: 6 pages asked, 4 given a group.",
    });
    const run = await t.run(async (ctx) => await ctx.db.get(state.agentRunId!));
    expect(run).toMatchObject({ status: "SUCCESS", finalOutput: "Sorted morehandles.test: 6 pages asked, 4 given a group." });
    expect(await stateOf(t, s.siteId)).toMatchObject({ status: "DONE" });
  });

  test("the night's run starts a run of its own for each website with pages to sort", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");
    const agentId = await t.mutation(internal.autoClassifyStart.ensureAutoClassifierInternal, {});
    const parent = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, triggerType: "SCHEDULE", objective: "Sort", title: "Auto Classify: new pages each night", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    }));

    await t.action(internal.autoClassifyStart.runAutoClassifyNow, { runId: parent });

    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").withIndex("by_agent_started", (q) => q.eq("agentId", agentId)).collect());
    expect(runs.find((run) => run._id === parent)).toMatchObject({ status: "SUCCESS" });
    expect(runs.find((run) => run._id === parent)?.finalOutput).toContain("1 run of its own started.");
    expect(runs.map((run) => run.title)).toContain("Auto Classify: morehandles.test");
    const lines = await t.run(async (ctx) => {
      const child = runs.find((run) => run._id !== parent)!;
      return await ctx.db.query("agentLogs").withIndex("by_run", (q) => q.eq("runId", child._id)).collect();
    });
    expect(lines[0].responseContent).toContain("Started by the night's run");
  });

  test("its Run button and its nightly schedule start its own job, not a model", async () => {
    const t = harness();
    const s = await setUp(t);
    const agentId = await t.mutation(internal.autoClassifyStart.ensureAutoClassifierInternal, {});
    await s.as.mutation(api.scheduler.manualRunSchedule, { agentId });
    await t.run(async (ctx) => {
      const schedule = (await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", agentId)).first())!;
      await ctx.db.patch(schedule._id, { nextRunAt: Date.now() - 1_000 });
    });
    await t.mutation(internal.workflowEngine.scheduleDispatcher, {});

    const names = await scheduledNames(t);
    expect(names.filter((name) => name === "autoClassifyStart:runAutoClassifyNow")).toHaveLength(2);
    expect(names.some((name) => name.includes("runTriggeredAgentObjective"))).toBe(false);
  });

  test("each step's Jev answers are added to its run's cost, so Agents and the observatory show what a run cost", async () => {
    const t = harness();
    const s = await setUp(t, { on: true });
    const hinges = await s.create("Hinges", [{ kind: "STARTS_WITH", value: "/hinges/" }], "Pages for hinges.");
    await s.as.mutation(api.autoClassifyStart.startAutoClassify, { companyWebsiteId: s.siteId });
    const runId = (await stateOf(t, s.siteId))!.agentRunId!;
    const stamp = await t.run(async (ctx) => (await autoWorkOf(ctx, (await ctx.db.get(s.siteId))!)).stamp);
    const since = Date.now();
    await t.run(async (ctx) => {
      const answer = { decisionKey: AUTO_CLASSIFY_DECISION, subjectKind: "website-pages", answer: "group-a", mode: "ACT" as const, outcome: "RECORDED" as const, source: "TYPESAFE" as const, agentRunId: runId };
      // One from before the step, which is not this step's.
      await ctx.db.insert("decisionRuns", { ...answer, subjectId: "/old.html", costUsd: 5, inputTokens: 999, outputTokens: 99, createdAt: since - 1 });
      await ctx.db.insert("decisionRuns", { ...answer, subjectId: "/hinges.html", costUsd: 0.001, inputTokens: 2_400, outputTokens: 230, createdAt: since });
      await ctx.db.insert("decisionRuns", { ...answer, subjectId: "/contact", costUsd: 0.002, inputTokens: 2_300, outputTokens: 220, createdAt: since + 1 });
    });

    await t.mutation(internal.autoClassifySteps.writeAnswers, {
      companyWebsiteId: s.siteId, runId, stamp, since,
      answers: [{ page: "/hinges.html", classificationId: hinges, band: "SURE" }, { page: "/contact", classificationId: null, band: "SURE" }],
      line: { heading: "Sorted pages 1–2 of 6", detail: "1 given a group." },
    });

    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run?.costUsd).toBeCloseTo(0.003, 6);
    expect(run).toMatchObject({ inputTokens: 4_700, outputTokens: 450 });
  });
});
