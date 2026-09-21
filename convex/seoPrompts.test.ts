import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_PROMPTS_PER_WEBSITE } from "./seoPrompts";

/**
 * The questions we put to the AI engines.
 *
 * Each one is a paid call per engine per collection, so the ceiling and the
 * duplicate check are not tidiness — they are the meter. A screen-only limit is
 * a limit the next caller does not have.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super", email: `su-${Math.random()}@test.com`, role: "SUPER_ADMIN",
      createdAt: Date.now(),
    } as never));
  return t.withIdentity({ subject: userId });
}

async function seedHold(t: Harness, promptsPerWebsite?: number) {
  return await t.run(async (ctx) => {
    // The allowance rides on the plan, so a company with one is a company on a
    // plan that says so.
    const planId = promptsPerWebsite === undefined ? undefined : await ctx.db.insert("plans", {
      name: "Test tier",
      messageLimit: 1000,
      priceGBP: 0,
      seoPromptsPerWebsite: promptsPerWebsite,
      isActive: true,
      createdAt: Date.now(),
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Ronins Agency",
      ...(planId ? { planId } : {}),
      createdAt: Date.now(),
    });
    const websiteId = await ctx.db.insert("websites", {
      host: "a.com", displayHost: "a.com", firstSeenAt: Date.now(),
    });
    return await ctx.db.insert("companyWebsites", {
      companyId, websiteId, createdAt: Date.now(),
    });
  });
}

const firstPage = { page: 1, pageSize: 15 };

describe("adding a question", () => {
  test("is asked of every engine unless told otherwise", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId,
      prompt: "who is the best plumber in Leeds",
    });

    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId, ...firstPage,
    });
    expect(listed.data[0].engines.length).toBeGreaterThan(1);
    expect(listed.data[0].isActive).toBe(true);
  });

  test("keeps only the engines it recognises", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId,
      prompt: "who is the best plumber in Leeds",
      engines: ["chatgpt", "not-an-engine"],
    });

    // An engine we cannot call is a charge we cannot make. Dropping it is
    // better than sending a request to a path that does not exist.
    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId, ...firstPage,
    });
    expect(listed.data[0].engines).toEqual(["chatgpt"]);
  });

  test("treats two questions differing only in spacing as one", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "best plumber in Leeds",
    });

    await expect(admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "  Best   Plumber  in Leeds ",
    })).rejects.toThrow(/already being asked/);
  });

  test("refuses a question too short to mean anything", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    await expect(admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "plumber",
    })).rejects.toThrow(/as somebody would actually ask it/);
  });

  test("refuses one past the ceiling rather than silently dropping it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    for (let index = 0; index < DEFAULT_PROMPTS_PER_WEBSITE; index += 1) {
      await admin.mutation(api.seoPrompts.addTrackedPrompt, {
        companyWebsiteId, prompt: `question number ${index} about plumbers`,
      });
    }

    // Each question is a paid call per engine per collection. This is the meter.
    await expect(admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "one question too many about plumbers",
    })).rejects.toThrow(/at most/);
  });

  test("says how many more this website may add", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "best plumber in Leeds",
    });

    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId, ...firstPage,
    });
    expect(listed.remaining).toBe(DEFAULT_PROMPTS_PER_WEBSITE - 1);
  });
});

describe("switching one off", () => {
  test("keeps the question, so its answers keep what produced them", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    const promptId = await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "best plumber in Leeds",
    });
    await admin.mutation(api.seoPrompts.setTrackedPromptActive, {
      promptId, isActive: false,
    });

    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId, ...firstPage,
    });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].isActive).toBe(false);
  });
});

describe("tenancy", () => {
  test("an ordinary admin cannot add a question", async () => {
    const t = harness();
    const companyWebsiteId = await seedHold(t);
    const hold = await t.run(async (ctx) => await ctx.db.get(companyWebsiteId));

    const tenantAdmin = t.withIdentity({
      subject: await t.run(async (ctx) =>
        await ctx.db.insert("users", {
          name: "Admin", email: `a-${Math.random()}@test.com`, role: "ADMIN",
          companyId: hold!.companyId, createdAt: Date.now(),
        } as never)),
    });

    await expect(tenantAdmin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "best plumber in Leeds",
    })).rejects.toThrow();
  });
});

describe("where the allowance comes from", () => {
  test("a company with no plan gets the platform default", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t);

    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId, ...firstPage,
    });

    // Not zero. A company nobody has decided about should behave sensibly
    // rather than as though the feature were switched off.
    expect(listed.remaining).toBe(DEFAULT_PROMPTS_PER_WEBSITE);
  });

  test("the plan decides, not the platform", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t, 2);

    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "first question about plumbers",
    });
    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "second question about plumbers",
    });

    await expect(admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "third question about plumbers",
    })).rejects.toThrow(/at most 2/);
  });

  test("the allowance is per website, so a second site gets its own", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const first = await seedHold(t, 1);

    // A second website held by the same company, on the same plan.
    const second = await t.run(async (ctx) => {
      const hold = await ctx.db.get(first);
      const websiteId = await ctx.db.insert("websites", {
        host: "b.com", displayHost: "b.com", firstSeenAt: Date.now(),
      });
      return await ctx.db.insert("companyWebsites", {
        companyId: hold!.companyId, websiteId, createdAt: Date.now(),
      });
    });

    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId: first, prompt: "a question about plumbers",
    });

    // One site being full says nothing about another. A client with four sites
    // on a plan allowing ten may track forty questions in total.
    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId: second, ...firstPage,
    });
    expect(listed.remaining).toBe(1);
  });

  test("reports which plan set it, and whether it is the default", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t, 3);
    const hold = await t.run(async (ctx) => await ctx.db.get(companyWebsiteId));

    const allowance = await admin.query(api.seoPrompts.getPromptAllowance, {
      companyId: hold!.companyId,
    });

    expect(allowance.perWebsite).toBe(3);
    expect(allowance.isDefault).toBe(false);
    expect(allowance.planName).toBe("Test tier");
  });
});

describe("more questions than the plan now allows", () => {
  test("a downgrade is shown, not trimmed", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t, 3);

    for (const question of ["first question here", "second question here", "third question here"]) {
      await admin.mutation(api.seoPrompts.addTrackedPrompt, { companyWebsiteId, prompt: question });
    }

    // The client moves to a cheaper tier holding three questions.
    await t.run(async (ctx) => {
      const hold = await ctx.db.get(companyWebsiteId);
      const company = await ctx.db.get(hold!.companyId);
      await ctx.db.patch(company!.planId!, { seoPromptsPerWebsite: 1 });
    });

    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId, ...firstPage,
    });

    // Nothing is deleted and nothing stops being asked. Quietly stopping a
    // question shows up weeks later as a gap in a chart nobody can explain.
    expect(listed.data).toHaveLength(3);
    expect(listed.used).toBe(3);
    expect(listed.allowance).toBe(1);
    expect(listed.isOverAllowance).toBe(true);
    // And no room to add more, so the overage cannot grow.
    expect(listed.remaining).toBe(0);
  });

  test("a website inside its allowance says so plainly", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const companyWebsiteId = await seedHold(t, 5);

    await admin.mutation(api.seoPrompts.addTrackedPrompt, {
      companyWebsiteId, prompt: "one question here",
    });

    const listed = await admin.query(api.seoPrompts.listTrackedPrompts, {
      companyWebsiteId, ...firstPage,
    });
    expect(listed.isOverAllowance).toBe(false);
    expect(listed.remaining).toBe(4);
  });
});
