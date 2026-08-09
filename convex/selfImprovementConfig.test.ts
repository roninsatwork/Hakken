import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  SELF_IMPROVEMENT_CONFIG_KEY,
  SELF_IMPROVEMENT_DEFAULTS,
  parseSelfImprovementConfig,
} from "./selfImprovementConfig";

describe("Self-improvement config", () => {
  test("absent, malformed, and partial values all fall back per field", () => {
    expect(parseSelfImprovementConfig(undefined)).toEqual(SELF_IMPROVEMENT_DEFAULTS);
    expect(parseSelfImprovementConfig(null)).toEqual(SELF_IMPROVEMENT_DEFAULTS);
    expect(parseSelfImprovementConfig("")).toEqual(SELF_IMPROVEMENT_DEFAULTS);
    expect(parseSelfImprovementConfig("not json {")).toEqual(SELF_IMPROVEMENT_DEFAULTS);
    expect(parseSelfImprovementConfig("42")).toEqual(SELF_IMPROVEMENT_DEFAULTS);

    // A config written before a switch existed keeps every later default.
    expect(parseSelfImprovementConfig(JSON.stringify({ autoReflection: false }))).toEqual({
      ...SELF_IMPROVEMENT_DEFAULTS,
      autoReflection: false,
    });

    // Non-boolean garbage in one field must not poison the others.
    expect(
      parseSelfImprovementConfig(
        JSON.stringify({ autoApplyLowRisk: "yes", retrievalPriors: false })
      )
    ).toEqual({ ...SELF_IMPROVEMENT_DEFAULTS, retrievalPriors: false });
  });

  test("autonomy defaults off", () => {
    expect(SELF_IMPROVEMENT_DEFAULTS.autoApplyLowRisk).toBe(false);
  });

  test("update writes the row, audits the change, and read round-trips", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "root@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const asSuperAdmin = t.withIdentity({ subject: superAdminId });

    const before = await asSuperAdmin.query(api.selfImprovementConfig.getConfig, {});
    expect(before).toEqual(SELF_IMPROVEMENT_DEFAULTS);

    const next = {
      autoReflection: false,
      outcomeWeightedRanking: true,
      endUserFeedback: false,
      retrievalPriors: true,
      autoApplyLowRisk: false,
    };
    await asSuperAdmin.mutation(api.selfImprovementConfig.updateConfig, next);

    const after = await asSuperAdmin.query(api.selfImprovementConfig.getConfig, {});
    expect(after).toEqual(next);

    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", SELF_IMPROVEMENT_CONFIG_KEY))
        .first();
      expect(row).not.toBeNull();
      expect(JSON.parse(row!.value)).toEqual(next);

      const audits = await ctx.db.query("auditLogs").collect();
      const entry = audits.find((a) => a.entityId === SELF_IMPROVEMENT_CONFIG_KEY);
      expect(entry).toBeDefined();
      const metadata = JSON.parse(entry!.metadata as string);
      expect(metadata.previous.autoReflection).toBe(true);
      expect(metadata.next.autoReflection).toBe(false);
    });
  });
});
