import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { compareValues, v } from "convex/values";
import { describe, expect, test } from "vitest";

/**
 * The test database's shortcuts give Convex's own answers (src/test/convexTestTables.ts, 2026-11-02): a field equal
 * to a word or a number is found exactly where Convex's comparison finds it, 0 told from -0 and NaN as Convex orders
 * it, an index read finds what reading the whole table finds, and a field of several kinds takes and refuses the same
 * values, in the same words.
 */

const schema = defineSchema({
  things: defineTable({
    word: v.string(),
    count: v.number(),
    kind: v.optional(v.union(v.literal("a"), v.literal("b"), v.null(), v.string(), v.array(v.number()), v.object({ x: v.number() }))),
    place: v.optional(v.object({ town: v.string() })),
  }).index("by_word", ["word"]).index("by_count", ["count"]).index("by_word_count", ["word", "count"]).index("by_town", ["place.town"]),
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

  // Every read here is asked two ways: through the index, which goes straight to its records, and by reading the whole
  // table and picking them out, which goes through every record as the library always did.
  test("an index read asking for a value finds what reading the whole table finds, however records were added, changed or removed", async () => {
    const t = harness();
    type Ctx = Parameters<Parameters<typeof t.run>[0]>[0];
    const same = async (ctx: Ctx, word: string, count: number) => {
      const whole = await ctx.db.query("things").collect();
      const ids = (rows: Array<{ _id: string }>) => rows.map((row) => row._id);
      expect(ids(await ctx.db.query("things").withIndex("by_word", (q) => q.eq("word", word)).collect())).toEqual(ids(whole.filter((row) => row.word === word)));
      expect(ids(await ctx.db.query("things").withIndex("by_count", (q) => q.eq("count", count)).collect())).toEqual(ids(whole.filter((row) => Object.is(row.count, count))));
      expect(ids(await ctx.db.query("things").withIndex("by_word_count", (q) => q.eq("word", word).eq("count", count)).collect())).toEqual(ids(whole.filter((row) => row.word === word && Object.is(row.count, count))));
      // A value and a range together: the range still holds.
      expect(ids(await ctx.db.query("things").withIndex("by_word_count", (q) => q.eq("word", word).gt("count", count)).collect())).toEqual(
        ids(whole.filter((row) => row.word === word && compareValues(row.count, count) > 0).sort((a, b) => compareValues(a.count, b.count))),
      );
      // Newest first, in the index's own order.
      expect(ids(await ctx.db.query("things").withIndex("by_word", (q) => q.eq("word", word)).order("desc").collect())).toEqual(ids(whole.filter((row) => row.word === word).reverse()));
    };

    // Read before there's anything to find, so the buckets exist before anything is added.
    await t.run(async (ctx) => same(ctx, "a", 1));
    const ids = await t.run(async (ctx) => {
      const added = [await ctx.db.insert("things", { word: "a", count: 1 }), await ctx.db.insert("things", { word: "a", count: 2 }), await ctx.db.insert("things", { word: "b", count: 1 })];
      // Seen in the same transaction, before anything is saved.
      await same(ctx, "a", 1);
      await same(ctx, "b", 1);
      return added;
    });
    await t.run(async (ctx) => {
      await same(ctx, "a", 1);
      // A record moved to another value leaves the one it was in, as soon as it's written and once it's saved.
      await ctx.db.patch(ids[0], { word: "b" });
      await same(ctx, "a", 1);
      await same(ctx, "b", 1);
    });
    await t.run(async (ctx) => {
      await same(ctx, "a", 1);
      await same(ctx, "b", 1);
      await ctx.db.replace(ids[1], { word: "c", count: 3 });
      await ctx.db.delete(ids[2]);
      await same(ctx, "b", 1);
      await same(ctx, "c", 3);
    });
    await t.run(async (ctx) => {
      await same(ctx, "a", 1);
      await same(ctx, "b", 1);
      await same(ctx, "c", 3);
      // 0 and -0 are the same bucket and different values.
      await ctx.db.insert("things", { word: "z", count: 0 });
      await ctx.db.insert("things", { word: "z", count: -0 });
      await same(ctx, "z", 0);
      await same(ctx, "z", -0);
    });
    // A word that looks like a number, and two fields whose words would run together if only joined.
    await t.run(async (ctx) => {
      await ctx.db.insert("things", { word: "1", count: 1 });
      await ctx.db.insert("things", { word: "ab", count: 1 });
      await same(ctx, "1", 1);
      await same(ctx, "ab", 1);
    });
    // A field inside an object, and a record that hasn't got it.
    await t.run(async (ctx) => {
      const inTown = await ctx.db.insert("things", { word: "t", count: 0, place: { town: "Leeds" } });
      await ctx.db.insert("things", { word: "t", count: 0 });
      const towns = async () => (await ctx.db.query("things").withIndex("by_town", (q) => q.eq("place.town", "Leeds")).collect()).map((row) => row._id);
      expect(await towns()).toEqual([inTown]);
      await ctx.db.patch(inTown, { place: { town: "York" } });
      expect(await towns()).toEqual([]);
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("things").withIndex("by_town", (q) => q.eq("place.town", "York")).collect()).toHaveLength(1);
      // Asked for a value no word or number can be: read the slow way, with the same answer.
      expect(await ctx.db.query("things").withIndex("by_town", (q) => q.eq("place.town", undefined as never)).collect()).toEqual(
        (await ctx.db.query("things").collect()).filter((row) => row.place === undefined).sort((a, b) => compareValues(a._creationTime, b._creationTime)),
      );
    });
  });

  test("an index read sees nothing of a transaction that failed", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await ctx.db.insert("things", { word: "kept", count: 1 });
      expect(await ctx.db.query("things").withIndex("by_word", (q) => q.eq("word", "kept")).collect()).toHaveLength(1);
    });
    await expect(t.run(async (ctx) => {
      await ctx.db.insert("things", { word: "lost", count: 1 });
      const kept = await ctx.db.query("things").withIndex("by_word", (q) => q.eq("word", "kept")).first();
      await ctx.db.delete(kept!._id);
      throw new Error("no");
    })).rejects.toThrow("no");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("things").withIndex("by_word", (q) => q.eq("word", "lost")).collect()).toEqual([]);
      expect(await ctx.db.query("things").withIndex("by_word", (q) => q.eq("word", "kept")).collect()).toHaveLength(1);
    });
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
