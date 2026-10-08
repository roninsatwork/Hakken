import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { readReferringDomains, referringDomainNamed, writeReferringDomainPart, type ReferringDomainFigures } from "./siteReferringDomainParts";
import { packColumn, packDays, unpackColumn, unpackDays } from "./utils/packedColumns";

/** The websites linking to a website, a check's list packed a record (core-data-normalisation-plan.md §6.3). */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("a packed column", () => {
  test("whole numbers come back as they were, a missing one missing; anything else is kept as its list", () => {
    expect(unpackColumn(packColumn([0, 59, 562_473, undefined, 100]))).toEqual([0, 59, 562_473, undefined, 100]);
    expect(typeof packColumn([1, 2, 3])).toBe("string");
    expect(packColumn([1.5, undefined])).toEqual([1.5, null]);
    expect(unpackColumn(packColumn([-3, 4]))).toEqual([-3, 4]);
  });

  test("days come back as they were; a day that does not convert back is kept as written", () => {
    expect(unpackDays(packDays(["2025-09-17", undefined, "1999-12-31"]))).toEqual(["2025-09-17", undefined, "1999-12-31"]);
    expect(packDays(["2026-02-30"])).toEqual(["2026-02-30"]);
  });
});

describe("a check's linking websites, a record", () => {
  async function seeded() {
    const t = harness();
    const ids = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const pull = async () => await ctx.db.insert("seoDataPulls", {
        operationId: "referring_domains_list", family: "Backlinks", mode: "LIVE", websiteId, taskArgsJson: "{}", status: "READY",
        tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: 1,
      } as never);
      return { websiteId, older: await pull(), newer: await pull() };
    });
    return { t, ...ids };
  }
  const figures = (domain: string, rank: number, extra: Partial<ReferringDomainFigures> = {}): ReferringDomainFigures =>
    ({ domain, rank, backlinks: rank * 2, status: "LIVE", ...extra });

  test("read strongest first, the newer list first among equals, every figure as filed", async () => {
    const { t, websiteId, older, newer } = await seeded();
    await t.run(async (ctx) => {
      await writeReferringDomainPart(ctx, { websiteId, pullId: older, day: "2026-09-01" }, [
        figures("tie-old.com", 50), figures("strong.com", 90, { firstSeen: "2024-01-02", spamScore: 3, referringPages: 7, nofollowPages: 0, brokenBacklinks: 1 }),
      ]);
      await writeReferringDomainPart(ctx, { websiteId, pullId: newer, day: "2026-09-08" }, [
        figures("tie-new-a.com", 50), figures("tie-new-b.com", 50), figures("gone.com", 10, { status: "LOST", lostDate: "2026-09-05" }),
      ]);
    });
    const rows = await t.run(async (ctx) => await readReferringDomains(ctx, websiteId));
    expect(rows.map((row) => row.domain)).toEqual(["strong.com", "tie-new-b.com", "tie-new-a.com", "tie-old.com", "gone.com"]);
    expect(rows[0]).toMatchObject({ rank: 90, backlinks: 180, firstSeen: "2024-01-02", spamScore: 3, referringPages: 7, nofollowPages: 0, brokenBacklinks: 1, status: "LIVE", day: "2026-09-01" });
    expect(rows[0]).not.toHaveProperty("lostDate");
    expect(rows[4]).toMatchObject({ status: "LOST", lostDate: "2026-09-05" });
    expect((await t.run(async (ctx) => await referringDomainNamed(ctx, websiteId, "gone.com")))?.pullId).toBe(newer);
    expect(await t.run(async (ctx) => await referringDomainNamed(ctx, websiteId, "nowhere.com"))).toBeNull();
  });
});
