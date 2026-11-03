import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { compareValues, v } from "convex/values";
import { describe, expect, test } from "vitest";

/**
 * The test database's shortcuts give Convex's own answers (src/test/convexTestTables.ts, 2026-11-02): a field equal
 * to a word or a number is found exactly where Convex's comparison finds it, 0 told from -0 and NaN as Convex orders
 * it, and a field of several kinds takes and refuses the same values, in the same words.
 */

const schema = defineSchema({
  things: defineTable({
    word: v.string(),
    count: v.number(),
    kind: v.optional(v.union(v.literal("a"), v.literal("b"), v.null(), v.string(), v.array(v.number()), v.object({ x: v.number() }))),
  }).index("by_word", ["word"]).index("by_count", ["count"]),
});

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const WORDS = ["", "a", "A", "a ", "ab", "é", "é", "😀", "日本"];
const NUMBERS = [0, -0, 1, -1, 1.5, Number.MIN_VALUE, Infinity, -Infinity, NaN];

describe("the test database's shortcuts give Convex's own answers", () => {
  test("a field equal to a word or a number is found where Convex's comparison finds it", async () => {
    const t = harness();
    const found = await t.run(async (ctx) => {
      for (const [at, word] of WORDS.entries()) await ctx.db.insert("things", { word, count: NUMBERS[at % NUMBERS.length] });
      for (const count of NUMBERS) await ctx.db.insert("things", { word: "-", count });
      const words = [];
      for (const word of WORDS) {
        words.push((await ctx.db.query("things").withIndex("by_word", (q) => q.eq("word", word)).collect()).map((row) => row.word));
      }
      const counts = [];
      for (const count of NUMBERS) {
        counts.push((await ctx.db.query("things").withIndex("by_count", (q) => q.eq("count", count)).collect()).length);
      }
      return { words, counts };
    });
    const stored = [...WORDS.map((_, at) => NUMBERS[at % NUMBERS.length]), ...NUMBERS];
    expect(found.words).toEqual(WORDS.map((word) => WORDS.filter((other) => compareValues(other, word) === 0)));
    expect(found.counts).toEqual(NUMBERS.map((count) => stored.filter((other) => compareValues(other, count) === 0).length));
    // 0 and -0 apart, as Convex orders them: neither finds the other.
    expect(found.counts[0]).toBe(stored.filter((other) => Object.is(other, 0)).length);
  });

  test("a field of several kinds takes and refuses the same values, in the same words", async () => {
    const t = harness();
    const kinds = ["a", "b", "c", null, [1, 2], { x: 1 }];
    await t.run(async (ctx) => {
      for (const kind of kinds) await ctx.db.insert("things", { word: "-", count: 0, kind });
    });
    expect(await t.run(async (ctx) => (await ctx.db.query("things").collect()).map((row) => row.kind))).toEqual(kinds);
    for (const kind of [5, true, [1, "two"], { x: "one" }, { y: 1 }]) {
      await expect(t.run(async (ctx) => {
        await ctx.db.insert("things", { word: "-", count: 0, kind: kind as never });
      })).rejects.toThrow("Validator error: Expected one of literal, literal, null, string, array, object");
    }
  });
});
