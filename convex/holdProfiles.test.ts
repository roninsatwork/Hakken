import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { answersSeenBy, holdNamedIn } from "./holdProfiles";
import { findBrandMentions } from "./utils/websiteBrands";

/**
 * What a company calls each of its websites, and what it says its own
 * business is (docs/plans/active/company-level-website-facts-plan.md). Until
 * 2026-09-28 both sat on the shared website record, set once for every
 * company watching the host; these tests hold that they are now each
 * company's own — set, read, counted and judged by it alone.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seedCompany(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedUser(t: Harness, role: "ADMIN" | "SUPER_ADMIN", companyId?: Id<"companies">) {
  return await t.run(async (ctx) => await ctx.db.insert("users", {
    name: `${role} person`,
    email: `${role.toLowerCase()}-${Math.random()}@test.com`,
    role,
    ...(companyId ? { companyId } : {}),
    createdAt: Date.now(),
  }));
}

async function superAdmin(t: Harness) {
  return t.withIdentity({ subject: await seedUser(t, "SUPER_ADMIN") });
}

const namesOf = (profile: { brandNames: Array<{ name: string }> } | null) => profile?.brandNames.map((entry) => entry.name) ?? [];

describe("A company's names for a website", () => {
  test("two companies holding one host keep their own names", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "shared.com" });
    const acme = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Acme Ltd"), url: "shared.com" });

    await admin.mutation(api.holdProfiles.setHoldBrandNames, {
      companyWebsiteId: ronins,
      names: [{ name: "Shared Co", isPrimary: true }, { name: "Shared Group" }],
    });

    // One host, one record — and the names are Ronins' alone. Acme, which
    // added the host too, starts with none: another company's are never handed across.
    expect(await t.run(async (ctx) => (await ctx.db.query("websites").collect()).length)).toBe(1);
    expect(namesOf(await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: ronins }))).toEqual(["Shared Co", "Shared Group"]);
    expect(namesOf(await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: acme }))).toEqual([]);
  });

  test("a misspelling stays a misspelling", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "ronins.co.uk" });

    await admin.mutation(api.holdProfiles.setHoldBrandNames, {
      companyWebsiteId: site,
      names: [{ name: "Ronins", isPrimary: true }, { name: "Ronnins", kind: "MISSPELLING" }],
    });

    // The shared editor this replaced turned every misspelling back into a name on save.
    const profile = await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: site });
    expect(profile?.brandNames.map((entry) => [entry.name, entry.kind, entry.isPrimary])).toEqual([
      ["Ronins", "NAME", true],
      ["Ronnins", "MISSPELLING", false],
    ]);
  });

  test("refuses a sixth name rather than silently dropping it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "a.com" });

    await expect(admin.mutation(api.holdProfiles.setHoldBrandNames, {
      companyWebsiteId: site,
      names: ["one", "two", "three", "four", "five", "six"].map((name) => ({ name: `Name ${name}` })),
    })).rejects.toThrow(/at most 5/);
  });

  test("an empty list clears the names", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "a.com" });

    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: site, names: [{ name: "First Name" }] });
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: site, names: [] });

    const row = await t.run(async (ctx) => await ctx.db.query("holdProfiles").first());
    expect(row?.brandNames).toEqual([]);
    // Off the answer reader's list too, which finds named websites by this flag.
    expect(row?.hasBrandNames).toBe(false);
  });

  test("records both sides of a change", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "a.com" });

    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: site, names: [{ name: "First Name" }, { name: "Second Name" }] });
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: site, names: [{ name: "First Name" }] });

    const entries = await t.run(async (ctx) => await ctx.db.query("auditLogs")
      .filter((q) => q.eq(q.field("actionType"), "SET_HOLD_BRAND_NAMES"))
      .collect());
    const last = JSON.parse(entries[entries.length - 1].metadata ?? "{}") as { before: string[]; after: string[] };
    expect(last.before).toEqual(["First Name", "Second Name"]);
    expect(last.after).toEqual(["First Name"]);
  });

  test("an ordinary admin cannot set them", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "a.com" });
    const tenantAdmin = t.withIdentity({ subject: await seedUser(t, "ADMIN", company) });

    await expect(tenantAdmin.mutation(api.holdProfiles.setHoldBrandNames, {
      companyWebsiteId: site,
      names: [{ name: "Their Own Name" }],
    })).rejects.toThrow();
  });

  test("go with the website when the company stops holding it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "a.com" });
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: site, names: [{ name: "A Name" }] });

    await admin.mutation(api.websites.removeCompanyWebsite, { id: site });

    expect(await t.run(async (ctx) => await ctx.db.query("holdProfiles").collect())).toHaveLength(0);
  });
});

describe("A company's business profile", () => {
  test("is kept for its own websites and refused for a competitor", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const own = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "ronins.co.uk" });
    const rival = await admin.mutation(api.websiteAttachments.addTrackedCompetitor, { companyWebsiteId: own, url: "rival.com" });

    await admin.mutation(api.holdProfiles.setHoldBusinessProfile, {
      companyWebsiteId: own, sector: "  Digital   agency ", marketLabel: "United Kingdom", description: null,
    });
    const profile = await admin.query(api.holdProfiles.getHoldProfile, { companyWebsiteId: own });
    expect([profile?.sector, profile?.marketLabel, profile?.businessDescription]).toEqual(["Digital agency", "United Kingdom", null]);

    await expect(admin.mutation(api.holdProfiles.setHoldBusinessProfile, {
      companyWebsiteId: rival, sector: "Plumbing", marketLabel: null, description: null,
    })).rejects.toThrow(/not this company's to describe/);
  });

  test("is what a judgment for the company reads — its own, or its site's for a competitor, never another company's", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "shared.com" });
    const acme = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Acme Ltd"), url: "shared.com" });
    const rival = await admin.mutation(api.websiteAttachments.addTrackedCompetitor, { companyWebsiteId: ronins, url: "rival.com" });

    await admin.mutation(api.holdProfiles.setHoldBusinessProfile, { companyWebsiteId: ronins, sector: "Digital agency", marketLabel: null, description: null });
    await admin.mutation(api.holdProfiles.setHoldBusinessProfile, { companyWebsiteId: acme, sector: "Plumbing", marketLabel: null, description: null });
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: ronins, names: [{ name: "Ronins" }] });

    const forRonins = await t.query(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: ronins });
    const forAcme = await t.query(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: acme });
    const forRival = await t.query(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: rival });
    expect([forRonins?.sector, forRonins?.names]).toEqual(["Digital agency", ["Ronins"]]);
    expect([forAcme?.sector, forAcme?.names]).toEqual(["Plumbing", []]);
    // A competitor Ronins watches, with no profile of its own, is judged in Ronins' trade.
    expect(forRival?.sector).toBe("Digital agency");

    // A purchase shared by both is judged once per way of describing it.
    const websiteId = await t.run(async (ctx) => (await ctx.db.get(ronins))!.websiteId);
    const groups = await t.query(internal.holdProfiles.describeWebsiteHoldsForJudging, { websiteId });
    expect(groups.map((group) => group.business.sector).sort()).toEqual(["Digital agency", "Plumbing"]);
  });
});

describe("Reading AI answers for every company's names at once", () => {
  test("every name any company holds is read, a correct name winning over a misspelling", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Ronins Agency"), url: "acme.com" });
    const other = await admin.mutation(api.websites.addCompanyWebsite, { companyId: await seedCompany(t, "Other Ltd"), url: "acme.com" });

    await admin.mutation(api.holdProfiles.setHoldBrandNames, {
      companyWebsiteId: ronins, names: [{ name: "Acme", isPrimary: true }, { name: "Akme", kind: "MISSPELLING" }],
    });
    await admin.mutation(api.holdProfiles.setHoldBrandNames, { companyWebsiteId: other, names: [{ name: "Akme" }] });

    const named = await t.query(internal.holdProfiles.listNamedWebsitesInternal, { limit: 100 });
    expect(named).toHaveLength(1);
    expect(named[0].brandNames.map((entry) => [entry.name, entry.kind]).sort()).toEqual([["Acme", "NAME"], ["Akme", "NAME"]]);
  });

  test("each company counts a mention only under one of its own names", () => {
    const website = "w1" as Id<"websites">;
    const elsewhere = "w2" as Id<"websites">;
    // Read once against every company's names: both spellings were found.
    const found = findBrandMentions("Try Acme Plumbing, or ask Akme.", [
      { name: "Acme Plumbing", isPrimary: true, kind: "NAME" },
      { name: "Akme", isPrimary: false, kind: "NAME" },
      { name: "Zenith", isPrimary: false, kind: "NAME" },
    ]);
    expect(found?.found.sort()).toEqual(["acme plumbing", "akme"]);

    const answer = {
      named: [website, elsewhere],
      recommended: [website],
      warnedAgainst: [],
      mentions: [{ websiteId: website, texts: ["akme"] }],
    };
    const ronins = new Map([[website, [{ name: "Acme Plumbing", isPrimary: true, kind: "NAME" as const }]]]);
    const other = new Map([[website, [{ name: "Akme", isPrimary: true, kind: "NAME" as const }]]]);

    // Only "Akme" named it in this answer: the company that calls it that
    // counts it; the one that does not, does not. A website neither names is
    // counted by both, as it always was.
    expect(answersSeenBy([answer], ronins)[0]).toMatchObject({ named: [elsewhere], recommended: [] });
    expect(answersSeenBy([answer], other)[0]).toMatchObject({ named: [website, elsewhere], recommended: [website] });

    // An answer filed before names were each company's counts as it did.
    const older = { named: [website], recommended: [], warnedAgainst: [] };
    expect(answersSeenBy([older], ronins)[0].named).toEqual([website]);
  });

  test("a citation counts for a company only when one of its names was found", () => {
    const names = [{ name: "Ronins", isPrimary: true, kind: "NAME" as const }, { name: "Ronins Agency", isPrimary: false, kind: "NAME" as const }];
    // The longest of the company's names that was found, as the matcher prefers.
    expect(holdNamedIn(names, { mentionedText: "ronins", mentionedTexts: ["ronins", "ronins agency"] })?.name).toBe("Ronins Agency");
    expect(holdNamedIn(names, { mentionedText: "ronin", mentionedTexts: ["ronin"] })).toBeNull();
    // Filed before a mention recorded every name found: the one it matched.
    expect(holdNamedIn(names, { mentionedText: "Ronins" })?.name).toBe("Ronins");
  });
});
