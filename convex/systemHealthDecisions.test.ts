import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The Health page's three Decision lines (decisions-typesafe-plan.md, Phase E).
 */
function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

const DAY = 24 * 60 * 60 * 1000;

async function seedRuns(
  t: ReturnType<typeof setup>,
  runs: Array<{ key: string; outcome?: "ACTED" | "HANDED_TO_PERSON" | "RECORDED"; source?: "TYPESAFE" | "RULES"; certainty?: "SURE" | "NOT_SURE"; fallbackReason?: "MODE_OFF" | "NO_MODEL" | "PROVIDER_FAILED"; ageMs?: number }>,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (const [index, run] of runs.entries()) {
      await ctx.db.insert("decisionRuns", {
        decisionKey: run.key,
        subjectKind: "email",
        subjectId: `m-${index}`,
        answer: "spam",
        mode: "ACT",
        outcome: run.outcome ?? "RECORDED",
        source: run.source ?? "TYPESAFE",
        ...(run.certainty ? { certainty: run.certainty } : {}),
        ...(run.fallbackReason ? { fallbackReason: run.fallbackReason } : {}),
        costGBP: 0,
        createdAt: now - (run.ageMs ?? 0) - index,
      });
    }
  });
}

async function superAdmin(t: ReturnType<typeof setup>) {
  const id = await t.run(async (ctx) => ctx.db.insert("users", { email: "owner@ronins.co.uk", role: "SUPER_ADMIN" }));
  return t.withIdentity({ subject: id });
}

describe("health: decisions", () => {
  test("counts what was handed to a person and what fell back while switched on, in the window only", async () => {
    const t = setup();
    await seedRuns(t, [
      { key: "mailbox.message-kind", outcome: "HANDED_TO_PERSON" },
      { key: "mailbox.message-kind", outcome: "HANDED_TO_PERSON" },
      { key: "mailbox.urgent", outcome: "HANDED_TO_PERSON", ageMs: 9 * DAY }, // outside a 7-day window
      { key: "mailbox.urgent", source: "RULES", fallbackReason: "NO_MODEL" },
      { key: "mailbox.urgent", source: "RULES", fallbackReason: "PROVIDER_FAILED" },
      { key: "mailbox.urgent", source: "RULES", fallbackReason: "MODE_OFF" }, // off on purpose: not a fault
    ]);

    const health = await (await superAdmin(t)).query(api.systemHealth.getSystemHealthForAdmin, { daysBack: 7 });
    expect(health.operations.decisionsHandedToPerson).toMatchObject({ count: 2 });
    expect(health.operations.decisionsHandedToPerson.examples[0]).toMatchObject({
      label: "Is this email from a customer?",
      summary: "2 handed to a person",
      targetType: "decision",
    });
    expect(health.operations.decisionsOnSimpleRules).toMatchObject({ count: 2 });
    expect(health.operations.decisionsOnSimpleRules.examples[0]).toMatchObject({ label: "Is this email urgent?" });
    expect(health.operations.decisionsUnsure).toMatchObject({ count: 0 });
  });

  test("flags a Decision that is suddenly unsure, and stays quiet on too few runs", async () => {
    const t = setup();
    // Baseline: 40 sure runs three weeks ago. Window: 20 runs, 10 not sure.
    await seedRuns(t, [
      ...Array.from({ length: 40 }, () => ({ key: "mailbox.language", certainty: "SURE" as const, ageMs: 21 * DAY })),
      ...Array.from({ length: 10 }, () => ({ key: "mailbox.language", certainty: "SURE" as const })),
      ...Array.from({ length: 10 }, () => ({ key: "mailbox.language", certainty: "NOT_SURE" as const })),
      // Another Decision, unsure but on five runs: nothing to say yet.
      ...Array.from({ length: 5 }, () => ({ key: "mailbox.urgent", certainty: "NOT_SURE" as const })),
    ]);

    const health = await (await superAdmin(t)).query(api.systemHealth.getSystemHealthForAdmin, { daysBack: 7 });
    expect(health.operations.decisionsUnsure.count).toBe(1);
    expect(health.operations.decisionsUnsure.examples[0]).toMatchObject({ label: "Which language is this email in?" });
    expect(health.operations.decisionsUnsure.examples[0].summary).toMatch(/Not sure on 50% of 20 runs, against 17% over 30 days/);
  });
});
