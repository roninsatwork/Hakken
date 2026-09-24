import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * The wall between one customer and another.
 *
 * A website record is shared: one host is stored once and used by everyone
 * tracking it, which means the record implicitly knows that a company and its
 * rival both watch the same site. Tenancy lives only on the join rows, and
 * nothing may start from a website and walk outward to its watchers. These
 * tests are that rule, stated as failures.
 *
 * The refusals matter as much as the permissions. A host this company does not
 * hold must be refused in exactly the words a host that does not exist is
 * refused in, or the difference between the two becomes a way of asking which
 * hosts the platform knows about.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seedCompany(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedWebsite(t: Harness, host: string) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() }));
}

async function hold(t: Harness, companyId: Id<"companies">, websiteId: Id<"websites">) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("companyWebsites", { companyId, websiteId, createdAt: Date.now() }));
}

describe("reading a website's numbers", () => {
  test("a company reads a host it holds", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    const website = await seedWebsite(t, "ourshop.com");
    await hold(t, company, website);

    const result = await t.query(internal.seoTools.readSeoMetrics, {
      companyId: company,
      host: "https://www.ourshop.com/uk",
    });

    // The URL is normalised to the host key on the way in, so the same site
    // written three ways is the same record.
    expect(result.host).toBe("ourshop.com");
  });

  test("a site it tracks counts as held", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    const own = await seedWebsite(t, "ourshop.com");
    const rival = await seedWebsite(t, "rival.com");
    await hold(t, company, own);
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company,
        websiteId: rival,
        relationship: "TRACKED",
        againstWebsiteId: own,
        createdAt: Date.now(),
      }));

    const result = await t.query(internal.seoTools.readSeoMetrics, {
      companyId: company,
      host: "rival.com",
    });

    expect(result.host).toBe("rival.com");
  });

  test("a rival on the shared graph is not held until this company tracks it", async () => {
    // Who competes with whom is market knowledge on the host, and another
    // company may well have asserted it. That must not grant this company the
    // rival: this door is what lets the agent ask for a pull, so an assertion
    // made elsewhere would be spending this company's money.
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    const own = await seedWebsite(t, "ourshop.com");
    const rival = await seedWebsite(t, "rival.com");
    await hold(t, company, own);
    await t.run(async (ctx) =>
      await ctx.db.insert("websiteRivals", {
        websiteId: own,
        rivalWebsiteId: rival,
        source: "ASSERTED",
        createdAt: Date.now(),
      }));

    await expect(t.query(internal.seoTools.readSeoMetrics, {
      companyId: company,
      host: "rival.com",
    })).rejects.toThrow(/does not hold/);
  });

  test("a host another company holds is refused", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    const website = await seedWebsite(t, "secret.com");
    await hold(t, acme, website);

    // The record exists and has data on it. Existing is not entitlement.
    await expect(t.query(internal.seoTools.readSeoMetrics, {
      companyId: ronins,
      host: "secret.com",
    })).rejects.toThrow(/does not hold/);
  });

  test("an unheld host and an unknown host are refused identically", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    await hold(t, acme, await seedWebsite(t, "held-by-acme.com"));

    const unheld = await t.query(internal.seoTools.readSeoMetrics, {
      companyId: ronins,
      host: "held-by-acme.com",
    }).catch((error: Error) => error.message);
    const unknown = await t.query(internal.seoTools.readSeoMetrics, {
      companyId: ronins,
      host: "never-seen.com",
    }).catch((error: Error) => error.message);

    // Compared with each host's own name taken out, because the refusal names
    // the host the caller asked about and the caller already knows that. What
    // must not differ is everything else: a distinguishable answer would turn
    // this tool into a way of asking which hosts the platform knows about, and
    // so which hosts somebody else is watching.
    expect(String(unheld).replace("held-by-acme.com", "HOST"))
      .toBe(String(unknown).replace("never-seen.com", "HOST"));
  });

  test("returns numbers, and no text from the open web", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    const website = await seedWebsite(t, "ourshop.com");
    await hold(t, company, website);

    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "domain_ranked_keywords",
        family: "DataForSEO Labs",
        mode: "LIVE",
        websiteId: website,
        taskArgsJson: "{}",
        status: "READY",
        tag: "t",
        costUsd: 0,
        sandbox: false,
        submittedAt: Date.now(),
        completedAt: Date.now(),
      });
      await ctx.db.insert("seoKeywordPositions", {
        websiteId: website,
        keyword: "emergency plumber leeds",
        day: new Date().toISOString().slice(0, 10),
        position: 3,
        url: "https://ourshop.com/leeds",
        pullId,
        createdAt: Date.now(),
      });
    });

    const result = await t.query(internal.seoTools.readSeoMetrics, {
      companyId: company,
      host: "ourshop.com",
    });

    expect(result.keywords[0]).toMatchObject({ keyword: "emergency plumber leeds", position: 3 });
    // The keyword is ours — we asked about it. A result title is not, and
    // there is no field here for one to arrive in.
    expect(Object.keys(result.keywords[0]).sort())
      .toEqual(["day", "keyword", "position", "searchVolume"]);
  });
});

describe("asking for one website now", () => {
  test("a host the company does not hold is refused before anything is queued", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    await hold(t, acme, await seedWebsite(t, "secret.com"));

    await expect(t.mutation(internal.seoTools.requestSeoPull, {
      companyId: ronins,
      host: "secret.com",
      operationId: "backlinks_summary",
    })).rejects.toThrow(/does not hold/);

    expect(await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect())).toHaveLength(0);
  });

  test("asking twice in a day buys it once", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await hold(t, company, await seedWebsite(t, "ourshop.com"));

    const first = await t.mutation(internal.seoTools.requestSeoPull, {
      companyId: company,
      host: "ourshop.com",
      operationId: "backlinks_summary",
    });
    const second = await t.mutation(internal.seoTools.requestSeoPull, {
      companyId: company,
      host: "ourshop.com",
      operationId: "backlinks_summary",
    });

    // The ad hoc door goes through the same duplicate check as a scheduled
    // cycle, so an impatient agent cannot spend its way round the schedule.
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect())).toHaveLength(1);
  });

  test("a call with its own cadence is not bought again inside it, however the agent asks", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    const website = await seedWebsite(t, "ourshop.com");
    await hold(t, company, website);
    // A weekly list bought three days ago.
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_list", family: "Backlinks", mode: "LIVE", target: "ourshop.com", websiteId: website,
        taskArgsJson: "{}", status: "READY", tag: "bought", costUsd: 0.043, sandbox: false,
        submittedAt: threeDaysAgo, completedAt: threeDaysAgo,
      });
    });

    const asked = await t.mutation(internal.seoTools.requestSeoPull, {
      companyId: company,
      host: "ourshop.com",
      operationId: "backlinks_list",
    });
    expect(asked).toMatchObject({ ok: true, reused: true });
    expect(asked.message).toMatch(/at most that often/);
    expect(await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect())).toHaveLength(1);
  });

  test("an invented data type is refused rather than sent", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await hold(t, company, await seedWebsite(t, "ourshop.com"));

    // A hallucinated operation name must cost nothing. The registry refuses it
    // here, before any request is built.
    await expect(t.mutation(internal.seoTools.requestSeoPull, {
      companyId: company,
      host: "ourshop.com",
      operationId: "serp_google_imaginary",
    })).rejects.toThrow(/no operation called/);
  });
});

describe("starting a collection run", () => {
  test("a second run while one is under way is refused", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");

    const first = await t.mutation(internal.seoTools.startSeoCollection, {
      companyId: company,
      trigger: "MANUAL",
    });
    const second = await t.mutation(internal.seoTools.startSeoCollection, {
      companyId: company,
      trigger: "MANUAL",
    });

    // Two open cycles would plan the same work, and the only thing between
    // that and a doubled bill would be the idempotency key — which is a safety
    // net, not a plan.
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.cycleId).toBe(first.cycleId);
  });

  test("a finished run does not block the next one", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");

    const first = await t.mutation(internal.seoTools.startSeoCollection, {
      companyId: company,
      trigger: "MANUAL",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(first.cycleId as Id<"seoCollectionCycles">, { status: "DONE" });
    });

    const second = await t.mutation(internal.seoTools.startSeoCollection, {
      companyId: company,
      trigger: "SCHEDULE",
    });

    expect(second.ok).toBe(true);
    expect(second.cycleId).not.toBe(first.cycleId);
  });
});
