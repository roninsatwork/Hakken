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
        costUsd: 1.25, startedAt: now - 1000, updatedAt: now,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.money.aiSpendUsd).toBe(1.25);
    expect(overview.daily.at(-1)!.spendUsd).toBeCloseTo(1.25);
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
        costUsd: 1.25, startedAt: now - 1000, updatedAt: now,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.money.aiSpendUsd).toBe(0);
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

  /**
   * A cap that is reached looks exactly like a cap that is not.
   *
   * Every read on this screen is bounded, and until 2026-08-26 a window busier
   * than its bound was shown as a quiet one: the numbers came back short and
   * nothing anywhere said so. The plan cap is the cheapest of them to exceed
   * honestly, so it is the one this proves against — the mechanism is shared by
   * all of them.
   */
  test("says so when a window was cut short by a cap, and still reports the figures", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdmin } = await seedPlatform(t);

    await t.run(async (ctx) => {
      // PLAN_LIMIT is 100; seedPlatform already made one.
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("plans", {
          name: `Filler ${index}`,
          messageLimit: 1,
          priceGBP: 0,
          isActive: false,
          createdAt: Date.now(),
        });
      }
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.coverage.complete).toBe(false);
    expect(overview.coverage.incomplete).toContain("plans");
    // Still answers. An incomplete month is worth more than a blank screen.
    expect(overview.clients.total).toBe(3);
  });

  test("says the window was complete when nothing hit a cap", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdmin } = await seedPlatform(t);

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.coverage.complete).toBe(true);
    expect(overview.coverage.incomplete).toEqual([]);
  });

  /**
   * Seats in use cannot exceed seats.
   *
   * Platform staff were removed from the seat total and left in the active
   * count, so their own messages and sign-ins inflated a fraction they were not
   * part of. A local database read "4 of 3 seats in use, 133% used".
   */
  test("counts only client seats as seats in use, never platform staff", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdmin, active, paying } = await seedPlatform(t);

    await t.run(async (ctx) => {
      const threadId = await ctx.db.insert("threads", {
        companyId: paying, userId: active, title: "A thread", createdAt: Date.now(), updatedAt: Date.now(),
      });
      // The sign-in loop already refuses a non-client. The message and run
      // loops did not, which is where platform staff actually leaked in.
      for (const userId of [superAdmin, active]) {
        await ctx.db.insert("messages", {
          threadId, role: "user", content: "A question", createdAt: Date.now() - DAY_MS,
          companyId: paying, userId,
        });
      }
    });

    const client = t.withIdentity({ subject: superAdmin });
    const overview = await client.query(api.platformOverview.getPlatformOverview, {});

    expect(overview.seats.active).toBe(1);
    expect(overview.seats.active).toBeLessThanOrEqual(overview.seats.total);
    expect(overview.seats.utilisation).toBeLessThanOrEqual(100);
  });
});
