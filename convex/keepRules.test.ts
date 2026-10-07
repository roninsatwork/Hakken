import fs from "fs";
import path from "path";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { KEEP_RULES } from "./keepRules";
import { DEFAULT_PURGE_CONFIGS, type PurgePipelineKey } from "./purgeScheduleService";
import schema from "./schema";
import { repoRoot } from "@/src/test/driftUtils";
import { useMiddayUtc } from "@/src/test/realTime";

/**
 * A keep rule for every table (keep-less-history-plan.md, part 4): a table
 * that grows says what clears it, so none grows unseen; and the two rules
 * agreed on 2026-10-07 — Hakken tasks' checks kept 90 days, emails 60 once
 * settled — clear what they say and nothing else.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const DAY_MS = 86_400_000;

describe("a keep rule for every table", () => {
  test("every table in the schema has one, and none is named that is not a table", () => {
    expect(Object.keys(KEEP_RULES).sort()).toEqual(Object.keys(schema.tables).sort());
  });

  test("every job named clears or thins with what is real: a purge pipeline, or a function in its file", () => {
    const unreal: string[] = [];
    for (const [table, rule] of Object.entries(KEEP_RULES)) {
      if (rule.keep !== "CLEARED" && rule.keep !== "THINNED") continue;
      const [file, name] = rule.by.split("/");
      if (file === "purges") {
        if (!(name in DEFAULT_PURGE_CONFIGS)) unreal.push(`${table}: ${rule.by}`);
        continue;
      }
      const source = path.join(repoRoot, "convex", `${file}.ts`);
      const declared = fs.existsSync(source) && new RegExp(`(function|const) ${name}\\b`).test(fs.readFileSync(source, "utf8"));
      if (!declared) unreal.push(`${table}: ${rule.by}`);
    }
    expect(unreal).toEqual([]);
  });

  test("what a purge pipeline clears is said to be kept that pipeline's days", () => {
    const differing: string[] = [];
    for (const [table, rule] of Object.entries(KEEP_RULES)) {
      if (rule.keep !== "CLEARED" || !rule.by.startsWith("purges/")) continue;
      const days = DEFAULT_PURGE_CONFIGS[rule.by.slice("purges/".length) as PurgePipelineKey].retentionDays;
      if (!rule.after.startsWith(`${days} days`)) differing.push(`${table}: "${rule.after}", the pipeline keeps ${days} days`);
    }
    expect(differing).toEqual([]);
  });

  test("a table kept for ever says why", () => {
    const silent = Object.entries(KEEP_RULES).filter(([, rule]) => rule.keep === "FOREVER" && rule.why.trim().length < 10).map(([table]) => table);
    expect(silent).toEqual([]);
  });
});

describe("the rules agreed on 2026-10-07", () => {
  beforeEach(() => useMiddayUtc());
  afterEach(() => vi.useRealTimers());

  async function purge(t: ReturnType<typeof harness>, pipelineKey: "hakkenTaskChecks" | "sentEmails") {
    const historyId = await t.run(async (ctx) => await ctx.db.insert("purgeHistory", {
      pipelineKey, triggerType: "SCHEDULED", status: "RUNNING", recordsPurged: 0, startedAt: Date.now(),
    }));
    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey, cutoffTimestamp: Date.now() - DEFAULT_PURGE_CONFIGS[pipelineKey].retentionDays * DAY_MS, historyId, deletedCount: 0,
    });
  }

  test("a Hakken task's checks are kept 90 days", async () => {
    const t = harness();
    const day = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
    await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Example", createdAt: now });
      const userId = await ctx.db.insert("users", { email: "jo@example.co.uk", role: "ADMIN", companyId });
      const websiteId = await ctx.db.insert("websites", { host: "example.co.uk", displayHost: "example.co.uk", firstSeenAt: now });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
      const taskId = await ctx.db.insert("hakkenTasks", {
        companyId, userId, kind: "ALERT", title: "Tell me if example.co.uk gets fewer than 10 visitors a day", measure: "visitors",
        target: { companyWebsiteId: holdId, website: "example.co.uk" }, condition: { op: "below", value: 10, days: 1 },
        timeOfDay: "09:00", timeZone: "Europe/London", channels: { bell: true, email: true, telegram: false }, state: "ON", createdAt: now, updatedAt: now,
      } as never);
      for (const daysAgo of [120, 91, 89, 1]) {
        await ctx.db.insert("hakkenTaskChecks", { taskId, companyId, day: day(daysAgo), met: true, streak: 1, alerted: false, checkedAt: now });
      }
    });

    await purge(t, "hakkenTaskChecks");

    const left = await t.run(async (ctx) => (await ctx.db.query("hakkenTaskChecks").collect()).map((row) => row.day));
    expect(left).toEqual([day(89), day(1)]);
  });

  test("an email is kept 60 days once sent, failed or skipped, and one still waiting whatever its age", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [status, daysAgo] of [["SENT", 61], ["FAILED", 75], ["SKIPPED", 90], ["WAITING", 70], ["SENT", 59]] as const) {
        const createdAt = now - daysAgo * DAY_MS;
        await ctx.db.insert("outboxMessages", {
          messageType: "TASK_ALERT", communication: "HAKKEN_TASKS", email: "jo@example.co.uk", language: "en", payloadJson: "{}",
          status, dueAt: createdAt, attempts: 1, idempotencyKey: `${status}:${daysAgo}`, createdAt, updatedAt: createdAt,
        });
      }
    });

    await purge(t, "sentEmails");

    const left = await t.run(async (ctx) => (await ctx.db.query("outboxMessages").collect()).map((row) => row.idempotencyKey).sort());
    expect(left).toEqual(["SENT:59", "WAITING:70"]);
  });
});
