import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { keywordStanding, readKeywordCopy } from "./siteKeywordCopy";
import { writeKeywordCopy } from "@/src/test/keywordCopies";

/**
 * A website's keyword copy as the Keywords pages read it: the latest check is never past the newest search the copy
 * holds (More Handles, 3 November 2026: a copy built while a list that kept only its last, empty page counted as the
 * latest check called all 6,355 searches "older", and the Keywords page listed none).
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("a website's keyword copy, read", () => {
  test("a latest check that holds no search of its own reads as the check its searches came from", async () => {
    const t = harness();
    const copy = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "shop.test", displayHost: "shop.test", firstSeenAt: Date.now() });
      await writeKeywordCopy(ctx, websiteId, 2826, [{ keyword: "door handles", position: 4, day: "2026-10-05" }, { keyword: "hinges", position: 9, day: "2026-10-05" }], "2026-10-15");
      return await readKeywordCopy(ctx, websiteId, 2826);
    });
    expect(copy?.latestCheckDay).toBe("2026-10-05");
    expect(copy?.rows.filter((row) => keywordStanding(row, copy.latestCheckDay) === "current")).toHaveLength(2);
  });

  test("a latest check with searches of its own stands, and a search not seen in it is older", async () => {
    const t = harness();
    const copy = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "shop.test", displayHost: "shop.test", firstSeenAt: Date.now() });
      await writeKeywordCopy(ctx, websiteId, 2826, [{ keyword: "door handles", position: 4, day: "2026-10-15" }, { keyword: "hinges", position: 9, day: "2026-10-05" }], "2026-10-15");
      return await readKeywordCopy(ctx, websiteId, 2826);
    });
    expect(copy?.latestCheckDay).toBe("2026-10-15");
    expect(copy?.rows.map((row) => keywordStanding(row, copy.latestCheckDay))).toEqual(["current", "older"]);
  });
});
