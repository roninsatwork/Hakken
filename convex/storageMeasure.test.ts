import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/** The whole database measured as Convex counts it (core-data-normalisation-plan.md, part 3). */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("measuring every table", () => {
  test("each table's rows and size as Convex counts them, largest first, with its keep rule and largest fields", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      for (let index = 0; index < 3; index += 1) await ctx.db.insert("companies", { name: `A company with a long name, number ${index}`, createdAt: 1 });
      await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    });

    const report = await t.action(internal.storageMeasure.measureEveryTable, { tables: ["websites", "companies"], fields: 2 });
    expect(report.tables.map((one) => [one.table, one.rows])).toEqual([["companies", 3], ["websites", 1]]);
    expect(report.tables.every((one) => one.keep !== "UNKNOWN" && one.bytes > 0)).toBe(true);
    // Its largest field first: the companies' names.
    expect(report.tables[0].fields.map((one) => one.field)[0]).toBe("name");
    expect(report.tables[0].fields).toHaveLength(2);
  });

  test("a table the schema does not have is refused", async () => {
    const t = harness();
    await expect(t.action(internal.storageMeasure.measureEveryTable, { tables: ["noSuchTable"] })).rejects.toThrow();
  });
});
