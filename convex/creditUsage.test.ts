import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { chargeCreditsNow } from "./creditLedger";

/**
 * What the Usage screens read (docs/plans/active/usage-credits-plan.md,
 * step 3): a month's summary, its statement and what is booked — each the
 * signed-in company's own, and never a real cost.
 */

const modules = import.meta.glob("./**/*.*s");
const asCtx = (ctx: unknown) => ctx as MutationCtx;
const DAY = 86_400_000;

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (raw) => {
    const ctx = asCtx(raw);
    const now = Date.now();
    const acme = await ctx.db.insert("companies", { name: "Acme", createdAt: now });
    const rival = await ctx.db.insert("companies", { name: "Rival", createdAt: now });
    const anthony = await ctx.db.insert("users", { email: "anthony@example.com", name: "Anthony Basker", role: "ADMIN", companyId: acme });
    const outsider = await ctx.db.insert("users", { email: "rival@example.com", role: "ADMIN", companyId: rival });
    const own = await ctx.db.insert("websites", { host: "acme.com", displayHost: "acme.com", firstSeenAt: now });
    const competitor = await ctx.db.insert("websites", { host: "rival.com", displayHost: "rival.com", firstSeenAt: now });
    await ctx.db.insert("companyWebsites", { companyId: acme, websiteId: own, createdAt: now });
    await ctx.db.insert("companyWebsites", { companyId: acme, websiteId: competitor, relationship: "TRACKED", createdAt: now });

    // A rankings check on each website every day for three days, and a question asked.
    for (const daysAgo of [2, 1, 0]) {
      const at = now - daysAgo * DAY - 60_000;
      for (const websiteId of [own, competitor]) {
        await chargeCreditsNow(ctx, {
          companyId: acme, kind: "rankings", runKey: `cycle:${daysAgo}:${websiteId}`, how: "scheduled", websiteId, userId: anthony,
        }, 1000, { realCostUsd: 0.13 }, at);
      }
    }
    await chargeCreditsNow(ctx, { companyId: acme, kind: "assistant", runKey: "message:one", how: "byHand", userId: anthony }, 1, { realCostUsd: 0.02 }, now - 1000);
    return { anthony, outsider, own, competitor };
  });
}

describe("usage screens' reads", () => {
  // A month's figures read the days before today: kept mid-month, midday, so
  // "two days ago" is always this month (the way useMiddayUtc keeps a day whole).
  beforeEach(() => {
    const now = new Date();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a month's summary: what is left, used, by kind and by website, owned and tracked", async () => {
    const t = convexTest(schema, modules);
    const { anthony, own, competitor } = await seed(t);
    const summary = await t.withIdentity({ subject: anthony }).query(api.creditUsage.usageSummary, {});
    if (!summary) throw new Error("expected a summary");
    // Six rankings runs at 4 credits, and one question.
    expect(summary.used).toBe(25);
    expect(summary.plan).toMatchObject({ granted: 10_000, left: 9975 });
    expect(summary.kinds).toEqual([{ kind: "rankings", credits: 24, runs: 6 }, { kind: "assistant", credits: 1, runs: 1 }]);
    const byWebsite = new Map(summary.websites.map((row) => [row.website?.websiteId ?? "none", row]));
    expect(byWebsite.get(own)).toMatchObject({ credits: 12, runs: 3, website: { host: "acme.com", relationship: "owned" } });
    expect(byWebsite.get(competitor)).toMatchObject({ credits: 12, website: { relationship: "tracked" } });
    expect(byWebsite.get("none")).toMatchObject({ credits: 1, website: null });
    // Scheduled once a day, so the screen says how often; a question is "when you ask".
    expect(summary.lines.find((line) => line.website?.websiteId === own)?.everyDays).toBe(1);
    expect(summary.lines.find((line) => line.kind === "assistant")?.everyDays).toBeNull();
    expect(summary.forecast).not.toBeNull();
    // Nothing a customer reads carries what the work cost us.
    expect(JSON.stringify(summary)).not.toContain("realCost");
  });

  test("the statement: every line in order with the balance after it, and who and what", async () => {
    const t = convexTest(schema, modules);
    const { anthony } = await seed(t);
    const statement = await t.withIdentity({ subject: anthony }).query(api.creditUsage.usageStatement, {});
    if (!statement) throw new Error("expected a statement");
    expect(statement.opening).toBe(0);
    expect(statement.lines[0]).toMatchObject({ entry: "grant", in: 10_000, source: "plan" });
    expect(statement.lines.slice(1).every((line) => line.entry === "charge")).toBe(true);
    expect(statement.lines.at(-1)).toMatchObject({ kind: "assistant", out: 1, user: "Anthony Basker", how: "byHand" });
    expect(statement.closing).toBe(9975);
    const firstCharge = statement.lines[1];
    expect(firstCharge.from).toEqual([expect.objectContaining({ source: "plan" })]);
    expect(JSON.stringify(statement)).not.toContain("realCost");
  });

  test("coming up: each scheduled check's next run and what it will use", async () => {
    const t = convexTest(schema, modules);
    const { anthony, own } = await seed(t);
    const data = await t.withIdentity({ subject: anthony }).query(api.creditUsage.usageComingUp, {});
    if (!data) throw new Error("expected what is booked");
    expect(data.checks).toHaveLength(2);
    const check = data.checks.find((row) => row.website?.websiteId === own);
    expect(check).toMatchObject({ kind: "rankings", everyDays: 1, each: 4, setUpBy: "Anthony Basker" });
    expect(check!.nextAt).toBeGreaterThan(Date.now());
  });

  test("another company sees none of it", async () => {
    const t = convexTest(schema, modules);
    const { outsider } = await seed(t);
    const asRival = t.withIdentity({ subject: outsider });
    const summary = await asRival.query(api.creditUsage.usageSummary, {});
    expect(summary?.used).toBe(0);
    expect(summary?.websites).toEqual([]);
    const statement = await asRival.query(api.creditUsage.usageStatement, {});
    expect(statement?.lines).toEqual([]);
    expect((await asRival.query(api.creditUsage.usageComingUp, {}))?.checks).toEqual([]);
  });

  test("a month written wrongly, or not yet begun, is refused", async () => {
    const t = convexTest(schema, modules);
    const { anthony } = await seed(t);
    const asAnthony = t.withIdentity({ subject: anthony });
    await expect(asAnthony.query(api.creditUsage.usageSummary, { month: "October" })).rejects.toThrow();
    await expect(asAnthony.query(api.creditUsage.usageStatement, { month: "2999-01" })).rejects.toThrow();
  });
});

