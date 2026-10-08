import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import {
  anchorNamed,
  networksOf,
  packAnchorAndServerRows,
  readAnchors,
  readServers,
  removeGroupPartsBefore,
  writeAnchorPart,
  writeServerPart,
  type LinkGroupFigures,
} from "./siteLinkGroupParts";

/** A website's anchors and servers, a check's list packed a record (core-data-normalisation-plan.md §6.3). */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function seeded() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const pull = async (operationId: string) => await ctx.db.insert("seoDataPulls", {
      operationId, family: "Backlinks", mode: "LIVE", websiteId, taskArgsJson: "{}", status: "READY",
      tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: 1,
    } as never);
    return { websiteId, older: await pull("anchors_list"), newer: await pull("anchors_list") };
  });
  return { t, ...ids };
}

const figures = (backlinks: number, extra: Partial<LinkGroupFigures> = {}): LinkGroupFigures =>
  ({ rank: backlinks * 3, backlinks, referringDomains: backlinks - 1, status: "LIVE", ...extra });

describe("a check's anchors, a record", () => {
  test("read most links first, the newer list first among equals, every figure as filed", async () => {
    const { t, websiteId, older, newer } = await seeded();
    await t.run(async (ctx) => {
      await writeAnchorPart(ctx, { websiteId, pullId: older, day: "2026-09-01" }, [
        { anchor: "tie old", ...figures(5) },
        { anchor: "door handles", ...figures(40, { firstSeen: "2024-01-02", spamScore: 3 }) },
      ]);
      await writeAnchorPart(ctx, { websiteId, pullId: newer, day: "2026-09-08" }, [
        { anchor: "tie new a", ...figures(5) },
        { anchor: "", ...figures(5) },
        { anchor: "gone", ...figures(1, { status: "LOST", lostDate: "2026-09-05" }) },
      ]);
    });
    const rows = await t.run(async (ctx) => await readAnchors(ctx, websiteId));
    expect(rows.map((row) => row.anchor)).toEqual(["door handles", "", "tie new a", "tie old", "gone"]);
    expect(rows[0]).toMatchObject({ rank: 120, backlinks: 40, referringDomains: 39, firstSeen: "2024-01-02", spamScore: 3, status: "LIVE", day: "2026-09-01", pullId: older });
    expect(rows[0]).not.toHaveProperty("lostDate");
    expect(rows[4]).toMatchObject({ status: "LOST", lostDate: "2026-09-05", referringDomains: 0 });
    expect((await t.run(async (ctx) => await anchorNamed(ctx, websiteId, "")))?.pullId).toBe(newer);
    expect(await t.run(async (ctx) => await anchorNamed(ctx, websiteId, "nowhere"))).toBeNull();
  });

  test("an older list's records go, the newer's stay", async () => {
    const { t, websiteId, older, newer } = await seeded();
    await t.run(async (ctx) => {
      await writeAnchorPart(ctx, { websiteId, pullId: older, day: "2026-09-01" }, [{ anchor: "a", ...figures(2) }]);
      await writeAnchorPart(ctx, { websiteId, pullId: newer, day: "2026-09-08" }, [{ anchor: "b", ...figures(2) }]);
      expect(await removeGroupPartsBefore(ctx, "siteAnchorParts", websiteId, "2026-09-08", 20)).toBe(true);
    });
    expect((await t.run(async (ctx) => await readAnchors(ctx, websiteId))).map((row) => row.anchor)).toEqual(["b"]);
  });
});

describe("a check's servers, a record", () => {
  test("each with the network its address sits in, and the networks counted from them", async () => {
    const { t, websiteId, newer } = await seeded();
    await t.run(async (ctx) => {
      await writeServerPart(ctx, { websiteId, pullId: newer, day: "2026-09-08" }, [
        { ip: "1.2.3.4", ...figures(9) },
        { ip: "1.2.3.9", ...figures(3) },
        { ip: "5.6.7.8", ...figures(20) },
        { ip: "2001:db8::1", ...figures(1) },
      ]);
    });
    const servers = await t.run(async (ctx) => await readServers(ctx, websiteId));
    expect(servers.map((row) => [row.ip, row.subnet])).toEqual([
      ["5.6.7.8", "5.6.7.0/24"], ["1.2.3.4", "1.2.3.0/24"], ["1.2.3.9", "1.2.3.0/24"], ["2001:db8::1", "2001:db8::1"],
    ]);
    expect(networksOf(servers)).toEqual([
      { subnet: "5.6.7.0/24", ips: 1, backlinks: 20, referringDomains: 19 },
      { subnet: "1.2.3.0/24", ips: 2, backlinks: 12, referringDomains: 10 },
      { subnet: "2001:db8::1", ips: 1, backlinks: 1, referringDomains: 0 },
    ]);
  });
});

describe("dev's rows moved into records", () => {
  test("a check at a time, the oldest first, every figure kept and the rows removed", async () => {
    const { t, websiteId, older, newer } = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.insert("siteAnchors", { websiteId, pullId: older, day: "2026-09-01", anchor: "old", rank: 3, backlinks: 1, referringDomains: 1, status: "LIVE" });
      await ctx.db.insert("siteAnchors", { websiteId, pullId: newer, day: "2026-09-08", anchor: "new", rank: 6, backlinks: 2, referringDomains: 1, status: "NEW", firstSeen: "2026-09-07", spamScore: 4 });
      await ctx.db.insert("siteReferringIps", {
        websiteId, pullId: newer, day: "2026-09-08", ip: "1.2.3.4", subnet: "1.2.3.0/24", rank: 9, backlinks: 3, referringDomains: 2, status: "LIVE", searchText: "1.2.3.4 1.2.3.0/24",
      });
    });
    for (let step = 0; step < 10; step += 1) {
      if ((await t.run(async (ctx) => await packAnchorAndServerRows(ctx))).isDone) break;
    }
    const { anchors, servers, left } = await t.run(async (ctx) => ({
      anchors: await readAnchors(ctx, websiteId),
      servers: await readServers(ctx, websiteId),
      left: (await ctx.db.query("siteAnchors").collect()).length + (await ctx.db.query("siteReferringIps").collect()).length,
    }));
    expect(left).toBe(0);
    expect(anchors.map((row) => [row.anchor, row.pullId])).toEqual([["new", newer], ["old", older]]);
    expect(anchors[0]).toMatchObject({ status: "NEW", firstSeen: "2026-09-07", spamScore: 4, rank: 6 });
    expect(servers).toEqual([expect.objectContaining({ ip: "1.2.3.4", subnet: "1.2.3.0/24", rank: 9, backlinks: 3, referringDomains: 2 })]);
  });
});
