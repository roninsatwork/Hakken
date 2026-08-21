import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * Connections that are really checked (seven-gaps plan, phase 2): the
 * scheduled work leaves a mark, a failure is remembered with its reason
 * and cleared on the next success, and every job the platform schedules
 * appears on the screen — including the ones that have never run.
 */

describe("the job ledger", () => {
  test("records outcomes, counts consecutive failures, clears them on success", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.mutation(internal.jobLedger.recordJobOutcomeInternal, {
      job: "wiki-tending-sweep",
      ok: false,
      durationMs: 12,
      error: "The sweep threw.",
    });
    await t.mutation(internal.jobLedger.recordJobOutcomeInternal, {
      job: "wiki-tending-sweep",
      ok: false,
      durationMs: 9,
      error: "The sweep threw again.",
    });

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "super@jobs.test", role: "SUPER_ADMIN" })
    );
    const asSuper = t.withIdentity({ subject: superAdminId });

    const failing = (await asSuper.query(api.jobLedger.listJobRuns, {})).find(
      (row) => row.job === "wiki-tending-sweep"
    );
    expect(failing?.consecutiveFailures).toBe(2);
    expect(failing?.lastOk).toBe(false);
    expect(failing?.lastError).toBe("The sweep threw again.");
    expect(failing?.lastSucceededAt).toBeNull();

    // A good run clears the error text — a row must never wear yesterday's
    // failure beside today's success.
    await t.mutation(internal.jobLedger.recordJobOutcomeInternal, {
      job: "wiki-tending-sweep",
      ok: true,
      durationMs: 40,
    });
    const healed = (await asSuper.query(api.jobLedger.listJobRuns, {})).find(
      (row) => row.job === "wiki-tending-sweep"
    );
    expect(healed?.consecutiveFailures).toBe(0);
    expect(healed?.lastError).toBeNull();
    expect(healed?.lastSucceededAt).toBeGreaterThan(0);

    // Every scheduled job is listed, run or not — a job missing from the
    // ledger is the most important row on the screen.
    const rows = await asSuper.query(api.jobLedger.listJobRuns, {});
    expect(rows.length).toBeGreaterThan(20);
    const neverRan = rows.find((row) => row.job === "reset-billing-cycles");
    expect(neverRan?.lastRanAt).toBeNull();
    // Unrun jobs sort to the top, ahead of the healthy one.
    expect(rows[0].lastRanAt).toBeNull();

    // The wall: a company admin cannot read the platform's maintenance.
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", { name: "Jobs Corp", createdAt: Date.now() })
    );
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "admin@jobs.test", role: "ADMIN", companyId })
    );
    await expect(
      t.withIdentity({ subject: adminId }).query(api.jobLedger.listJobRuns, {})
    ).rejects.toThrow();
  });

  test("a real job's run through the ledger door leaves an honest success mark", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const before = Date.now();
    await t.action(internal.jobLedger.runJob, { job: "tool-idempotency-purge" });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("jobRuns")
        .withIndex("by_job", (q) => q.eq("job", "tool-idempotency-purge"))
        .unique()
    );
    expect(row?.lastOk).toBe(true);
    expect(row?.lastError).toBeUndefined();
    expect(row?.lastSucceededAt).toBeGreaterThanOrEqual(before);
    expect(row?.lastDurationMs).toBeGreaterThanOrEqual(0);
    expect(row?.consecutiveFailures).toBe(0);
  });

  test("a job late by more than three of its intervals reads overdue; a fresh or never-run one does not", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();
    await t.run(async (ctx) => {
      // The mailbox watcher runs every minute; ten minutes of silence is
      // more than three intervals and must be flagged.
      await ctx.db.insert("jobRuns", {
        job: "gmail-mailbox-watcher",
        lastRanAt: now - 10 * 60_000,
        lastOk: true,
        lastDurationMs: 5,
        lastSucceededAt: now - 10 * 60_000,
        consecutiveFailures: 0,
      });
      // One minute ago is inside the same job's window.
      await ctx.db.insert("jobRuns", {
        job: "workflow-schedule-dispatcher",
        lastRanAt: now - 60_000,
        lastOk: true,
        lastDurationMs: 5,
        lastSucceededAt: now - 60_000,
        consecutiveFailures: 0,
      });
    });
    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "super@overdue.test", role: "SUPER_ADMIN" })
    );
    const rows = await t
      .withIdentity({ subject: superAdminId })
      .query(api.jobLedger.listJobRuns, {});

    const stale = rows.find((row) => row.job === "gmail-mailbox-watcher");
    expect(stale?.isOverdue).toBe(true);
    const fresh = rows.find((row) => row.job === "workflow-schedule-dispatcher");
    expect(fresh?.isOverdue).toBe(false);
    // Never-run is its own state, not "overdue": the flag means "it used to
    // run and stopped", and a job with no runs sorts above both.
    const neverRan = rows.find((row) => row.job === "reset-billing-cycles");
    expect(neverRan?.isOverdue).toBe(false);
    expect(rows.indexOf(neverRan!)).toBeLessThan(rows.indexOf(stale!));
    // The overdue row still outranks the healthy one on the screen.
    expect(rows.indexOf(stale!)).toBeLessThan(rows.indexOf(fresh!));
  });

  test("an unknown job name is recorded as a failure rather than swallowed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.action(internal.jobLedger.runJob, { job: "no-such-job" });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("jobRuns")
        .withIndex("by_job", (q) => q.eq("job", "no-such-job"))
        .unique()
    );
    expect(row?.lastOk).toBe(false);
    expect(row?.lastError).toContain("Unknown job");
  });
});

describe("the connections list", () => {
  test("a mailbox whose poll failed reads as needing attention, with its reason", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();
    const superAdminId = await t.run(async (ctx) => {
      await ctx.db.insert("toolConnectors", {
        key: "google-gmail",
        name: "Gmail",
        description: "The connected inbox",
        category: "EMAIL",
        authMode: "OAUTH",
        tenantAvailability: "TENANT_RESTRICTED",
        installStatus: "INSTALLED",
        isActive: true,
        authConnectionStatus: "CONNECTED",
        lastProbeAt: now - 1000,
        lastProbeOk: true,
        lastProbeMessage: "The inbox answered.",
        lastPolledAt: now - 60_000,
        lastPollError: "Gmail refused the token.",
        createdAt: now,
        updatedAt: now,
      });
      return await ctx.db.insert("users", { email: "super@conn.test", role: "SUPER_ADMIN" });
    });

    const rows = await t
      .withIdentity({ subject: superAdminId })
      .query(api.connectionProbes.listConnections, {});
    const mailbox = rows.find((row) => row.kind === "MAILBOX");
    // The watcher runs sixty times an hour and the probe once, so the
    // watcher's failure outranks the probe's older success.
    expect(mailbox?.working).toBe(false);
    expect(mailbox?.detail).toBe("Gmail refused the token.");
    expect(mailbox?.lastHeardAt).toBe(now - 60_000);
  });
});
