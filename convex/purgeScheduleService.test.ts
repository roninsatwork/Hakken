import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import schema from "./schema";
import {
  calculateNextPurgeRun,
  calculatePurgeCutoffTimestamp,
  DEFAULT_PURGE_CONFIGS,
  getPurgeRetentionDays,
  listDisabledPurgePipelines,
  lowerSavedCostRowKeep,
  normalizePurgePipelineConfigForUpdate,
  parsePurgePipelineConfig,
  PURGE_PIPELINE_KEYS,
} from "./purgeScheduleService";

describe("purge schedule service", () => {
  test("rounds hourly schedules to the next UTC hour", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Hourly", 2, undefined, undefined, now)).toBe(
      Date.parse("2026-05-31T17:00:00.000Z")
    );
  });

  test("schedules daily runs today or tomorrow depending on the UTC hour", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Daily", 20, undefined, undefined, now)).toBe(
      Date.parse("2026-05-31T20:00:00.000Z")
    );
    expect(calculateNextPurgeRun("Daily", 2, undefined, undefined, now)).toBe(
      Date.parse("2026-06-01T02:00:00.000Z")
    );
  });

  test("schedules weekly runs for the next matching UTC weekday", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Weekly", 2, 0, undefined, now)).toBe(
      Date.parse("2026-06-07T02:00:00.000Z")
    );
  });

  test("schedules monthly runs for the next matching UTC day", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Monthly", 2, undefined, 15, now)).toBe(
      Date.parse("2026-06-15T02:00:00.000Z")
    );
  });

  /**
   * Owner decision, 2026-08-19 (maintenance plan M1.1): every pipeline ships
   * enabled. Shipping them off meant a fresh deployment kept phone
   * transcripts and mailbox records forever unless a human ticked fourteen
   * boxes. Naming every key here means adding a pipeline that ships disabled
   * fails this test and forces the decision into the open.
   */
  test("every pipeline ships enabled", () => {
    for (const key of PURGE_PIPELINE_KEYS) {
      expect(DEFAULT_PURGE_CONFIGS[key].enabled, key).toBe(true);
    }
  });

  test("lists the pipelines a stored config has switched off", () => {
    expect(listDisabledPurgePipelines(undefined)).toEqual([]);
    expect(listDisabledPurgePipelines("not-json")).toEqual([]);
    expect(
      listDisabledPurgePipelines(
        JSON.stringify({
          phoneCalls: { enabled: false },
          mailboxMessages: { enabled: false },
          agentLogs: { enabled: true },
        })
      )
    ).toEqual(["phoneCalls", "mailboxMessages"]);
  });

  test("parses missing or invalid pipeline config as defaults", () => {
    expect(parsePurgePipelineConfig(undefined)).toEqual(DEFAULT_PURGE_CONFIGS);
    expect(parsePurgePipelineConfig("not-json")).toEqual(DEFAULT_PURGE_CONFIGS);
  });

  test("merges saved pipeline config over defaults", () => {
    const config = parsePurgePipelineConfig(
      JSON.stringify({
        agentLogs: {
          enabled: true,
          retentionDays: 45,
          interval: "Daily",
          hourUtc: 3,
          nextRunTimestamp: 123,
        },
      })
    );

    expect(config.agentLogs.retentionDays).toBe(45);
    expect(config.agentLogs.enabled).toBe(true);
    expect(config.workflowLogs).toEqual(DEFAULT_PURGE_CONFIGS.workflowLogs);
  });

  test("normalizes enabled and disabled pipeline update configs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T16:37:52.000Z"));

    try {
      const normalized = normalizePurgePipelineConfigForUpdate(
        JSON.stringify({
          agentLogs: {
            enabled: true,
            retentionDays: 45,
            interval: "Daily",
            hourUtc: 20,
            nextRunTimestamp: 0,
          },
          workflowLogs: {
            enabled: false,
            retentionDays: 90,
            interval: "Daily",
            hourUtc: 2,
            nextRunTimestamp: 999,
          },
        })
      );

      expect(normalized.agentLogs?.nextRunTimestamp).toBe(
        Date.parse("2026-05-31T20:00:00.000Z")
      );
      expect(normalized.workflowLogs?.nextRunTimestamp).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects invalid pipeline update JSON", () => {
    expect(() => normalizePurgePipelineConfigForUpdate("not-json")).toThrow(
      "Invalid configuration JSON payload"
    );
  });

  test("rejects pipeline update retention below the minimum", () => {
    expect(() =>
      normalizePurgePipelineConfigForUpdate(
        JSON.stringify({
          agentLogs: {
            enabled: true,
            retentionDays: 29,
            interval: "Daily",
            hourUtc: 2,
            nextRunTimestamp: 0,
          },
        })
      )
    ).toThrow("Retention policy for category 'agentLogs' must be at least 30 days.");
  });

  test("gets purge retention from config with fallback behavior", () => {
    const config = JSON.stringify({
      auditLogs: {
        enabled: false,
        retentionDays: 120,
        interval: "Daily",
        hourUtc: 2,
        nextRunTimestamp: 0,
      },
    });

    expect(getPurgeRetentionDays({ configStr: config, pipelineKey: "auditLogs" })).toBe(120);
    expect(getPurgeRetentionDays({ configStr: "not-json", pipelineKey: "agentLogs" })).toBe(90);
    expect(
      getPurgeRetentionDays({
        configStr: JSON.stringify({ agentLogs: { retentionDays: 0 } }),
        pipelineKey: "agentLogs",
        fallbackDays: 75,
      })
    ).toBe(75);
  });

  test("calculates purge cutoff timestamp from retention days", () => {
    expect(calculatePurgeCutoffTimestamp(30, Date.parse("2026-06-01T12:00:00.000Z"))).toBe(
      Date.parse("2026-05-02T12:00:00.000Z")
    );
  });
});

describe("the cost rows' keep lowered to 90 days (core-data-normalisation-plan.md, N9)", () => {
  test("a saved 400 becomes 90, and a number someone chose stays", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const save = (agentTransactions: number) => t.run(async (ctx) => {
      for (const row of await ctx.db.query("systemConfig").collect()) await ctx.db.delete(row._id);
      // A copy: the parse hands back the defaults themselves when nothing is saved.
      const configs = structuredClone(parsePurgePipelineConfig(undefined));
      configs.agentTransactions = { ...configs.agentTransactions, retentionDays: agentTransactions };
      await ctx.db.insert("systemConfig", { key: "PURGE_PIPELINES_CONFIG", value: JSON.stringify(configs), updatedAt: 1 });
    });
    const kept = () => t.run(async (ctx) => parsePurgePipelineConfig((await ctx.db.query("systemConfig").first())?.value).agentTransactions.retentionDays);

    expect(DEFAULT_PURGE_CONFIGS.agentTransactions.retentionDays).toBe(90);
    await save(400);
    expect(await t.run(async (ctx) => lowerSavedCostRowKeep(ctx))).toMatchObject({ updated: 1 });
    expect(await kept()).toBe(90);
    await save(200);
    expect(await t.run(async (ctx) => lowerSavedCostRowKeep(ctx))).toMatchObject({ updated: 0 });
    expect(await kept()).toBe(200);
  });
});
