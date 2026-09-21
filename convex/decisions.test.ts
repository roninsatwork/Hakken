import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { DECISIONS } from "./decisionRegistry";

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function seed(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Elsewhere", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "owner@ronins.co.uk", role: "SUPER_ADMIN" });
    const adminId = await ctx.db.insert("users", { email: "admin@comax.test", role: "ADMIN", companyId });
    const outsiderId = await ctx.db.insert("users", { email: "admin@elsewhere.test", role: "ADMIN", companyId: otherCompanyId });
    return { companyId, otherCompanyId, superAdminId, adminId, outsiderId };
  });
}

const asUser = (t: ReturnType<typeof setup>, userId: string) => t.withIdentity({ subject: userId });

describe("decisions screens: reading", () => {
  test("the platform list has one row per registered Decision, switched off, with this week's counts", async () => {
    const t = setup();
    const { companyId, superAdminId } = await seed(t);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (const [index, outcome] of (["ACTED", "HANDED_TO_PERSON", "RECORDED"] as const).entries()) {
        await ctx.db.insert("decisionRuns", {
          decisionKey: "mailbox.message-kind",
          companyId,
          subjectKind: "email",
          subjectId: `gmail-${index}`,
          answer: "spam",
          mode: "ACT",
          outcome,
          source: "TYPESAFE",
          costGBP: 0.5,
          createdAt: now - index,
        });
      }
      // Older than a week: not counted.
      await ctx.db.insert("decisionRuns", {
        decisionKey: "mailbox.message-kind",
        companyId,
        subjectKind: "email",
        subjectId: "gmail-old",
        answer: "spam",
        mode: "ACT",
        outcome: "ACTED",
        source: "TYPESAFE",
        costGBP: 9,
        createdAt: now - 8 * 24 * 60 * 60 * 1000,
      });
    });

    const result = await asUser(t, superAdminId).query(api.decisions.listForPlatform, {});
    expect(result.decisions.map((row) => row.key)).toEqual(DECISIONS.map((decision) => decision.key));
    expect(result.decisions.every((row) => row.platformMode === "OFF" && row.effectiveMode === "OFF")).toBe(true);
    const messageKind = result.decisions.find((row) => row.key === "mailbox.message-kind")!;
    expect(messageKind).toMatchObject({ ranThisWeek: 3, handedThisWeek: 1, isCapped: false });
    expect(messageKind.costThisWeekGBP).toBeCloseTo(1.5);
    expect(messageKind).not.toHaveProperty("companyMode");
    // No TypeSafe model is chosen, so every Decision would run its rule.
    expect(result.provider).toEqual({ usable: false, reason: "NO_MODEL" });
  });

  test("the company list shows the platform mode and the company's own, and only that company's runs", async () => {
    const t = setup();
    const { companyId, otherCompanyId, adminId, superAdminId } = await seed(t);
    await asUser(t, superAdminId).mutation(api.decisions.setPlatformMode, { decisionKey: "mailbox.urgent", mode: "ACT" });
    await asUser(t, adminId).mutation(api.decisions.setCompanyMode, { companyId, decisionKey: "mailbox.urgent", mode: "ASK_A_PERSON" });
    await t.run(async (ctx) => {
      await ctx.db.insert("decisionRuns", {
        decisionKey: "mailbox.urgent", companyId: otherCompanyId, subjectKind: "email", subjectId: "x",
        answer: "yes", mode: "ACT", outcome: "ACTED", source: "TYPESAFE", costGBP: 1, createdAt: Date.now(),
      });
    });

    const result = await asUser(t, adminId).query(api.decisions.listForCompany, { companyId });
    const urgent = result.decisions.find((row) => row.key === "mailbox.urgent")!;
    expect(urgent).toMatchObject({ platformMode: "ACT", companyMode: "ASK_A_PERSON", effectiveMode: "ASK_A_PERSON", ranThisWeek: 0 });
    const kind = result.decisions.find((row) => row.key === "mailbox.message-kind")!;
    expect(kind).toMatchObject({ platformMode: "OFF", effectiveMode: "OFF" });
    expect(kind).not.toHaveProperty("companyMode");
  });

  test("the detail carries the question, the answers with copy-able keys, and the last runs newest first", async () => {
    const t = setup();
    const { companyId, superAdminId } = await seed(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 3; index += 1) {
        await ctx.db.insert("decisionRuns", {
          decisionKey: "mailbox.message-kind", companyId, subjectKind: "email", subjectId: `gmail-${index}`,
          answer: "customer", probabilities: JSON.stringify({ customer: 0.9, spam: 0.1 }), certainty: "SURE",
          mode: "ACT", outcome: "RECORDED", source: "TYPESAFE", costGBP: 0.1, createdAt: 1000 + index,
        });
      }
    });

    const result = await asUser(t, superAdminId).query(api.decisions.detailForPlatform, { decisionKey: "mailbox.message-kind" });
    expect(result.decision).toMatchObject({ key: "mailbox.message-kind", copyKey: "mailboxMessageKind", stakes: "LOW", effectiveMode: "OFF" });
    expect(result.decision.answers).toEqual(["customer", "newsletter", "automated", "spam", "other"]);
    expect(JSON.parse(result.decision.question)).toMatchObject({ type: "choice" });
    expect(result.runs.map((run) => run.subjectId)).toEqual(["gmail-2", "gmail-1", "gmail-0"]);
    expect(result.runs[0]).toMatchObject({ certainty: "SURE", source: "TYPESAFE", answer: "customer" });
  });

  test("an unknown Decision is not found", async () => {
    const t = setup();
    const { superAdminId } = await seed(t);
    await expect(asUser(t, superAdminId).query(api.decisions.detailForPlatform, { decisionKey: "nowhere.nothing" }))
      .rejects.toThrow(/no Decision called/);
  });
});

describe("decisions screens: writing and access", () => {
  test("a super-admin sets the platform mode once per key, and the change is audited", async () => {
    const t = setup();
    const { superAdminId } = await seed(t);
    const as = asUser(t, superAdminId);
    await as.mutation(api.decisions.setPlatformMode, { decisionKey: "mailbox.message-kind", mode: "ACT" });
    await as.mutation(api.decisions.setPlatformMode, { decisionKey: "mailbox.message-kind", mode: "ACT" });
    await as.mutation(api.decisions.setPlatformMode, { decisionKey: "mailbox.message-kind", mode: "OFF" });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("decisionSettings").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ scope: "global", decisionKey: "mailbox.message-kind", mode: "OFF" });
      const audits = await ctx.db.query("auditLogs").collect();
      // OFF → ACT, then ACT → OFF; the repeated ACT changed nothing and wrote nothing.
      expect(audits.map((entry) => JSON.parse(entry.metadata ?? "{}"))).toEqual([
        { decision: "Is this email from a customer?", scope: "whole platform", changes: [{ field: "mode", from: "Off", to: "Acts on its own" }] },
        { decision: "Is this email from a customer?", scope: "whole platform", changes: [{ field: "mode", from: "Acts on its own", to: "Off" }] },
      ]);
      expect(audits.every((entry) => entry.actionType === "DECISION_MODE_CHANGED" && entry.actorId === superAdminId)).toBe(true);
    });
  });

  test("a company admin sets and clears its own mode; leaving `mode` out means follow the platform", async () => {
    const t = setup();
    const { companyId, adminId } = await seed(t);
    const as = asUser(t, adminId);
    await as.mutation(api.decisions.setCompanyMode, { companyId, decisionKey: "mailbox.urgent", mode: "ACT" });
    await as.mutation(api.decisions.setCompanyMode, { companyId, decisionKey: "mailbox.urgent" });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("decisionSettings").collect()).toHaveLength(0);
      const audits = await ctx.db.query("auditLogs").collect();
      expect(audits.map((entry) => JSON.parse(entry.metadata ?? "{}"))).toEqual([
        { decision: "Is this email urgent?", scope: "this company", changes: [{ field: "mode", from: "Follows the platform", to: "Acts on its own" }] },
        { decision: "Is this email urgent?", scope: "this company", changes: [{ field: "mode", from: "Acts on its own", to: "Follows the platform" }] },
      ]);
      expect(audits.every((entry) => entry.companyId === companyId)).toBe(true);
    });
  });

  test("a company admin cannot read or write another company's Decisions, nor the platform's", async () => {
    const t = setup();
    const { companyId, outsiderId, adminId } = await seed(t);
    const outsider = asUser(t, outsiderId);
    await expect(outsider.query(api.decisions.listForCompany, { companyId })).rejects.toThrow();
    await expect(outsider.query(api.decisions.detailForCompany, { companyId, decisionKey: "mailbox.urgent" })).rejects.toThrow();
    await expect(outsider.mutation(api.decisions.setCompanyMode, { companyId, decisionKey: "mailbox.urgent", mode: "ACT" })).rejects.toThrow();
    await expect(asUser(t, adminId).mutation(api.decisions.setPlatformMode, { decisionKey: "mailbox.urgent", mode: "ACT" })).rejects.toThrow();
    await expect(asUser(t, adminId).query(api.decisions.listForPlatform, {})).rejects.toThrow();
  });
});
