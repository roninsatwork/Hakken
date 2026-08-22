import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  WIKI_TENDING_LENGTH_THRESHOLD,
  WIKI_TENDING_MODEL_PAGES_PER_SWEEP,
} from "./wikiTending";

/**
 * The nightly gardener's ground rules (wiki plan, phase 4): broken links
 * come off mechanically and are audited once; only genuinely overgrown,
 * not-recently-seen pages are offered to the model, and only a few per
 * night; the tenant wall holds on repairs.
 */

async function seedPage(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  overrides: Partial<{
    subjectKey: string;
    content: string;
    links: string[];
    lastTendedAt: number;
  }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("wikiPages", {
      companyId,
      kind: "CUSTOMER" as const,
      subjectKey: overrides.subjectKey ?? "acme",
      title: overrides.subjectKey ?? "acme",
      content: overrides.content ?? "Short note.",
      links: overrides.links ?? [],
      pinnedCorrections: [],
      rewriteCount: 1,
      lastRewriteSource: "PHONE_CALL:1",
      ...(overrides.lastTendedAt !== undefined ? { lastTendedAt: overrides.lastTendedAt } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Wiki Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

describe("the tending pass", () => {
  test("links to pages that no longer exist come off, audited once; living links stay", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, companyId, { subjectKey: "acme" });
    const pageId = await seedPage(t, companyId, {
      subjectKey: "brightwater",
      links: ["CUSTOMER:acme", "CUSTOMER:vanished"],
    });

    const candidates = await t.query(internal.wikiTending.getTendingCandidatesInternal, {
      companyId,
    });
    expect(candidates.linkRepairs).toEqual([{ pageId, links: ["CUSTOMER:acme"] }]);

    await t.mutation(internal.wikiTending.repairLinksInternal, {
      companyId,
      repairs: candidates.linkRepairs,
    });

    const { page, auditTrail } = await t.run(async (ctx) => ({
      page: await ctx.db.get(pageId),
      auditTrail: (await ctx.db.query("auditLogs").collect()).filter(
        (entry) => entry.actionType === "WIKI_LINKS_REPAIRED"
      ),
    }));
    expect(page?.links).toEqual(["CUSTOMER:acme"]);
    expect(auditTrail).toHaveLength(1);
  });

  test("only overgrown, not-recently-tended pages are offered to the model, and only a few", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const long = "x".repeat(WIKI_TENDING_LENGTH_THRESHOLD + 10);

    await seedPage(t, companyId, { subjectKey: "short-page", content: "Tidy already." });
    await seedPage(t, companyId, {
      subjectKey: "seen-tonight",
      content: long,
      lastTendedAt: Date.now() - 60_000,
    });
    for (let i = 0; i < WIKI_TENDING_MODEL_PAGES_PER_SWEEP + 2; i++) {
      await seedPage(t, companyId, { subjectKey: `overgrown-${i}`, content: long });
    }

    const candidates = await t.query(internal.wikiTending.getTendingCandidatesInternal, {
      companyId,
    });
    const offered = candidates.overgrown.map((page) => page.subjectKey);
    expect(offered).toHaveLength(WIKI_TENDING_MODEL_PAGES_PER_SWEEP);
    expect(offered).not.toContain("short-page");
    expect(offered).not.toContain("seen-tonight");
  });

  test("repairs cannot reach across the tenant wall", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");
    const foreignPageId = await seedPage(t, companyB, {
      subjectKey: "acme",
      links: ["CUSTOMER:vanished"],
    });

    await t.mutation(internal.wikiTending.repairLinksInternal, {
      companyId: companyA,
      repairs: [{ pageId: foreignPageId, links: [] }],
    });

    const foreignPage = await t.run(async (ctx) => ctx.db.get(foreignPageId));
    expect(foreignPage?.links).toEqual(["CUSTOMER:vanished"]);
  });

  test("every company with a living wiki is on the dispatcher's round, once", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");
    await seedPage(t, companyA, { subjectKey: "one" });
    await seedPage(t, companyA, { subjectKey: "two" });
    await seedPage(t, companyB, { subjectKey: "three" });

    const companies = await t.query(internal.wikiTending.listCompaniesWithPagesInternal, {});
    expect(new Set(companies)).toEqual(new Set([companyA, companyB]));
    expect(companies).toHaveLength(2);
  });
});

describe("goals are not the gardener's to shorten (personal-layer-and-goals-plan.md)", () => {
  test("an overgrown GOAL page is never offered to the model", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const long = "x".repeat(WIKI_TENDING_LENGTH_THRESHOLD + 10);

    await t.run(async (ctx) =>
      ctx.db.insert("wikiPages", {
        companyId,
        kind: "GOAL" as const,
        subjectKey: "big-aim",
        title: "big-aim",
        content: long,
        links: [],
        pinnedCorrections: [],
        rewriteCount: 0,
        lastRewriteSource: "HUMAN:someone",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const candidates = await t.query(internal.wikiTending.getTendingCandidatesInternal, {
      companyId,
    });
    expect(candidates.overgrown.map((page) => page.subjectKey)).not.toContain("big-aim");
  });
});

describe("link repair beyond the window (wiki-scaling-note.md)", () => {
  test("a link to a living page outside the window stays; a link to a gone page comes off", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const base = Date.now();

    await t.run(async (ctx) => {
      // The oldest page — outside the newest-500 window once the fillers land.
      await ctx.db.insert("wikiPages", {
        companyId,
        kind: "POLICY" as const,
        subjectKey: "ancient-target",
        title: "ancient-target",
        content: "Old but alive.",
        links: [],
        pinnedCorrections: [],
        rewriteCount: 1,
        lastRewriteSource: "DOCUMENT:doc-1",
        createdAt: base - 10_000_000,
        updatedAt: base - 10_000_000,
      });
      for (let i = 0; i < 510; i++) {
        await ctx.db.insert("wikiPages", {
          companyId,
          kind: "PRODUCT" as const,
          subjectKey: `filler-${i}`,
          title: `filler-${i}`,
          content: "Filler.",
          links: [],
          pinnedCorrections: [],
          rewriteCount: 1,
          lastRewriteSource: "DOCUMENT:doc-1",
          createdAt: base - 1000 - i,
          updatedAt: base - 1000 - i,
        });
      }
      // The newest page links to both: the living ancient page, and a ghost.
      await ctx.db.insert("wikiPages", {
        companyId,
        kind: "POLICY" as const,
        subjectKey: "fresh-page",
        title: "fresh-page",
        content: "See [[ancient-target]].",
        links: ["POLICY:ancient-target", "POLICY:truly-gone"],
        pinnedCorrections: [],
        rewriteCount: 1,
        lastRewriteSource: "DOCUMENT:doc-1",
        createdAt: base,
        updatedAt: base,
      });
    });

    const candidates = await t.query(internal.wikiTending.getTendingCandidatesInternal, {
      companyId,
    });
    const repair = candidates.linkRepairs.find((entry) => entry.links.includes("POLICY:ancient-target"));
    // The ghost is confirmed dead by a point read and comes off; the old
    // living target — outside the window — is verified and kept.
    expect(repair).toBeDefined();
    expect(repair!.links).toEqual(["POLICY:ancient-target"]);
  });
});
