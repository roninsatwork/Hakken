import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * A company's choice of what it owns and what it watches.
 *
 * The rule worth more than the rest: **a tracked site is collected with the
 * site it is watched against, or on its own — never neither.** The first
 * version of the owned-and-tracked split skipped every tracked hold in the
 * cycle and reached them only as targets of a pair, so a site a company chose
 * to watch with nothing to pair it to was never collected at all, and nothing
 * on screen said so. The cycle's half of that lives in `seoCollection.test.ts`;
 * this file holds the writes that make the pairing mean something.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const WEEKLY = JSON.stringify({
  version: 2,
  kind: "recurring",
  cadence: "weekly",
  dayOfWeek: 1,
  timeLocal: "09:00",
  timezone: "UTC",
});

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super person",
      email: `super-${Math.random()}@test.com`,
      role: "SUPER_ADMIN" as const,
      createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function seedCompany(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

const holdOf = (t: Harness, id: Id<"companyWebsites">) => t.run(async (ctx) => await ctx.db.get(id));

describe("tracking a website", () => {
  test("paired with one of the company's own sites, it records the pair and the rivalry", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const own = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "ronins.co.uk" });

    const trackedId = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins,
      url: "https://www.rival.co.uk",
      againstCompanyWebsiteId: own,
    });

    const tracked = await holdOf(t, trackedId);
    const ownHold = await holdOf(t, own);
    expect(tracked?.relationship).toBe("TRACKED");
    expect(tracked?.againstWebsiteId).toBe(ownHold?.websiteId);
    // The market fact goes on the host for everyone; it decides nothing.
    const edges = await t.run(async (ctx) => await ctx.db.query("websiteRivals").collect());
    expect(edges).toHaveLength(1);
  });

  test("with no pair, it is held on its own and asserts no rivalry", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");

    const trackedId = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins,
      url: "rival.co.uk",
    });

    const tracked = await holdOf(t, trackedId);
    expect(tracked?.relationship).toBe("TRACKED");
    expect(tracked?.againstWebsiteId).toBeUndefined();
    expect(await t.run(async (ctx) => await ctx.db.query("websiteRivals").collect())).toHaveLength(0);
  });

  test("it cannot be paired with a site the company only tracks", async () => {
    // "Collected with" would be circular: a tracked site's day is its pair's,
    // so its pair has to be a site with a day of its own.
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const watched = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins,
      url: "rival-one.co.uk",
    });

    await expect(admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins,
      url: "rival-two.co.uk",
      againstCompanyWebsiteId: watched,
    })).rejects.toThrow(/owns/);
  });

  test("it cannot be paired with another company's site", async () => {
    // Pairing sets which day a site is collected, so a pair borrowed from
    // another tenant would let one company set another's schedule.
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    const acmeSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "acme.com" });

    await expect(admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins,
      url: "rival.co.uk",
      againstCompanyWebsiteId: acmeSite,
    })).rejects.toThrow(/not one of this company's/);
  });

  test("a company that already holds the site is refused rather than filed twice", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "ronins.co.uk" });

    await expect(admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins,
      url: "https://ronins.co.uk/about",
    })).rejects.toThrow(/already holds/);
  });
});

describe("a pairing decides the day and the place", () => {
  test("a paired site refuses a schedule or a place of its own", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const own = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "ronins.co.uk" });
    const trackedId = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins, url: "rival.co.uk", againstCompanyWebsiteId: own,
    });

    await expect(admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: trackedId, refreshIntervalStr: WEEKLY, collectionEnabled: true,
    })).rejects.toThrow(/collected with ronins\.co\.uk/);
    await expect(admin.mutation(api.websites.setCompanyWebsiteLocation, {
      companyWebsiteId: trackedId, locationCode: 1006886, locationLabel: "Leeds, England, United Kingdom",
    })).rejects.toThrow(/wherever ronins\.co\.uk is/);
  });

  test("an unpaired site takes a schedule of its own like any hold", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const trackedId = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins, url: "rival.co.uk",
    });

    await admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: trackedId, refreshIntervalStr: WEEKLY, collectionEnabled: true,
    });
    expect((await holdOf(t, trackedId))?.refreshIntervalStr).toBe(WEEKLY);
  });

  test("pairing clears the settings it overrides, and unpairing leaves none behind", async () => {
    // A stored value nothing reads is a setting that lies: unpair the site a
    // year later and last spring's override would silently be back in force.
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const own = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "ronins.co.uk" });
    const trackedId = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins, url: "rival.co.uk",
    });
    await admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: trackedId, refreshIntervalStr: WEEKLY, collectionEnabled: true,
    });

    await admin.mutation(api.websiteAttachments.setTrackedPairing, {
      id: trackedId, againstCompanyWebsiteId: own,
    });
    let tracked = await holdOf(t, trackedId);
    expect(tracked?.againstWebsiteId).toBe((await holdOf(t, own))?.websiteId);
    expect(tracked?.refreshIntervalStr).toBeUndefined();
    expect(tracked?.collectionEnabled).toBeUndefined();

    await admin.mutation(api.websiteAttachments.setTrackedPairing, {
      id: trackedId, againstCompanyWebsiteId: null,
    });
    tracked = await holdOf(t, trackedId);
    expect(tracked?.againstWebsiteId).toBeUndefined();
    expect(tracked?.refreshIntervalStr).toBeUndefined();
  });

  test("an owned site cannot be paired, because it has a day of its own", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const own = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "ronins.co.uk" });
    const other = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "shop.ronins.co.uk" });

    await expect(admin.mutation(api.websiteAttachments.setTrackedPairing, {
      id: other, againstCompanyWebsiteId: own,
    })).rejects.toThrow(/Only a tracked site/);
  });

  test("the list and the site both say whose day a paired site runs on", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const own = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "ronins.co.uk" });
    const trackedId = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins, url: "rival.co.uk", againstCompanyWebsiteId: own,
    });

    const list = await admin.query(api.websites.getCompanyWebsites, {
      companyId: ronins, paginationOpts: { numItems: 15, cursor: null },
    });
    const row = list.page.find((entry) => entry._id === trackedId);
    expect(row?.scheduleSource).toBe("PAIR");
    expect(row?.againstHost).toBe("ronins.co.uk");
    expect(list.page.find((entry) => entry._id === own)?.competitorCount).toBe(1);

    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: trackedId });
    expect(detail?.pairedWith?.displayHost).toBe("ronins.co.uk");
    expect(detail?.effective.source).toBe("PAIR");

    // Only its own sites, and in the order they were added: the first is the
    // default pair, and a company's first site is nearly always its main one.
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "a-later-site.co.uk" });
    const owned = await admin.query(api.websiteAttachments.listCompanyOwnedWebsites, { companyId: ronins });
    expect(owned.map((site) => site.displayHost)).toEqual(["ronins.co.uk", "a-later-site.co.uk"]);
  });

  test("a site's rivals are counted however many holds the company has", async () => {
    // The count took the company's first hundred holds and filtered them
    // afterwards, so a company whose first hundred rows were rivals of one site
    // read as having no rivals on any other.
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const busy = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "busy.co.uk" });
    const busySite = (await holdOf(t, busy))!.websiteId;
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        const websiteId = await ctx.db.insert("websites", {
          host: `rival-${index}.co.uk`, displayHost: `rival-${index}.co.uk`, firstSeenAt: Date.now(),
        });
        await ctx.db.insert("companyWebsites", {
          companyId: ronins, websiteId, relationship: "TRACKED", againstWebsiteId: busySite, createdAt: Date.now(),
        });
      }
    });
    const quiet = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "quiet.co.uk" });
    await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: ronins, url: "only-rival.co.uk", againstCompanyWebsiteId: quiet,
    });

    const list = await admin.query(api.websites.getCompanyWebsites, {
      companyId: ronins, paginationOpts: { numItems: 5, cursor: null },
    });
    expect(list.page.find((entry) => entry._id === quiet)?.competitorCount).toBe(1);
  });
});
