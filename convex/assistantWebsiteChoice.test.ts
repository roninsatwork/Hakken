import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { websiteFocusLine } from "./assistantKnowledge";

/**
 * Ask Hakken's "Answering for", viewing as a company
 * (docs/plans/active/keep-less-history-plan.md, 6.1, drawn and signed off
 * 2026-10-07): only the company's own websites and those it tracks are
 * listed; a new conversation keeps the website chosen, and only one its own
 * company holds; and the Assistant is told which website is meant.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function hold(t: Harness, companyId: Id<"companies">, host: string, relationship: "OWNED" | "TRACKED") {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship, createdAt: Date.now() });
  });
}

async function seed(t: Harness) {
  const ids = await t.run(async (ctx) => {
    const phg = await ctx.db.insert("companies", { name: "Period House Group", createdAt: Date.now() });
    const korda = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdmin = await ctx.db.insert("users", { email: "super@platform.test", role: "SUPER_ADMIN", impersonatingCompanyId: phg });
    return { phg, korda, superAdmin };
  });
  const own = await hold(t, ids.phg, "morehandles.co.uk", "OWNED");
  const tracked = await hold(t, ids.phg, "corston.com", "TRACKED");
  const kordas = await hold(t, ids.korda, "kordatackle.com", "OWNED");
  return { ...ids, own, tracked, kordas };
}

describe("Answering for, viewing as a company", () => {
  test("lists only the company being viewed: its own website and the one it tracks, never another company's", async () => {
    const t = harness();
    const { superAdmin, own, tracked } = await seed(t);
    const listed = await t.withIdentity({ subject: superAdmin }).query(api.sites.listPickerHolds, {});
    expect(listed.map((entry) => [entry.siteId, entry.host, entry.relationship]).sort()).toEqual([
      [own, "morehandles.co.uk", "OWNED"],
      [tracked, "corston.com", "TRACKED"],
    ].sort());
  });

  test("a new conversation keeps the website chosen, and only a website its own company holds", async () => {
    const t = harness();
    const { superAdmin, phg, tracked, kordas } = await seed(t);
    const asSuper = t.withIdentity({ subject: superAdmin });

    const threadId = await asSuper.mutation(api.chat.createThread, { forWebsiteId: tracked });
    const thread = await t.run(async (ctx) => await ctx.db.get(threadId));
    expect(thread).toMatchObject({ companyId: phg, companyWebsiteId: tracked });

    await expect(asSuper.mutation(api.chat.createThread, { forWebsiteId: kordas })).rejects.toThrow("not one this company holds");
    await expect(asSuper.mutation(api.chat.createThread, { forPlatform: true, forWebsiteId: tracked })).rejects.toThrow("not one this company holds");
  });

  test("the Assistant is told the website's name and whose it is, and only for the company that holds it", async () => {
    const t = harness();
    const { phg, korda, own, tracked } = await seed(t);
    expect(await t.query(internal.sites.holdFocusInternal, { holdId: own, companyId: phg })).toEqual({ host: "morehandles.co.uk", owned: true });
    expect(await t.query(internal.sites.holdFocusInternal, { holdId: tracked, companyId: phg })).toEqual({ host: "corston.com", owned: false });
    expect(await t.query(internal.sites.holdFocusInternal, { holdId: own, companyId: korda })).toBeNull();

    expect(websiteFocusLine({ host: "morehandles.co.uk", owned: true })).toBe(
      "morehandles.co.uk, one of the company's own websites. When the person does not name a website, this is the one they mean: "
        + "look up morehandles.co.uk. They can still ask about any other of the company's websites by name.",
    );
    expect(websiteFocusLine({ host: "corston.com", owned: false })).toContain("a website the company tracks");
  });
});
