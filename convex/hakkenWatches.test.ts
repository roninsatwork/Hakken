import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderOutboxRow } from "./outboxTemplates";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { setPoint } from "./positionHistory";

/**
 * The Watcher on AI answers and Google rankings (docs/plans/active/
 * hakken-tasks-plan.md, item 4.3): each new answer to a tracked question, and
 * each new check of a tracked search, judged in plain code; its owner told
 * once for each one that meets their rule.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

afterEach(() => {
  vi.useRealTimers();
});

const PROMPT = "best web design agency uk";
const KEYWORD = "web design surrey";

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const owner = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "ADMIN", companyId, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: siteId, prompt: PROMPT, engines: ["chatgpt"], isActive: true, createdAt: now });
    await ctx.db.insert("websiteKeywords", { websiteId, companyWebsiteId: siteId, keyword: KEYWORD, isActive: true, createdAt: now });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "serp", family: "SERP", mode: "LIVE", tag: "t", attempts: 0, costUsd: 0, sandbox: false, submittedAt: now, status: "READY", taskArgsJson: "{}",
    } as never);
    return { companyId, owner, websiteId, siteId, pullId };
  });
}

type Seeded = Awaited<ReturnType<typeof seed>>;

/** ChatGPT's newest answer to the tracked question, on `day`, treating the website as `newest`. */
async function answered(t: Harness, seeded: Seeded, day: string, newest: "RECOMMENDED" | "NAMED" | null) {
  await t.run(async (ctx) => {
    const old = await ctx.db.query("siteListQuestions").collect();
    for (const row of old) await ctx.db.delete(row._id);
    await ctx.db.insert("siteListQuestions", {
      companyWebsiteId: seeded.siteId, locationCode: 2826, prompt: PROMPT, updatedAt: Date.now(),
      engines: [{ engine: "chatgpt", asked: 3, lastDay: day, sites: newest ? [{ websiteId: seeded.websiteId, named: 3, recommended: newest === "RECOMMENDED" ? 3 : 2, warnedAgainst: 0, lastNamedDay: day, newest }] : [] }],
    });
  });
}

async function checked(t: Harness, seeded: Seeded, day: string, position: number | undefined) {
  await t.run((ctx) => setPoint(ctx, { websiteId: seeded.websiteId, keyword: KEYWORD, locationCode: 2826, day }, {
    ...(position !== undefined ? { position } : {}), kind: "CHECK",
  }));
}

async function alert(t: Harness, seeded: Seeded, watch: { answer?: object; ranking?: object; title: string }) {
  const taskId = await t.mutation(internal.hakkenTasks.createInternal, {
    companyId: seeded.companyId, userId: seeded.owner, kind: "ALERT", title: watch.title,
    target: { companyWebsiteId: seeded.siteId, website: "ronins.test" },
    ...(watch.answer ? { answer: watch.answer as never } : {}), ...(watch.ranking ? { ranking: watch.ranking as never } : {}),
    channels: { bell: true, email: true, telegram: false },
  });
  await due(t, taskId);
  return taskId;
}

const due = (t: Harness, taskId: Id<"hakkenTasks">) => t.run((ctx) => ctx.db.patch(taskId, { nextCheckAt: Date.now() - 1 }));

async function round(t: Harness) {
  vi.useFakeTimers();
  await t.action(internal.hakkenWatcherActions.watchDue, {});
  await finishScheduled(t);
  vi.useRealTimers();
}

const emails = (t: Harness) => t.run((ctx) => ctx.db.query("outboxMessages").collect());

describe("the Watcher on AI answers", () => {
  test("tells its owner when ChatGPT's newest answer stops recommending them, once for each answer", async () => {
    const t = harness();
    const seeded = await seed(t);
    await answered(t, seeded, "2026-10-01", "RECOMMENDED");
    const taskId = await alert(t, seeded, { title: "Tell me if ChatGPT stops recommending us", answer: { prompt: PROMPT, engine: "chatgpt", watch: "notRecommended" } });

    // Recommended: judged, nobody told.
    await round(t);
    expect(await emails(t)).toEqual([]);

    // A newer answer only names them: told, by email and in the bell.
    await answered(t, seeded, "2026-10-04", "NAMED");
    await due(t, taskId);
    await round(t);
    const [email] = await emails(t);
    const rendered = await t.run((ctx) => renderOutboxRow(ctx, email));
    if (!("email" in rendered)) throw new Error(rendered.skip);
    expect(rendered.email.subject).toBe(`ChatGPT stopped recommending you for “${PROMPT}”`);
    expect(rendered.email.html).toContain(">Its newest answer, on Sunday 4 October, named ronins.test without recommending it.<");
    expect(rendered.email.pictures).toEqual([]);
    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification.href).toBe(`/app/sites/${seeded.siteId}/ai/mentions`);

    // The same answer again: nothing new to tell.
    await due(t, taskId);
    await round(t);
    expect(await emails(t)).toHaveLength(1);
  });
});

describe("the Watcher on Google rankings", () => {
  test("tells its owner when the website drops out of the top 3, and not while it is in it", async () => {
    const t = harness();
    const seeded = await seed(t);
    await checked(t, seeded, "2026-10-01", 2);
    const taskId = await alert(t, seeded, { title: "Tell me if ronins.test drops out of the top 3", ranking: { keyword: KEYWORD, op: "outOfTop", position: 3 } });
    await round(t);
    expect(await emails(t)).toEqual([]);

    // Not in the results at all, on the next check: out of every top.
    await checked(t, seeded, "2026-10-05", undefined);
    await due(t, taskId);
    await round(t);
    const [email] = await emails(t);
    expect(JSON.parse(email.payloadJson)).toMatchObject({ day: "2026-10-05", watch: { position: null } });
    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification).toMatchObject({ title: `ronins.test dropped out of Google’s top 3 for “${KEYWORD}”`, body: "When it was checked on Monday 5 October, it wasn't in Google’s results.", href: `/app/sites/${seeded.siteId}/keywords` });
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.lastJudgedDay).toBe("2026-10-05");
  });

  test("an alert with nothing checked yet waits for its next morning, rather than being due for ever", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await alert(t, seeded, { title: "Tell me if it drops", ranking: { keyword: KEYWORD, op: "outOfTop", position: 3 } });
    await round(t);
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.nextCheckAt).toBeGreaterThan(Date.now());
  });
});
