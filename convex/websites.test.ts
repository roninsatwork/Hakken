import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * A company's websites, and the competitors tracked against each.
 *
 * One test here matters more than the rest: two companies adding the same
 * domain must end with **one** `websites` row, whether either of them calls it
 * their own site or a rival. That is the promise the feature exists for —
 * Hakken pays DataForSEO per call, so a duplicate record is a duplicate bill —
 * and it is the failure nothing on screen would reveal, since two records look
 * perfectly correct in a list.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seedCompany(t: Harness, name = "Test Company") {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedUser(
  t: Harness,
  role: "USER" | "ADMIN" | "SUPER_ADMIN",
  companyId?: Id<"companies">,
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: `${role} person`,
      email: `${role.toLowerCase()}-${Math.random()}@test.com`,
      role,
      ...(companyId ? { companyId } : {}),
      createdAt: Date.now(),
    }),
  );
}

async function superAdmin(t: Harness) {
  return t.withIdentity({ subject: await seedUser(t, "SUPER_ADMIN") });
}

const countWebsites = (t: Harness) =>
  t.run(async (ctx) => (await ctx.db.query("websites").collect()).length);
const allCompanyWebsites = (t: Harness) =>
  t.run(async (ctx) => await ctx.db.query("companyWebsites").collect());
/** The websites a company watches rather than owns — its own list, not the graph. */
const allCompetitors = (t: Harness) =>
  t.run(async (ctx) => (await ctx.db.query("companyWebsites").collect())
    .filter((row) => row.relationship === "TRACKED"));

const firstPage = { numItems: 15, cursor: null };

describe("One website, stored once", () => {
  test("two companies adding the same domain share one record", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: ronins,
      url: "https://www.shared.com/uk",
    });
    await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: acme,
      url: "shared.com",
    });

    expect(await countWebsites(t)).toBe(1);
    expect(await allCompanyWebsites(t)).toHaveLength(2);
  });

  test("one company's own site is another's competitor, on one record", async () => {
    // The case that makes the whole model worth having.
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "shared.com" });
    const acmeSite = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: acme,
      url: "acme.com",
    });
    await admin.mutation(api.websites.addTrackedCompetitor, {
      companyWebsiteId: acmeSite,
      url: "https://www.shared.com",
    });

    // shared.com and acme.com. Not three.
    expect(await countWebsites(t)).toBe(2);
    expect(await allCompetitors(t)).toHaveLength(1);
  });

  test("every spelling of one site joins the same record", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company,
      url: "ours.com",
    });

    for (const url of [
      "https://www.rival.com/uk?ref=1",
      "RIVAL.COM",
      "http://rival.com:443",
      "rival.com.",
    ]) {
      const other = await admin.mutation(api.websites.addCompanyWebsite, {
        companyId: await seedCompany(t, `Client ${url}`),
        url,
      });
      expect(other).toBeTruthy();
    }

    // ours.com plus one rival.com, however it was written.
    expect(await countWebsites(t)).toBe(2);
    expect(site).toBeTruthy();
  });

  test("a subdomain is a different website", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "example.com" });
    await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company,
      url: "shop.example.com",
    });

    expect(await countWebsites(t)).toBe(2);
  });

  test("the stored host is normalised, and the readable form is kept", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);

    await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company,
      url: "https://www.MÜNCHEN.de/preise",
    });

    const website = await t.run(async (ctx) => await ctx.db.query("websites").first());
    expect(website?.host).toBe("xn--mnchen-3ya.de");
    expect(website?.displayHost).toBe("münchen.de");
  });

  test("a bad address is refused with something a person can act on", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);

    await expect(
      admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "localhost:3000" }),
    ).rejects.toThrow("only works on your own machine");
    await expect(
      admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "notadomain" }),
    ).rejects.toThrow("missing a domain ending");

    expect(await countWebsites(t)).toBe(0);
  });
});

describe("A company's own websites", () => {
  test("the same website twice in one company is refused", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "ours.com" });
    await expect(
      admin.mutation(api.websites.addCompanyWebsite, {
        companyId: company,
        url: "https://www.ours.com/uk",
      }),
    ).rejects.toThrow("already has that website");
  });

  test("removing one leaves the website record and the other companies alone", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    const roninsSite = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: ronins,
      url: "shared.com",
    });
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "shared.com" });

    await admin.mutation(api.websites.removeCompanyWebsite, { id: roninsSite });

    expect(await countWebsites(t)).toBe(1);
    const remaining = await allCompanyWebsites(t);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].companyId).toBe(acme);
  });

  test("removing the last one still leaves the website — the data was paid for", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company,
      url: "ours.com",
    });

    await admin.mutation(api.websites.removeCompanyWebsite, { id: site });

    expect(await countWebsites(t)).toBe(1);
    expect(await allCompanyWebsites(t)).toHaveLength(0);
  });

  test("the list holds what a company owns and what it tracks, and pairs them", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company,
      url: "ours.com",
    });
    for (const url of ["a.com", "b.com", "c.com"]) {
      await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: site, url });
    }

    const page = await admin.query(api.websites.getCompanyWebsites, {
      companyId: company,
      paginationOpts: firstPage,
    });

    // Four attachments: the company's own site and the three it watches. Both
    // kinds are on its list, because both are websites it has chosen.
    expect(page.page).toHaveLength(4);
    const own = page.page.find((row) => row.displayHost === "ours.com");
    expect(own).toMatchObject({ competitorCount: 3 });
    expect(page.page.filter((row) => row.relationship === "TRACKED")).toHaveLength(3);
  });

  test("the list shows only that company's websites", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const mine = await seedCompany(t, "Mine");
    const theirs = await seedCompany(t, "Theirs");

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: mine, url: "mine.com" });
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: theirs, url: "theirs.com" });

    const page = await admin.query(api.websites.getCompanyWebsites, {
      companyId: mine,
      paginationOpts: firstPage,
    });

    expect(page.page.map((row) => row.displayHost)).toEqual(["mine.com"]);
  });
});

describe("Competitors live inside a website", () => {
  async function seedSite(t: Harness, url = "ours.com") {
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url });
    return { admin, company, site };
  }

  test("a tracked site joins the company's own list, against one of its sites", async () => {
    const t = harness();
    const { admin, company, site } = await seedSite(t);

    await admin.mutation(api.websites.addTrackedCompetitor, {
      companyWebsiteId: site,
      url: "https://www.rival.com/uk",
    });

    const [entry] = await allCompetitors(t);
    // An attachment on the company's own list, pointing at the site of theirs
    // it is watched against — which is what makes the two collect together.
    const siteWebsiteId = await t.run(async (ctx) => (await ctx.db.get(site))!.websiteId);
    expect(entry.companyId).toBe(company);
    expect(entry.againstWebsiteId).toBe(siteWebsiteId);
  });

  test("the same rival twice against one website is refused", async () => {
    const t = harness();
    const { admin, site } = await seedSite(t);

    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: site, url: "rival.com" });
    await expect(
      admin.mutation(api.websites.addTrackedCompetitor, {
        companyWebsiteId: site,
        url: "https://www.rival.com",
      }),
    ).rejects.toThrow("already holds that website");
  });

  test("a company holds a website once, whichever of its sites it rivals", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const shop = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "shop.com" });
    const trade = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "trade.com" });

    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: shop, url: "rival.com" });

    /*
      Refused rather than filed twice. A company's list is a list of websites,
      and the site a tracked one is watched against sets which day they collect
      on — a second pairing would be a second answer to that. Comparing its
      results against another of their sites is a reading question, and the pull
      is the same one either way.
    */
    await expect(admin.mutation(api.websites.addTrackedCompetitor, {
      companyWebsiteId: trade, url: "rival.com",
    })).rejects.toThrow("already holds that website");

    // shop.com, trade.com, rival.com.
    expect(await countWebsites(t)).toBe(3);
  });

  test("a website cannot be its own competitor", async () => {
    const t = harness();
    const { admin, site } = await seedSite(t, "ours.com");

    await expect(
      admin.mutation(api.websites.addTrackedCompetitor, {
        companyWebsiteId: site,
        url: "https://www.ours.com/uk",
      }),
    ).rejects.toThrow("cannot compete with itself");
  });

  test("the list is scoped to its own website and searchable", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const shop = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "shop.com" });
    const trade = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "trade.com" });

    for (const url of ["rival.com", "other.co.uk"]) {
      await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: shop, url });
    }
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: trade, url: "elsewhere.com" });

    const shopWebsiteId = await t.run(async (ctx) => (await ctx.db.get(shop))!.websiteId);

    const all = await admin.query(api.websiteCanonical.listWebsiteRivals, {
      websiteId: shopWebsiteId, page: 1, pageSize: 15,
    });
    expect(all.data.map((row) => row.displayHost).sort()).toEqual(["other.co.uk", "rival.com"]);

    const searched = await admin.query(api.websiteCanonical.listWebsiteRivals, {
      websiteId: shopWebsiteId, page: 1, pageSize: 15, searchTerm: "riv",
    });
    expect(searched.data.map((row) => row.displayHost)).toEqual(["rival.com"]);
  });

  test("stopping tracking leaves the rival's record and other companies alone", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    const roninsSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "a.com" });
    const acmeSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "b.com" });

    const roninsRival = await admin.mutation(api.websites.addTrackedCompetitor, {
      companyWebsiteId: roninsSite, url: "rival.com",
    });
    await admin.mutation(api.websites.addTrackedCompetitor, {
      companyWebsiteId: acmeSite, url: "rival.com",
    });

    await admin.mutation(api.websites.removeCompanyWebsite, { id: roninsRival });

    expect(await countWebsites(t)).toBe(3);
    // Acme keeps watching it. Ronins dropping a site off their own list says
    // nothing about anybody else's.
    const tracked = await t.run(async (ctx) =>
      (await ctx.db.query("companyWebsites").collect())
        .filter((row) => row.relationship === "TRACKED"));
    expect(tracked).toHaveLength(1);
    expect(tracked[0].companyId).toBe(acme);
  });
});

describe("The soonest watcher sets the pace", () => {
  /**
   * Schedules are ordinary `schedules` rows here, exactly as the Schedules
   * screens create them — the point of the rework. `intervalStr` is the
   * platform's own format, so these read the same as any workflow schedule.
   */
  async function scheduleFor(
    t: Harness,
    companyId: Id<"companies">,
    intervalStr: string,
    isActive = true,
  ) {
    const agentId = await t.run(async (ctx) =>
      await ctx.db.insert("agents", {
        name: "DataForSEO Agent",
        description: "Collects SEO data.",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run(async (ctx) =>
      await ctx.db.insert("schedules", {
        name: `SEO — ${companyId}`,
        agentId,
        companyId,
        intervalStr,
        isActive,
        createdAt: Date.now(),
      }),
    );
  }

  async function sharedRow(admin: Awaited<ReturnType<typeof superAdmin>>) {
    const page = await admin.query(api.websites.getPaginatedWebsites, {
      paginationOpts: { numItems: 50, cursor: null },
    });
    return page.page.find((row) => row.host === "shared.com")!;
  }

  test("a host nobody has scheduled is pulled at no time at all", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Unscheduled");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "shared.com" });

    const row = await sharedRow(admin);
    // Not "eventually" — nothing. A company nobody has scheduled should cost
    // nothing, so shipping the fetcher does not start spending on everyone.
    expect(row.nextPullAt).toBeNull();
    expect(row.fetchedFor).toBeNull();
  });

  test("a switched-off schedule does not set the pace", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Paused");
    await scheduleFor(t, company, "daily", false);
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "shared.com" });

    expect((await sharedRow(admin)).nextPullAt).toBeNull();
  });

  test("an active schedule gives the host a next pull, and names whose it is", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "daily");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "shared.com" });

    const row = await sharedRow(admin);
    expect(typeof row.nextPullAt).toBe("number");
    expect(row.fetchedFor?.companyName).toBe("Ronins Agency");
  });

  test("a competitor counts toward the pace just as an owned site does", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const watcher = await seedCompany(t, "Watcher");
    await scheduleFor(t, watcher, "daily");
    const own = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: watcher, url: "own.com",
    });
    await admin.mutation(api.websites.addTrackedCompetitor, {
      companyWebsiteId: own, url: "shared.com",
    });

    const row = await sharedRow(admin);
    expect(typeof row.nextPullAt).toBe("number");
    // A rival follows the site it is measured against, so the context names it.
    expect(row.fetchedFor?.context).toBe("own.com");
  });

  test("a website's own schedule beats its company's", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "monthly");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });
    await admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: site, refreshIntervalStr: "daily", collectionEnabled: true,
    });

    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: site });
    expect(detail?.effective.intervalStr).toBe("daily");
    expect(detail?.effective.source).toBe("WEBSITE");
  });

  test("an hourly override is refused, because a pull is charged per call", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "weekly");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });

    // The shape the old generic builder wrote, which this mutation used to take
    // without looking. The screen was the only thing enforcing the four SEO
    // cadences, and the screen was offering seven.
    await expect(admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: site,
      refreshIntervalStr: JSON.stringify({
        version: 2, kind: "recurring", cadence: "hourly",
        everyHours: 4, startTimeLocal: "09:00", timezone: "UTC",
      }),
      collectionEnabled: true,
    })).rejects.toThrow(/daily, weekly, fortnightly or monthly/);

    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: site });
    expect(detail?.refreshIntervalStr).toBeUndefined();
  });

  test("a list of exact times is refused too", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "weekly");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });

    await expect(admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: site,
      refreshIntervalStr: JSON.stringify({
        version: 2, kind: "targetedTimes", timesLocal: ["09:00", "13:00"], timezone: "UTC",
      }),
      collectionEnabled: true,
    })).rejects.toThrow(/not at a list of exact times/);
  });

  test("fortnightly is accepted, because the company screen offers it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "weekly");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });

    const fortnightly = JSON.stringify({
      version: 2, kind: "recurring", cadence: "fortnightly",
      dayOfWeek: 1, anchorDate: "2026-09-21", timeLocal: "09:00", timezone: "UTC",
    });
    await admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: site, refreshIntervalStr: fortnightly, collectionEnabled: true,
    });

    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: site });
    expect(detail?.refreshIntervalStr).toBe(fortnightly);
    expect(detail?.effective.source).toBe("WEBSITE");
  });

  test("a legacy interval the guard cannot read is left alone", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "weekly");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });

    // Refusing what it does not understand would break websites that work.
    await admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: site, refreshIntervalStr: "daily", collectionEnabled: true,
    });
    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: site });
    expect(detail?.refreshIntervalStr).toBe("daily");
  });

  test("a website with no override follows its company, and says so", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "weekly");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });

    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: site });
    expect(detail?.effective.intervalStr).toBe("weekly");
    expect(detail?.effective.source).toBe("COMPANY");
    // Inheritance is absence: nothing is stored on the website itself.
    expect(detail?.refreshIntervalStr).toBeUndefined();
  });

  test("clearing an override puts the website back to following", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "weekly");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });

    await admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: site, refreshIntervalStr: "daily", collectionEnabled: true,
    });
    await admin.mutation(api.websites.setCompanyWebsiteSchedule, { id: site });

    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: site });
    expect(detail?.effective.source).toBe("COMPANY");
    expect(detail?.effective.intervalStr).toBe("weekly");
  });

  test("a website can be switched off while its company keeps collecting", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await scheduleFor(t, company, "daily");
    const site = await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: company, url: "shared.com",
    });
    await admin.mutation(api.websites.setCompanyWebsiteSchedule, {
      id: site, refreshIntervalStr: "daily", collectionEnabled: false,
    });

    const detail = await admin.query(api.websites.getCompanyWebsiteById, { id: site });
    expect(detail?.effective.active).toBe(false);
    expect(detail?.companyScheduleActive).toBe(true);
  });
});

describe("The global list", () => {
  test("counts how it is held, and by how many companies", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "shared.com" });
    const acmeSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "acme.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: acmeSite, url: "shared.com" });

    const page = await admin.query(api.websites.getPaginatedWebsites, {
      paginationOpts: { numItems: 50, cursor: null },
    });
    const shared = page.page.find((row) => row.host === "shared.com")!;

    expect(shared).toMatchObject({
      watcherCount: 2,
      companyCount: 2,
      ownedCount: 1,
      trackedCount: 1,
    });
  });

  test("the watcher list says who holds it and what each rival is measured against", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "shared.com" });
    const acmeSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "acme.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: acmeSite, url: "shared.com" });

    const websiteId = await t.run(async (ctx) =>
      (await ctx.db.query("websites").filter((q) => q.eq(q.field("host"), "shared.com")).first())!._id,
    );
    const detail = await admin.query(api.websites.getWebsiteById, { id: websiteId });

    const owned = detail!.watchers.find((w) => w.relationship === "OWNED")!;
    const tracked = detail!.watchers.find((w) => w.relationship === "TRACKED")!;
    expect(owned.companyName).toBe("Ronins Agency");
    expect(owned.againstHost).toBeNull();
    expect(tracked.companyName).toBe("Acme Ltd");
    expect(tracked.againstHost).toBe("acme.com");
  });

  test("adding a host with no company, twice, reuses it", async () => {
    const t = harness();
    const admin = await superAdmin(t);

    const first = await admin.mutation(api.websites.createWebsite, { url: "https://rival.com" });
    const second = await admin.mutation(api.websites.createWebsite, { url: "www.rival.com/uk" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.websiteId).toBe(first.websiteId);
    expect(await countWebsites(t)).toBe(1);
  });

  test("search finds a host by its readable form", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    await admin.mutation(api.websites.createWebsite, { url: "rival.com" });
    await admin.mutation(api.websites.createWebsite, { url: "example.com" });

    const page = await admin.query(api.websites.getPaginatedWebsites, {
      paginationOpts: firstPage,
      searchTerm: "rival",
    });

    expect(page.page.map((row) => row.host)).toEqual(["rival.com"]);
  });
});

describe("The add form is told the key before it saves", () => {
  test("it echoes the normalised host", async () => {
    const t = harness();
    const admin = await superAdmin(t);

    expect(
      await admin.query(api.websites.previewWebsiteHost, { url: "https://www.Example.com/uk?ref=1" }),
    ).toEqual({ ok: true, host: "example.com", displayHost: "example.com", alreadyKnown: false });
  });

  test("it says when the host is one already in the system", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    await admin.mutation(api.websites.createWebsite, { url: "rival.com" });

    expect(await admin.query(api.websites.previewWebsiteHost, { url: "www.rival.com" }))
      .toMatchObject({ ok: true, alreadyKnown: true });
  });

  test("it explains a refusal rather than throwing at the form", async () => {
    const t = harness();
    const admin = await superAdmin(t);

    expect(await admin.query(api.websites.previewWebsiteHost, { url: "not a website" }))
      .toMatchObject({ ok: false, problem: "UNPARSEABLE" });
  });
});

describe("Deleting a website", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("takes every company's hold on it, across companies and both roles", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "shared.com" });
    const acmeSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "acme.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: acmeSite, url: "shared.com" });

    const websiteId = await t.run(async (ctx) =>
      (await ctx.db.query("websites").filter((q) => q.eq(q.field("host"), "shared.com")).first())!._id,
    );
    await admin.mutation(api.websites.deleteWebsite, { id: websiteId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // acme.com survives; shared.com and both holds on it are gone.
    const websites = await t.run(async (ctx) => await ctx.db.query("websites").collect());
    expect(websites.map((row) => row.host)).toEqual(["acme.com"]);
    expect(await allCompetitors(t)).toHaveLength(0);
    expect((await allCompanyWebsites(t)).map((row) => row.companyId)).toEqual([acme]);
  });

  test("deleting a host takes every hold on it and unpairs what it was compared with", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "ours.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: site, url: "rival.com" });

    const websiteId = await t.run(async (ctx) =>
      (await ctx.db.query("websites").filter((q) => q.eq(q.field("host"), "ours.com")).first())!._id,
    );
    await admin.mutation(api.websites.deleteWebsite, { id: websiteId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // The rival's own record survives, and so does this company's decision to
    // watch it — what goes is the hold on the deleted host, and the pairing
    // that pointed at it, which would otherwise dangle.
    const holds = await allCompanyWebsites(t);
    expect(holds).toHaveLength(1);
    expect(holds[0].relationship).toBe("TRACKED");
    expect(holds[0].againstWebsiteId).toBeUndefined();
    const websites = await t.run(async (ctx) => await ctx.db.query("websites").collect());
    expect(websites.map((row) => row.host)).toEqual(["rival.com"]);
  });

  test("records who lost it, so it is never found out afterwards", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "shared.com" });
    const acmeSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "acme.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: acmeSite, url: "shared.com" });

    const websiteId = await t.run(async (ctx) =>
      (await ctx.db.query("websites").filter((q) => q.eq(q.field("host"), "shared.com")).first())!._id,
    );
    await admin.mutation(api.websites.deleteWebsite, { id: websiteId });

    const entry = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).find((row) => row.actionType === "DELETE_WEBSITE"),
    );
    const metadata = JSON.parse(entry?.metadata ?? "{}");
    expect(metadata.host).toBe("shared.com");
    expect(metadata.affected).toHaveLength(2);
    expect(metadata.affected.map((a: { companyName: string }) => a.companyName).sort()).toEqual([
      "Acme Ltd",
      "Ronins Agency",
    ]);
  });

  test("removing a company's own site leaves what it tracked against it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "ours.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: site, url: "rival.com" });

    await admin.mutation(api.websites.removeCompanyWebsite, { id: site });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    /*
      Only that one hold goes. The tracked site stays on the company's list —
      removing your own site is not a statement about what else you watch, and
      guessing otherwise would silently stop collecting something paid for.
      What it is watched *against* is now gone, so it follows the company.
    */
    expect(await allCompetitors(t)).toHaveLength(1);
    expect(await countWebsites(t)).toBe(2);
  });

  test("deleting a company takes its websites and competitors, not the records", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const doomed = await seedCompany(t, "Doomed");
    const survivor = await seedCompany(t, "Survivor");

    const doomedSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: doomed, url: "doomed.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: doomedSite, url: "shared.com" });
    const survivorSite = await admin.mutation(api.websites.addCompanyWebsite, { companyId: survivor, url: "survivor.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: survivorSite, url: "shared.com" });

    await admin.mutation(api.companies.deleteCompany, { id: doomed });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Every hold the doomed company had, owned or tracked, goes with it.
    expect((await allCompanyWebsites(t)).map((row) => row.companyId)).toEqual([survivor, survivor]);
    expect(await allCompetitors(t)).toHaveLength(1);
    // doomed.com, survivor.com and shared.com — three hosts, because both
    // companies tracked the same rival and that is one record. All three
    // survive the company that held them.
    expect(await countWebsites(t)).toBe(3);
  });
});

describe("Who may do any of this", () => {
  test("a standard user is refused everywhere", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "ours.com" });
    const rival = await admin.mutation(api.websites.addTrackedCompetitor, {
      companyWebsiteId: site, url: "rival.com",
    });
    const websiteId = await t.run(async (ctx) => (await ctx.db.query("websites").first())!._id);

    const user = t.withIdentity({ subject: await seedUser(t, "USER", company) });

    await expect(user.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "theirs.com" }))
      .rejects.toThrow("Unauthorized");
    await expect(user.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: site, url: "x.com" }))
      .rejects.toThrow("Unauthorized");
    await expect(user.mutation(api.websites.removeCompanyWebsite, { id: rival }))
      .rejects.toThrow("Unauthorized");
    await expect(user.mutation(api.websites.deleteWebsite, { id: websiteId }))
      .rejects.toThrow("Unauthorized");
    await expect(user.query(api.websites.getCompanyWebsites, { companyId: company, paginationOpts: firstPage }))
      .rejects.toThrow("Unauthorized");
  });

  test("a company admin cannot reach the cross-company list", async () => {
    const t = harness();
    const company = await seedCompany(t);
    const companyAdmin = t.withIdentity({ subject: await seedUser(t, "ADMIN", company) });

    // This view shows one company's setup to someone looking at another's,
    // which is precisely why it is closed to everyone but a super admin.
    await expect(companyAdmin.query(api.websites.getPaginatedWebsites, { paginationOpts: firstPage }))
      .rejects.toThrow("Unauthorized");
  });

  test("an unauthenticated caller gets nowhere", async () => {
    const t = harness();
    await expect(t.mutation(api.websites.createWebsite, { url: "rival.com" }))
      .rejects.toThrow("Unauthenticated");
  });
});

describe("Sweeps do not run away", () => {
  test("the internal purge is reachable and idempotent", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t);
    const site = await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "ours.com" });
    await admin.mutation(api.websites.addTrackedCompetitor, { companyWebsiteId: site, url: "rival.com" });

    await t.mutation(internal.websitePurge.purgeCompanyWebsitesInternal, { companyId: company });
    await t.mutation(internal.websitePurge.purgeCompanyWebsitesInternal, { companyId: company });

    expect(await allCompanyWebsites(t)).toHaveLength(0);
    expect(await countWebsites(t)).toBe(2);
  });
});

describe("The names a site goes by", () => {
  test("two companies tracking one host read the same names", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: ronins,
      url: "shared.com",
    });
    await admin.mutation(api.websites.addCompanyWebsite, {
      companyId: acme,
      url: "shared.com",
    });

    const websiteId = (await t.run(async (ctx) =>
      await ctx.db.query("websites").first()))!._id;

    await admin.mutation(api.websites.setWebsiteBrandNames, {
      websiteId,
      names: [{ name: "Shared Co", isPrimary: true }, { name: "Shared Group" }],
    });

    // The point of putting them on the shared row: entered once, true for
    // everyone. It is also what lets one citation purchase answer every
    // watcher.
    const website = await t.run(async (ctx) => await ctx.db.get(websiteId));
    expect(website?.brandNames?.map((entry) => entry.name))
      .toEqual(["Shared Co", "Shared Group"]);
    expect(await allCompanyWebsites(t)).toHaveLength(2);
  });

  test("refuses a sixth name rather than silently dropping it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "a.com" });
    const websiteId = (await t.run(async (ctx) =>
      await ctx.db.query("websites").first()))!._id;

    // The cap lives here and not only in the form, because a limit living in a
    // screen is a limit the next caller does not have.
    await expect(admin.mutation(api.websites.setWebsiteBrandNames, {
      websiteId,
      names: ["one", "two", "three", "four", "five", "six"].map((name) => ({ name: `Name ${name}` })),
    })).rejects.toThrow(/at most 5/);
  });

  test("records both sides of a change to a shared list", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "a.com" });
    const websiteId = (await t.run(async (ctx) =>
      await ctx.db.query("websites").first()))!._id;

    await admin.mutation(api.websites.setWebsiteBrandNames, {
      websiteId,
      names: [{ name: "First Name" }, { name: "Second Name" }],
    });
    await admin.mutation(api.websites.setWebsiteBrandNames, {
      websiteId,
      names: [{ name: "First Name" }],
    });

    // Someone else was relying on "Second Name". A shared record that was
    // blanked has to be recoverable from the trail rather than from memory.
    const entries = await t.run(async (ctx) =>
      await ctx.db.query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "SET_WEBSITE_BRAND_NAMES"))
        .collect());
    const last = JSON.parse(entries[entries.length - 1].metadata ?? "{}") as {
      before: string[]; after: string[];
    };
    expect(last.before).toEqual(["First Name", "Second Name"]);
    expect(last.after).toEqual(["First Name"]);
  });

  test("an ordinary admin cannot touch a record everyone shares", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "a.com" });
    const websiteId = (await t.run(async (ctx) =>
      await ctx.db.query("websites").first()))!._id;

    const tenantAdmin = t.withIdentity({ subject: await seedUser(t, "ADMIN", company) });

    await expect(tenantAdmin.mutation(api.websites.setWebsiteBrandNames, {
      websiteId,
      names: [{ name: "Their Own Name" }],
    })).rejects.toThrow();
  });
});

describe("Where a company watches from", () => {
  test("two companies can watch one host from different places", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");

    await admin.mutation(api.websites.addCompanyWebsite, { companyId: ronins, url: "shared.com" });
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: acme, url: "shared.com" });
    const holds = await allCompanyWebsites(t);

    await admin.mutation(api.websites.setCompanyWebsiteLocation, {
      companyWebsiteId: holds[0]._id,
      locationCode: 1006886,
      locationLabel: "Leeds,England,United Kingdom",
    });

    // This is the difference from brand names: here two companies genuinely do
    // disagree, so it sits on the hold and not on the website.
    const after = await allCompanyWebsites(t);
    const leeds = after.find((row) => row._id === holds[0]._id);
    const other = after.find((row) => row._id === holds[1]._id);
    expect(leeds?.locationCode).toBe(1006886);
    expect(other?.locationCode).toBeUndefined();
  });

  test("clearing the place is an instruction, not a missing argument", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "a.com" });
    const hold = (await allCompanyWebsites(t))[0];

    await admin.mutation(api.websites.setCompanyWebsiteLocation, {
      companyWebsiteId: hold._id,
      locationCode: 1006886,
      locationLabel: "Leeds,England,United Kingdom",
    });
    await admin.mutation(api.websites.setCompanyWebsiteLocation, {
      companyWebsiteId: hold._id,
      locationCode: null,
      locationLabel: null,
    });

    // Absent means the registry's default, which is the United Kingdom.
    const after = (await allCompanyWebsites(t))[0];
    expect(after.locationCode).toBeUndefined();
    expect(after.locationLabel).toBeUndefined();
  });

  test("refuses a place with no name to show", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const company = await seedCompany(t, "Ronins Agency");
    await admin.mutation(api.websites.addCompanyWebsite, { companyId: company, url: "a.com" });
    const hold = (await allCompanyWebsites(t))[0];

    await expect(admin.mutation(api.websites.setCompanyWebsiteLocation, {
      companyWebsiteId: hold._id,
      locationCode: 1006886,
      locationLabel: null,
    })).rejects.toThrow(/Pick a place/);
  });
});
