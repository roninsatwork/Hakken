import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The host's own lists, and the move onto them.
 *
 * What is worth more than the rest here: **nothing these functions write
 * carries a company**. That is the whole rule of the new shape, and it is the
 * failure no screen would show, because a stray `companyId` looks like a
 * helpful denormalisation right up until one client's list is read off
 * another's.
 *
 * The tests of the move itself went with the move. `trackedPrompts` and
 * `trackedCompetitors` were emptied and dropped on 2026-09-22, and a migration
 * cannot be tested against a schema that no longer has the tables it read.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super person",
      email: `super-${Math.random()}@test.com`,
      role: "SUPER_ADMIN" as const,
      createdAt: Date.now(),
    }),
  );
  return t.withIdentity({ subject: userId });
}

async function seedWebsite(t: Harness, host: string) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() }),
  );
}

describe("a host's questions", () => {
  test("a question is stored against the website and names no company", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");

    const questionId = await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      websiteId: website,
      prompt: "who is the best branding agency in Leeds",
      engines: ["chatgpt", "claude"],
    });

    const row = await t.run(async (ctx) => await ctx.db.get(questionId));
    expect(row?.websiteId).toBe(website);
    expect(row?.engines).toEqual(["chatgpt", "claude"]);
    // The rule the whole shape rests on.
    expect(Object.keys(row ?? {})).not.toContain("companyId");
    expect(Object.keys(row ?? {})).not.toContain("companyWebsiteId");
  });

  test("the same question is refused twice for one host", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");

    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      websiteId: website, prompt: "who is the best branding agency in Leeds",
    });
    await expect(admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      websiteId: website, prompt: "Who Is The Best Branding Agency In Leeds",
    })).rejects.toThrow(/already asked/);
  });

  test("the list prices what a cycle actually buys, and a paused question is free", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");

    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      websiteId: website, prompt: "who is the best branding agency in Leeds",
      engines: ["chatgpt", "claude"],
    });
    const paused = await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      websiteId: website, prompt: "who should I use for a website rebuild",
      engines: ["chatgpt", "claude", "perplexity"],
    });

    let list = await admin.query(api.websiteCanonical.listWebsiteQuestions, {
      websiteId: website, page: 1, pageSize: 15,
    });
    expect(list.engineCalls).toBe(5);

    await admin.mutation(api.websiteCanonical.setWebsiteQuestionActive, {
      questionId: paused, isActive: false,
    });
    list = await admin.query(api.websiteCanonical.listWebsiteQuestions, {
      websiteId: website, page: 1, pageSize: 15,
    });
    expect(list.engineCalls).toBe(2);
    expect(list.totalCount).toBe(2);
  });
});

describe("a host's keywords", () => {
  test("a search is normalised so one phrase is one row", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");

    const keywordId = await admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      websiteId: website, keyword: "  Branding   Agency   Leeds ",
    });
    const row = await t.run(async (ctx) => await ctx.db.get(keywordId));
    expect(row?.keyword).toBe("branding agency leeds");

    await expect(admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      websiteId: website, keyword: "BRANDING AGENCY LEEDS",
    })).rejects.toThrow(/already tracked/);
  });

  test("the intent judgment is read from the shared store, and absent stays absent", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");

    await admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      websiteId: website, keyword: "branding agency leeds",
    });
    await admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      websiteId: website, keyword: "rebrand consultancy",
    });
    // Judged once for the platform, by phrase, not once per host.
    await t.run(async (ctx) => {
      await ctx.db.insert("seoKeywordIntents", {
        keyword: "branding agency leeds", intent: "BUYING", judgedAt: Date.now(),
      });
    });

    const list = await admin.query(api.websiteCanonical.listWebsiteKeywords, {
      websiteId: website, page: 1, pageSize: 15,
    });
    const byKeyword = Object.fromEntries(list.data.map((row) => [row.keyword, row.intent]));
    expect(byKeyword["branding agency leeds"]).toBe("BUYING");
    // An unjudged phrase says so rather than guessing at one.
    expect(byKeyword["rebrand consultancy"]).toBeNull();
    expect(list.activeCount).toBe(2);
  });
});
