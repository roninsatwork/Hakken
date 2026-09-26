import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Each company's own searches and questions (docs/plans/active/
 * private-tracking-lists-plan.md).
 *
 * What is worth more than the rest here: **a row names the hold it belongs
 * to, and a list is read and edited through that hold alone**. Two companies
 * owning one website each keep their own list, can each hold the same
 * question, and never see the other's. A competitor has no list of its own —
 * it is measured on the owned site's.
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

/** A company holding the website, as one of its own or as a competitor. */
async function seedHold(t: Harness, websiteId: Id<"websites">, name: string, relationship: "OWNED" | "TRACKED" = "OWNED") {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship, createdAt: Date.now() });
  });
}

describe("a company's questions", () => {
  test("a question belongs to the hold it was added for, and is audited with its company", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");
    const hold = await seedHold(t, website, "Ronins");

    const questionId = await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: hold,
      prompt: "who is the best branding agency in Leeds",
      engines: ["chatgpt", "claude"],
    });

    const row = await t.run(async (ctx) => await ctx.db.get(questionId));
    expect(row?.websiteId).toBe(website);
    expect(row?.companyWebsiteId).toBe(hold);
    expect(row?.engines).toEqual(["chatgpt", "claude"]);
    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const companyId = (await t.run(async (ctx) => await ctx.db.get(hold)))?.companyId;
    expect(JSON.parse(audit[0].metadata ?? "{}").companyId).toBe(companyId);
  });

  test("the same question is refused twice for one company, and allowed for another", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");
    const ours = await seedHold(t, website, "Ronins");
    const theirs = await seedHold(t, website, "Another agency");

    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: ours, prompt: "who is the best branding agency in Leeds",
    });
    await expect(admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: ours, prompt: "Who Is The Best Branding Agency In Leeds",
    })).rejects.toThrow(/already asked/);
    // Another company's list is its own: the same question is its to ask,
    // and still one purchase between them.
    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: theirs, prompt: "who is the best branding agency in Leeds",
    });

    const listed = async (hold: Id<"companyWebsites">) =>
      (await admin.query(api.websiteCanonical.listWebsiteQuestions, { companyWebsiteId: hold, page: 1, pageSize: 15 })).totalCount;
    expect(await listed(ours)).toBe(1);
    expect(await listed(theirs)).toBe(1);
  });

  test("a company sees only its own questions", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");
    const ours = await seedHold(t, website, "Ronins");
    const theirs = await seedHold(t, website, "Another agency");

    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, { companyWebsiteId: ours, prompt: "who is the best branding agency in Leeds" });
    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, { companyWebsiteId: theirs, prompt: "who builds the best websites in Leeds" });

    const list = await admin.query(api.websiteCanonical.listWebsiteQuestions, { companyWebsiteId: ours, page: 1, pageSize: 15 });
    expect(list.data.map((row) => row.prompt)).toEqual(["who is the best branding agency in Leeds"]);
  });

  test("a competitor has no list of its own", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "rival.co.uk");
    const watched = await seedHold(t, website, "Ronins", "TRACKED");

    await expect(admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: watched, prompt: "who is the best branding agency in Leeds",
    })).rejects.toThrow(/competitor/);
    await expect(admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      companyWebsiteId: watched, keyword: "branding agency leeds",
    })).rejects.toThrow(/competitor/);
  });

  test("the list prices what a cycle actually buys, and a paused question is free", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");
    const hold = await seedHold(t, website, "Ronins");

    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: hold, prompt: "who is the best branding agency in Leeds",
      engines: ["chatgpt", "claude"],
    });
    const paused = await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: hold, prompt: "who should I use for a website rebuild",
      engines: ["chatgpt", "claude", "perplexity"],
    });

    let list = await admin.query(api.websiteCanonical.listWebsiteQuestions, {
      companyWebsiteId: hold, page: 1, pageSize: 15,
    });
    expect(list.engineCalls).toBe(5);

    await admin.mutation(api.websiteCanonical.setWebsiteQuestionActive, {
      questionId: paused, isActive: false,
    });
    list = await admin.query(api.websiteCanonical.listWebsiteQuestions, {
      companyWebsiteId: hold, page: 1, pageSize: 15,
    });
    expect(list.engineCalls).toBe(2);
    expect(list.totalCount).toBe(2);
  });
});

describe("a company's searches", () => {
  test("a search is normalised so one phrase is one row on a list", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");
    const hold = await seedHold(t, website, "Ronins");

    const keywordId = await admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      companyWebsiteId: hold, keyword: "  Branding   Agency   Leeds ",
    });
    const row = await t.run(async (ctx) => await ctx.db.get(keywordId));
    expect(row?.keyword).toBe("branding agency leeds");
    expect(row?.companyWebsiteId).toBe(hold);

    await expect(admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      companyWebsiteId: hold, keyword: "BRANDING AGENCY LEEDS",
    })).rejects.toThrow(/already tracked/);
  });

  test("the intent judgment is read from the shared store, and absent stays absent", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const website = await seedWebsite(t, "ronins.co.uk");
    const hold = await seedHold(t, website, "Ronins");

    await admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      companyWebsiteId: hold, keyword: "branding agency leeds",
    });
    await admin.mutation(api.websiteCanonical.addWebsiteKeyword, {
      companyWebsiteId: hold, keyword: "rebrand consultancy",
    });
    // Judged once for the platform, by phrase, not once per host.
    await t.run(async (ctx) => {
      await ctx.db.insert("seoKeywordIntents", {
        keyword: "branding agency leeds", intent: "BUYING", judgedAt: Date.now(),
      });
    });

    const list = await admin.query(api.websiteCanonical.listWebsiteKeywords, {
      companyWebsiteId: hold, page: 1, pageSize: 15,
    });
    const byKeyword = Object.fromEntries(list.data.map((row) => [row.keyword, row.intent]));
    expect(byKeyword["branding agency leeds"]).toBe("BUYING");
    // An unjudged phrase says so rather than guessing at one.
    expect(byKeyword["rebrand consultancy"]).toBeNull();
    expect(list.activeCount).toBe(2);
  });
});
