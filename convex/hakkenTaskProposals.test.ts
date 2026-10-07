import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { canExecuteTool, type ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { ASSISTANT_TASK_HANDLERS } from "./assistantTaskHandlers";
import schema from "./schema";
import { proposalFromToolCalls } from "./utils/hakkenTaskProposals";
import { weekdayIn } from "./utils/hakkenTaskTiming";

/**
 * Setting a Hakken task up in Ask Hakken, item 1.2 of
 * docs/plans/active/hakken-tasks-plan.md: the Assistant proposes, tried on
 * the last weeks of Search Console; nothing happens until the conversation's
 * owner taps yes; and the change is theirs alone.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const me = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "USER", companyId, createdAt: now });
    const colleague = await ctx.db.insert("users", { name: "Jo Hughes", email: "jo@ronins.test", role: "USER", companyId, createdAt: now });
    const own = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId: own, relationship: "OWNED", createdAt: now });
    const rival = await ctx.db.insert("websites", { host: "rival.test", displayHost: "rival.test", firstSeenAt: now });
    await ctx.db.insert("companyWebsites", { companyId, websiteId: rival, relationship: "TRACKED", againstWebsiteId: own, createdAt: now });
    await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId: own, status: "CONNECTED", property: "sc-domain:ronins.test", dataProperty: "sc-domain:ronins.test",
      oldestDay: "2026-09-13", newestDay: "2026-09-26", createdAt: now, updatedAt: now,
    });
    // Fourteen days to 26 September: 10 visitors on the first, one more each day.
    for (let index = 0; index < 14; index += 1) {
      const clicks = 10 + index;
      await ctx.db.insert("searchConsoleDays", {
        companyWebsiteId: siteId, searchType: "web", day: `2026-09-${String(13 + index).padStart(2, "0")}`, clicks, impressions: clicks * 20, ctr: 0.05, position: 5, fetchedAt: now,
      });
    }
    const threadId = await ctx.db.insert("threads", { userId: me, companyId, title: "Watch the website", createdAt: now, updatedAt: now });
    return { companyId, me, colleague, siteId, threadId };
  });
}

/** The runtime's part, as a handler sees it: each call sent to the test's backend. */
function runtime(t: Harness): ToolHandlerExecutionInput["ctx"] {
  type Call = (reference: unknown, args: unknown) => Promise<unknown>;
  const loose = t as unknown as { query: Call; mutation: Call; action: Call };
  return {
    runQuery: (reference: unknown, args: unknown) => loose.query(reference, args),
    runMutation: (reference: unknown, args: unknown) => loose.mutation(reference, args),
    runAction: (reference: unknown, args: unknown) => loose.action(reference, args),
  } as unknown as ToolHandlerExecutionInput["ctx"];
}

async function propose(t: Harness, seeded: Awaited<ReturnType<typeof seed>>, args: Record<string, unknown>) {
  return (await ASSISTANT_TASK_HANDLERS["assistant.tasks.propose"]({
    ctx: runtime(t), handlerMapping: "assistant.tasks.propose", args, companyId: seeded.companyId, userId: seeded.me,
  })) as { ok: boolean; problem?: string; proposal?: Record<string, unknown>; usualDay?: number; wouldHaveToldThem?: string };
}

async function replyWith(t: Harness, threadId: Id<"threads">, proposal: Record<string, unknown>) {
  return await t.run(async (ctx) => await ctx.db.insert("messages", {
    threadId, role: "assistant", content: "Happy to keep an eye on that for you.", createdAt: Date.now(), taskProposal: proposal as never,
  }));
}

describe("the Assistant proposes an alert", () => {
  test("tried on the days Search Console holds: its usual day and how often it would have told them", async () => {
    const t = harness();
    const seeded = await seed(t);
    const read = await propose(t, seeded, { website: "ronins.test", when: "below", value: 15 });
    expect(read.ok).toBe(true);
    expect(read.usualDay).toBe(17);
    expect(read.wouldHaveToldThem).toBe("5 of the last 14 days");
    expect(read.proposal).toMatchObject({
      action: "CREATE",
      status: "PENDING",
      title: "Tell me if ronins.test gets fewer than 15 visitors a day",
      measure: "visitors",
      target: { companyWebsiteId: seeded.siteId, website: "ronins.test" },
      condition: { op: "below", value: 15, days: 1 },
      timeOfDay: "09:00",
      channels: { bell: true, email: true, telegram: false },
      trial: { tells: 5, of: 14 },
    });
  });

  test("says plainly what it cannot watch: a competitor, a website not the company's, a rule with no number", async () => {
    const t = harness();
    const seeded = await seed(t);
    expect((await propose(t, seeded, { website: "rival.test", when: "below", value: 10 })).problem).toMatch(/Google gives a website's owner only/);
    expect((await propose(t, seeded, { website: "elsewhere.test", when: "below", value: 10 })).problem).toMatch(/not one of this company's websites/);
    expect((await propose(t, seeded, { website: "ronins.test", when: "below" })).problem).toMatch(/number or percentage/);
  });

  test("tells a website not connected from one connected whose first days are still on their way", async () => {
    const t = harness();
    const seeded = await seed(t);
    const connection = await t.run((ctx) => ctx.db.query("searchConsoleConnections").first());
    await t.run((ctx) => ctx.db.patch(connection!._id, { newestDay: undefined, oldestDay: undefined }));
    expect((await propose(t, seeded, { website: "ronins.test", when: "below", value: 10 })).problem)
      .toBe("ronins.test is connected to Search Console, but its first days haven't arrived from Google yet. Once they have, usually within a day, ask again and the alert can start.");
    await t.run((ctx) => ctx.db.delete(connection!._id));
    expect((await propose(t, seeded, { website: "ronins.test", when: "below", value: 10 })).problem).toMatch(/^ronins\.test isn't connected to Search Console yet/);
  });
});

describe("nothing changes until its owner taps yes", () => {
  test("yes sets up the alert for them, at their own time zone; asking again changes nothing", async () => {
    const t = harness();
    const seeded = await seed(t);
    const { proposal } = await propose(t, seeded, { website: "ronins.test", when: "below", value: 15, time: "08:30" });
    const messageId = await replyWith(t, seeded.threadId, proposal!);
    const asMe = t.withIdentity({ subject: seeded.me });

    const answered = await asMe.mutation(api.hakkenTasks.answerProposal, { messageId, yes: true, timeZone: "America/New_York" });
    expect(answered.status).toBe("DONE");
    const [task] = await asMe.query(api.hakkenTasks.listMine, {});
    expect(task).toMatchObject({ taskId: answered.taskId, state: "ON", title: "Tell me if ronins.test gets fewer than 15 visitors a day", timeOfDay: "08:30", timeZone: "America/New_York" });

    expect(await asMe.mutation(api.hakkenTasks.answerProposal, { messageId, yes: true })).toEqual({ status: "DONE", taskId: answered.taskId });
    expect(await asMe.query(api.hakkenTasks.listMine, {})).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(messageId)))?.taskProposal?.status).toBe("DONE");
  });

  test("not now leaves everything as it was; nobody but the conversation's owner can answer", async () => {
    const t = harness();
    const seeded = await seed(t);
    const { proposal } = await propose(t, seeded, { website: "ronins.test", when: "below", value: 15 });
    const messageId = await replyWith(t, seeded.threadId, proposal!);

    await expect(t.withIdentity({ subject: seeded.colleague }).mutation(api.hakkenTasks.answerProposal, { messageId, yes: true })).rejects.toThrow(/isn’t there any more/);
    expect(await t.withIdentity({ subject: seeded.me }).mutation(api.hakkenTasks.answerProposal, { messageId, yes: false })).toEqual({ status: "DECLINED" });
    expect(await t.withIdentity({ subject: seeded.me }).query(api.hakkenTasks.listMine, {})).toEqual([]);
  });

  test("pausing one of their own by asking: proposed, then done on yes; another person's cannot even be proposed", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await t.mutation(internal.hakkenTasks.createInternal, {
      companyId: seeded.companyId, userId: seeded.me, kind: "ALERT", title: "Tell me if ronins.test gets fewer than 15 visitors a day",
      channels: { bell: true, email: true, telegram: false },
    });
    const change = (await ASSISTANT_TASK_HANDLERS["assistant.tasks.change"]({
      ctx: runtime(t), handlerMapping: "assistant.tasks.change", args: { taskId, change: "pause" }, companyId: seeded.companyId, userId: seeded.me,
    })) as { proposal: Record<string, unknown> };
    expect(change.proposal).toMatchObject({ action: "PAUSE", status: "PENDING", taskId });

    const notTheirs = (await ASSISTANT_TASK_HANDLERS["assistant.tasks.change"]({
      ctx: runtime(t), handlerMapping: "assistant.tasks.change", args: { taskId, change: "delete" }, companyId: seeded.companyId, userId: seeded.colleague,
    })) as { ok: boolean };
    expect(notTheirs.ok).toBe(false);

    const messageId = await replyWith(t, seeded.threadId, change.proposal);
    await t.withIdentity({ subject: seeded.me }).mutation(api.hakkenTasks.answerProposal, { messageId, yes: true });
    expect((await t.withIdentity({ subject: seeded.me }).query(api.hakkenTasks.listMine, {}))[0].state).toBe("PAUSED");
  });
});

describe("the reply carries what the run proposed", () => {
  test("the last proposal that worked, waiting for a tap", () => {
    const ok = (proposal: Record<string, unknown>) => JSON.stringify({ status: "SUCCESS", data: { ok: true, proposal } });
    expect(proposalFromToolCalls([
      { handlerMapping: "assistant.tasks.propose", status: "SUCCESS", resultJson: ok({ action: "CREATE", status: "PENDING", title: "First" }) },
      { handlerMapping: "assistant.tasks.propose", status: "SUCCESS", resultJson: JSON.stringify({ data: { ok: false, problem: "No" } }) },
      { handlerMapping: "assistant.searchConsole", status: "SUCCESS", resultJson: ok({ action: "CREATE", status: "PENDING", title: "Not a proposal" }) },
      { handlerMapping: "assistant.tasks.change", status: "SUCCESS", resultJson: ok({ action: "PAUSE", status: "DONE", title: "Second" }) },
    ])).toMatchObject({ action: "PAUSE", title: "Second", status: "PENDING" });
    expect(proposalFromToolCalls([{ handlerMapping: "assistant.tasks.propose", status: "FAILED", resultJson: ok({ action: "CREATE", title: "No" }) }])).toBeUndefined();
  });
});

describe("who may have the Assistant propose", () => {
  test("any member, for the task tools; the rest of the tools stay administrators'", () => {
    const member = { requiredRole: "ADMIN" as const, userRole: "USER" as const, sideEffectLevel: "READ" as const, userCompanyId: "c", targetCompanyId: "c" };
    for (const handlerMapping of ["assistant.tasks.propose", "assistant.tasks.list", "assistant.tasks.change"]) {
      expect(canExecuteTool({ ...member, handlerMapping }).allowed).toBe(true);
    }
    expect(canExecuteTool({ ...member, handlerMapping: "gmail.read" }).allowed).toBe(false);
  });
});

describe("a weekly report, proposed for a yes", () => {
  async function withPages(t: Harness, siteId: Id<"companyWebsites">) {
    await t.run(async (ctx) => {
      const pages = ["https://ronins.test/a/", "https://ronins.test/b/", "https://ronins.test/c/"];
      for (const [which, clicks, from, to] of [["NOW", [412, 188, 50], "2026-09-20", "2026-09-26"], ["BEFORE", [508, 249, 20], "2026-09-13", "2026-09-19"]] as const) {
        await ctx.db.insert("searchConsolePeriods", {
          companyWebsiteId: siteId, searchType: "web", list: "page", period: "7", which, part: 0, from, to,
          keys: pages, clicks: [...clicks], impressions: clicks.map((count) => count * 20), positionSums: clicks.map((count) => count * 80),
          counts: pages.map(() => 1), tops: pages, builtAt: 1,
        });
      }
    });
  }

  test("is written out with what this week's would hold, and a yes sets it up for its day", async () => {
    const t = harness();
    const seeded = await seed(t);
    await withPages(t, seeded.siteId);
    const read = (await ASSISTANT_TASK_HANDLERS["assistant.tasks.proposeReport"]({
      ctx: runtime(t), handlerMapping: "assistant.tasks.proposeReport", companyId: seeded.companyId, userId: seeded.me,
      args: { website: "ronins.test", direction: "lost", count: 2, weekday: "Friday" },
    })) as { ok: boolean; thisWeek?: Array<{ page: string; change: number }>; proposal?: Record<string, unknown> };
    expect(read.ok).toBe(true);
    expect(read.thisWeek).toEqual([{ page: "/a/", visitors: 412, change: -96 }, { page: "/b/", visitors: 188, change: -61 }]);
    expect(read.proposal).toMatchObject({
      action: "CREATE", title: "Every Friday, send me the three pages that lost the most visitors",
      report: { look: "pagesChange", direction: "lost", count: 3, every: "week", weekday: 5 },
    });

    const messageId = await replyWith(t, seeded.threadId, read.proposal!);
    await t.withIdentity({ subject: seeded.me }).mutation(api.hakkenTasks.answerProposal, { messageId, yes: true, timeZone: "Europe/London" });
    const [task] = await t.run((ctx) => ctx.db.query("hakkenTasks").collect());
    expect(task).toMatchObject({ kind: "REPORT", report: { weekday: 5 } });
    expect(weekdayIn(task.nextCheckAt!, "Europe/London")).toBe(5);
  });

  test("compares visitors only, for now, and says so", async () => {
    const t = harness();
    const seeded = await seed(t);
    const read = (await ASSISTANT_TASK_HANDLERS["assistant.tasks.proposeReport"]({
      ctx: runtime(t), handlerMapping: "assistant.tasks.proposeReport", companyId: seeded.companyId, userId: seeded.me,
      args: { website: "ronins.test", measure: "impressions" },
    })) as { ok: boolean; problem?: string };
    expect(read.problem).toMatch(/visitors from Google for now/);
  });
});

