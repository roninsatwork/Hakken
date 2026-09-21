import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Ronins",
      createdAt: Date.now(),
    });

    const admin = await ctx.db.insert("users", {
      email: "admin@ronins.co.uk",
      name: "Company Admin",
      role: "ADMIN",
      companyId,
    });
    const regular = await ctx.db.insert("users", {
      email: "sam@ronins.co.uk",
      name: "Sam",
      role: "USER",
      companyId,
    });
    const quiet = await ctx.db.insert("users", {
      email: "quiet@ronins.co.uk",
      name: "Quiet Person",
      role: "USER",
      companyId,
    });
    // Runs the platform, not a client. Their activity is not client engagement.
    const superAdmin = await ctx.db.insert("users", {
      email: "anthony@ronins.co.uk",
      name: "Anthony",
      role: "SUPER_ADMIN",
      companyId,
    });

    return { companyId, admin, regular, quiet, superAdmin };
  });
}

describe("company engagement", () => {
  test("counts people, questions and sign-ins, and leaves platform staff out", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, admin, regular, superAdmin } = await seed(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      // Two sign-ins on the same day, and one the day before: three sign-ins
      // across two days.
      for (const timestamp of [now - 1000, now - 2000, now - DAY_MS]) {
        await ctx.db.insert("logins", {
          userId: regular,
          ip: "1.1.1.1",
          device: "Mac",
          location: "London",
          status: "SUCCESS",
          timestamp,
        });
      }
      // A failed attempt is not a sign-in.
      await ctx.db.insert("logins", {
        userId: regular,
        ip: "1.1.1.1",
        device: "Mac",
        location: "London",
        status: "FAILED",
        timestamp: now - 3000,
      });
      // The super admin is busy, and must not appear anywhere.
      await ctx.db.insert("logins", {
        userId: superAdmin,
        ip: "2.2.2.2",
        device: "Mac",
        location: "London",
        status: "SUCCESS",
        timestamp: now - 1000,
      });

      const threadId = await ctx.db.insert("threads", {
        userId: regular,
        companyId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "What did we agree last week?",
        createdAt: now - 500,
        companyId,
        userId: regular,
      });
      // The assistant's own reply is not a question someone asked.
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Here is what you agreed.",
        createdAt: now - 400,
        companyId,
        userId: regular,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "Thanks",
        createdAt: now - 300,
        companyId,
        userId: admin,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const report = await client.query(api.companyEngagement.getCompanyEngagement, { companyId });

    expect(report.people).toEqual({ total: 3, active: 2, quiet: 1 });
    expect(report.questions).toEqual({ asked: 2, byPeople: 2 });
    expect(report.signIns).toEqual({ total: 3, onDays: 2 });
    expect(report.everyone.map((person) => person.email)).not.toContain("anthony@ronins.co.uk");
  });

  /**
   * Sorting by heaviest user makes a billing leaderboard. Sorting by who has
   * gone quiet puts the people worth a call at the top, which is the whole
   * point of the screen.
   */
  test("puts the people who have gone quiet first", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, regular, superAdmin } = await seed(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("logins", {
        userId: regular,
        ip: "1.1.1.1",
        device: "Mac",
        location: "London",
        status: "SUCCESS",
        timestamp: now - 1000,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const report = await client.query(api.companyEngagement.getCompanyEngagement, { companyId });

    // Never seen at all sorts above someone seen a moment ago.
    expect(report.everyone[0].lastSeenAt).toBeUndefined();
    expect(report.everyone.at(-1)?.email).toBe("sam@ronins.co.uk");
  });

  /**
   * Someone who only ever launches agents is still using Hakken. Reading
   * sign-ins alone would file them as never seen.
   */
  test("counts an agent run as having been seen", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, regular, superAdmin } = await seed(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Report Agent",
        modelId: "default-agent-model",
        isActive: true,
        thinkingMode: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("agentRuns", {
        agentId,
        companyId,
        userId: regular,
        triggerType: "MANUAL",
        objective: "Produce the weekly report",
        status: "SUCCESS",
        startedAt: now - 5000,
        updatedAt: now - 4000,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const report = await client.query(api.companyEngagement.getCompanyEngagement, { companyId });

    const sam = report.everyone.find((person) => person.email === "sam@ronins.co.uk");
    expect(sam?.agentRuns).toBe(1);
    expect(sam?.lastSeenAt).toBeDefined();
    expect(report.people.active).toBe(1);
  });

  test("counts invitations by the three states one can actually be in", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, superAdmin } = await seed(t);

    await t.run(async (ctx) => {
      for (const status of ["PENDING", "ACCEPTED", "ACCEPTED", "REVOKED"] as const) {
        await ctx.db.insert("invitations", {
          email: `${status}@ronins.co.uk`,
          companyId,
          role: "USER",
          status,
          token: `token-${status}-${Math.random()}`,
          invitedAt: Date.now(),
        });
      }
    });

    const client = t.withIdentity({ subject: superAdmin });
    const report = await client.query(api.companyEngagement.getCompanyEngagement, { companyId });

    expect(report.invitations).toEqual({ pending: 1, accepted: 2, revoked: 1 });
  });

  test("only counts activity inside the window asked for", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, regular, superAdmin } = await seed(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("logins", {
        userId: regular,
        ip: "1.1.1.1",
        device: "Mac",
        location: "London",
        status: "SUCCESS",
        timestamp: now - 40 * DAY_MS,
      });
    });

    const client = t.withIdentity({ subject: superAdmin });
    const thirtyDays = await client.query(api.companyEngagement.getCompanyEngagement, { companyId });
    const ninetyDays = await client.query(api.companyEngagement.getCompanyEngagement, {
      companyId,
      daysBack: 90,
    });

    expect(thirtyDays.signIns.total).toBe(0);
    expect(thirtyDays.people.quiet).toBe(3);
    expect(ninetyDays.signIns.total).toBe(1);
    expect(ninetyDays.people.active).toBe(1);
  });

  /**
   * Each bar is the whole headcount: people who signed in, banded by how often,
   * and the rest shown as not having signed in. Leaving the non-users out would
   * make one active person look like full adoption.
   */
  test("bands each day's sign-ins per person, and accounts for everyone", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, regular, superAdmin } = await seed(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      // Two sign-ins today for one person; nobody else signed in at all.
      for (const timestamp of [now - 1000, now - 2000]) {
        await ctx.db.insert("logins", {
          userId: regular,
          ip: "1.1.1.1",
          device: "Mac",
          location: "London",
          status: "SUCCESS",
          timestamp,
        });
      }
    });

    const client = t.withIdentity({ subject: superAdmin });
    const report = await client.query(api.companyEngagement.getCompanyEngagement, { companyId });

    expect(report.daily).toHaveLength(30);
    const today = report.daily.at(-1)!;
    expect(today.twoSessions).toBe(1);
    expect(today.oneSession).toBe(0);
    expect(today.didNotSignIn).toBe(2);

    // A day with nothing still draws, with the whole headcount unseen.
    const quietDay = report.daily[0];
    expect(quietDay.didNotSignIn).toBe(3);
    expect(quietDay.oneSession).toBe(0);
  });

  test("collapses anything past five sign-ins into one band", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, regular, superAdmin } = await seed(t);
    const now = Date.now();

    await t.run(async (ctx) => {
      for (let index = 0; index < 9; index += 1) {
        await ctx.db.insert("logins", {
          userId: regular,
          ip: "1.1.1.1",
          device: "Mac",
          location: "London",
          status: "SUCCESS",
          timestamp: now - index * 1000,
        });
      }
    });

    const client = t.withIdentity({ subject: superAdmin });
    const report = await client.query(api.companyEngagement.getCompanyEngagement, { companyId });

    expect(report.daily.at(-1)?.fivePlusSessions).toBe(1);
  });

});
