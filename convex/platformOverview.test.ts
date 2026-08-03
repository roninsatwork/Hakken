import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedPlatform(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const planId = await ctx.db.insert("plans", {
      name: "Studio",
      messageLimit: 500,
      priceGBP: 200,
      isActive: true,
      createdAt: Date.now(),
    });

    const paying = await ctx.db.insert("companies", { name: "Paying Client", createdAt: Date.now(), planId });
    const unpaid = await ctx.db.insert("companies", { name: "No Plan Client", createdAt: Date.now() });
    const empty = await ctx.db.insert("companies", { name: "Empty Client", createdAt: Date.now(), planId });

    const active = await ctx.db.insert("users", {
      email: "active@client.com", name: "Active", role: "USER", companyId: paying,
    });
    const quiet = await ctx.db.insert("users", {
      email: "quiet@client.com", name: "Quiet", role: "USER", companyId: paying,
    });
    const unpaidUser = await ctx.db.insert("users", {
      email: "someone@noplan.com", name: "Someone", role: "USER", companyId: unpaid,
    });
    const superAdmin = await ctx.db.insert("users", {
      email: "anthony@ronins.co.uk", name: "Anthony", role: "SUPER_ADMIN",
    });

    return { planId, paying, unpaid, empty, active, quiet, unpaidUser, superAdmin };
  });
}

describe("platform overview", () => {
  /**
   * The figures this replaces came from a rollup only ever incremented on
   * create — so anything seeded, imported, or older than the counter was
   * invisible to it, which is why the dashboard said nought companies while
   * companies plainly existed.
   */
  test("counts what is actually there, rather than what a counter accumulated", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdmin } = await seedPlatform(t);

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.clients.total).toBe(3);
    // Two companies on a £200 plan.
    expect(overview.money.projectedMrrGBP).toBe(400);
    expect(overview.todo.companiesWithNoPlan).toBe(1);
  });

  test("leaves platform staff out of seats and engagement", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdmin } = await seedPlatform(t);

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    // Three client users; the super admin belongs to no client and is not a seat.
    expect(overview.seats.total).toBe(3);
    expect(overview.seats.active).toBe(0);
  });

  /**
   * Unused and unhealthy are different problems: one has nobody in it, the
   * other has people who have stopped.
   */
  test("separates a client nobody uses from one whose people have gone quiet", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { paying, active, superAdmin } = await seedPlatform(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("logins", {
        userId: active, ip: "1.1.1.1", device: "Mac", location: "London",
        status: "SUCCESS", timestamp: now - 1000,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    const payingRow = overview.portfolio.find((row) => row.companyId === paying);
    expect(payingRow?.state).toBe("NEEDS_ATTENTION");
    expect(payingRow?.quiet).toBe(1);
    expect(payingRow?.activeRecently).toBe(1);

    // Only the company with nobody in it is unused. The one whose single
    // person has gone quiet needs attention — a different problem.
    expect(overview.clients.unused).toBe(1);
    expect(overview.clients.needsAttention).toBe(2);
    // Worst first: the reason to open this screen sorts to the top.
    expect(overview.portfolio[0].state).toBe("NEEDS_ATTENTION");
  });

  /**
   * Every message is an AI call; only the ones a person typed are questions.
   * The gap between the two is automation running unasked.
   */
  test("separates what people asked from everything the AI did", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { paying, active, superAdmin } = await seedPlatform(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      const threadId = await ctx.db.insert("threads", {
        userId: active, companyId: paying, createdAt: now, updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId, role: "user", content: "A question", createdAt: now - 500,
        companyId: paying, userId: active,
      });
      await ctx.db.insert("messages", {
        threadId, role: "assistant", content: "An answer", createdAt: now - 400,
        companyId: paying, userId: active,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    const today = overview.daily.at(-1)!;
    expect(today.questions).toBe(1);
    expect(today.aiCalls).toBe(2);
    expect(overview.seats.active).toBe(1);
  });

  test("states AI spend against revenue, so the margin is readable", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdmin } = await seedPlatform(t);

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    // £400 of revenue and no spend yet: nought per cent, not an absent figure.
    expect(overview.money.spendAsPercentOfRevenue).toBe(0);
  });

  /**
   * An agent left to run on its own writes no message, so spend read from
   * messages alone showed nothing however much the agent cost — a research
   * agent could run all day against a dashboard reporting no spend.
   */
  test("charges the platform for agents that ran with nobody watching", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { paying, active, superAdmin } = await seedPlatform(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Research Agent", modelId: "model-test", thinkingMode: false,
        isActive: true, createdAt: now, updatedAt: now,
      });
      await ctx.db.insert("agentRuns", {
        agentId, triggerType: "SCHEDULE", objective: "Fill in the group",
        status: "SUCCESS", companyId: paying, userId: active,
        costGBP: 1.25, startedAt: now - 1000, updatedAt: now,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.money.aiSpendGBP).toBe(1.25);
    expect(overview.daily.at(-1)!.spendGBP).toBeCloseTo(1.25);
  });

  /**
   * A run that answered someone in a conversation already wrote its tokens onto
   * the reply, so counting the run as well would bill that work twice.
   */
  test("does not charge a conversation twice for the run behind it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { paying, active, superAdmin } = await seedPlatform(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Chat Agent", modelId: "model-test", thinkingMode: false,
        isActive: true, createdAt: now, updatedAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId: active, companyId: paying, createdAt: now, updatedAt: now,
      });
      await ctx.db.insert("agentRuns", {
        agentId, threadId, triggerType: "CHAT", objective: "Answer them",
        status: "SUCCESS", companyId: paying, userId: active,
        costGBP: 1.25, startedAt: now - 1000, updatedAt: now,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.money.aiSpendGBP).toBe(0);
  });

  test("bands sign-ins per day against the whole seat count", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { active, superAdmin } = await seedPlatform(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      for (const timestamp of [now - 1000, now - 2000]) {
        await ctx.db.insert("logins", {
          userId: active, ip: "1.1.1.1", device: "Mac", location: "London",
          status: "SUCCESS", timestamp,
        });
      }
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    const today = overview.signInBands.at(-1)!;
    expect(today.twoSessions).toBe(1);
    expect(today.didNotSignIn).toBe(2);
    expect(overview.signInBands).toHaveLength(30);
  });

  test("counts invitations nobody has accepted", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { paying, superAdmin } = await seedPlatform(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("invitations", {
        email: "waiting@client.com", companyId: paying, role: "USER",
        status: "PENDING", token: "token-1", invitedAt: Date.now(),
      });
      await ctx.db.insert("invitations", {
        email: "joined@client.com", companyId: paying, role: "USER",
        status: "ACCEPTED", token: "token-2", invitedAt: Date.now(),
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.todo.pendingInvitations).toBe(1);
  });

  test("ignores activity older than the window", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { active, superAdmin } = await seedPlatform(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("logins", {
        userId: active, ip: "1.1.1.1", device: "Mac", location: "London",
        status: "SUCCESS", timestamp: Date.now() - 45 * DAY_MS,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.seats.active).toBe(0);
  });
});
