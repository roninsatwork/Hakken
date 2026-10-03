import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { purgeHoldClassifications } from "./pageClassifications";
import schema from "./schema";

/**
 * A company's own classifications of its website's pages
 * (docs/plans/active/page-groups-plan.md, decision 6): set only by a super
 * admin, held to the website, the more exact line winning, and a page's
 * classification set, changed and removed in its row — removing a hand-set
 * one returns the page to its line; removing a line's takes it out of it.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** ronins.co.uk's own pages, cut down: [page, clicks, sitemap file]. */
const PAGES: Array<[string, number, string | undefined]> = [
  ["/ai-agency/", 453, "page-sitemap.xml"],
  ["/hub/kapferer-brand-identity-prism/", 414, "content-hub-sitemap.xml"],
  ["/", 150, "page-sitemap.xml"],
  ["/hub/bad-websites/", 122, "content-hub-sitemap.xml"],
  ["/venture-studio/", 62, "page-sitemap.xml"],
  ["/hub/guides/seo/", 40, "content-hub-sitemap.xml"],
  ["/author/anthony/", 15, undefined],
  ["/our-new-office/", 2, "post-sitemap.xml"],
];

async function setUp(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    const rivalWebsiteId = await ctx.db.insert("websites", { host: "rival.test", displayHost: "rival.test", firstSeenAt: now });
    const rivalId = await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalWebsiteId, relationship: "TRACKED", createdAt: now });
    // Another company watching the same website: its classifications are its own.
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other", createdAt: now });
    const otherSiteId = await ctx.db.insert("companyWebsites", { companyId: otherCompanyId, websiteId, relationship: "OWNED", createdAt: now });
    const superId = await ctx.db.insert("users", { name: "Super", email: "super@ronins.test", role: "SUPER_ADMIN", createdAt: now });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@ronins.test", role: "ADMIN", companyId, createdAt: now });
    for (const hold of [siteId, otherSiteId]) {
      for (const [page, clicks, sitemapFile] of PAGES) {
        await ctx.db.insert("holdPages", { companyWebsiteId: hold, page, sitemapFile, crawled: true, shown: clicks > 0, clicks, ranks: true, builtAt: now });
      }
    }
    return { companyId, siteId, rivalId, otherCompanyId, otherSiteId, superId, adminId };
  });
}

type Line = { kind: "STARTS_WITH" | "CONTAINS" | "EXACT" | "SITEMAP_FILE"; value: string };

function asSuper(t: Harness, superId: Id<"users">) {
  const as = t.withIdentity({ subject: superId });
  return {
    as,
    create: (companyWebsiteId: Id<"companyWebsites">, name: string, lines: Line[], type: "INFORMATIONAL" | "SERVICE" | "COMPANY" | "OTHER" = "OTHER") =>
      as.mutation(api.pageClassifications.createPageClassification, { companyWebsiteId, name, type, lines }),
    pages: (companyWebsiteId: Id<"companyWebsites">, extra: { search?: string; classification?: Id<"pageClassifications"> | "NOT_SORTED"; page?: number; rows?: number } = {}) =>
      as.query(api.pageClassifications.pageClassificationPages, { companyWebsiteId, page: 1, rows: 15, ...extra }),
  };
}

const rowOf = (data: { rows: Array<{ page: string }> } | null, page: string) => data?.rows.find((row) => row.page === page);

/** A refusal's own sentence: its quotes arrive escaped in the error's text, so it is read from the error's data. */
const said = (pattern: RegExp) => ({ data: { message: expect.stringMatching(pattern) } });

describe("page classifications", () => {
  test("the more exact line wins, through the Pages and Classifications reads", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);

    const hubFile = await s.create(siteId, "Hub file", [{ kind: "SITEMAP_FILE", value: "content-hub-sitemap.xml" }]);
    const hubWord = await s.create(siteId, "Anything hub", [{ kind: "CONTAINS", value: "hub" }]);
    const hub = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }], "INFORMATIONAL");
    const guides = await s.create(siteId, "Guides", [{ kind: "STARTS_WITH", value: "/hub/guides/" }]);
    const bad = await s.create(siteId, "Bad websites", [{ kind: "EXACT", value: "/hub/bad-websites/" }]);
    const journal = await s.create(siteId, "Journal", [{ kind: "SITEMAP_FILE", value: "post-sitemap.xml" }]);

    const data = await s.pages(siteId);
    // An exact address beats a "starts with"; a longer start beats a shorter; a start beats a part; a sitemap file comes last.
    expect(rowOf(data, "/hub/bad-websites/")).toMatchObject({ classificationId: bad, how: "BY_LINE", line: { kind: "EXACT", value: "/hub/bad-websites/" } });
    expect(rowOf(data, "/hub/guides/seo/")).toMatchObject({ classificationId: guides, how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hub/guides/" } });
    expect(rowOf(data, "/hub/kapferer-brand-identity-prism/")).toMatchObject({ classificationId: hub, how: "BY_LINE" });
    expect(rowOf(data, "/our-new-office/")).toMatchObject({ classificationId: journal, how: "BY_LINE", line: { kind: "SITEMAP_FILE", value: "post-sitemap.xml" } });
    expect(rowOf(data, "/author/anthony/")).toMatchObject({ classificationId: null, how: "NONE", line: null });
    // Most clicks first.
    expect(data?.rows.map((row) => row.clicks)).toEqual([453, 414, 150, 122, 62, 40, 15, 2]);
    expect(data?.summary).toMatchObject({ pages: 8, sorted: 4, notSorted: 4, cut: false, pagesRead: 10_000, classifications: 6, lines: 6, picks: 0 });
    expect(data?.summary.limits).toEqual({ classifications: 25, lines: 100, picks: 1_000 });

    const list = await s.as.query(api.pageClassifications.pageClassificationList, { companyWebsiteId: siteId });
    const count = (id: Id<"pageClassifications">) => list?.classifications.find((row) => row._id === id)?.pages;
    expect([count(hubFile), count(hubWord), count(hub), count(guides), count(bad), count(journal)]).toEqual([0, 0, 1, 1, 1, 1]);
    expect(list?.classifications.find((row) => row._id === hub)).toMatchObject({ name: "Content hub", type: "INFORMATIONAL", lines: [{ kind: "STARTS_WITH", value: "/hub/" }] });
  });

  test("searches, filters by one classification or Not sorted, and pages on the server", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const hub = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);

    expect((await s.pages(siteId, { search: "HUB" }))?.rows.map((row) => row.page)).toEqual([
      "/hub/kapferer-brand-identity-prism/", "/hub/bad-websites/", "/hub/guides/seo/",
    ]);
    const filtered = await s.pages(siteId, { classification: hub });
    expect(filtered?.total).toBe(3);
    const notSorted = await s.pages(siteId, { classification: "NOT_SORTED" });
    expect(notSorted?.rows.map((row) => row.page)).toEqual(["/ai-agency/", "/", "/venture-studio/", "/author/anthony/", "/our-new-office/"]);
    // The summary counts every page, whatever the filter.
    expect(notSorted?.summary).toMatchObject({ pages: 8, sorted: 3, notSorted: 5 });

    const second = await s.pages(siteId, { page: 2, rows: 3 });
    expect(second).toMatchObject({ page: 2, totalPages: 3, total: 8 });
    expect(second?.rows.map((row) => row.page)).toEqual(["/hub/bad-websites/", "/venture-studio/", "/hub/guides/seo/"]);
    // A page past the end shows the last.
    expect((await s.pages(siteId, { page: 9, rows: 3 }))?.page).toBe(3);
  });

  test("sets, changes and removes a page's classification; removing goes back to its line, or takes it out of the line", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const hub = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);
    const company = await s.create(siteId, "Company", [{ kind: "EXACT", value: "/" }], "COMPANY");
    const set = (pages: string[], classificationId: Id<"pageClassifications">) =>
      s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId, pages });
    const remove = (page: string) => s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: siteId, page });

    // A page no line catches: set by hand, changed, then removed — Not sorted again.
    await set(["/author/anthony/"], company);
    expect(rowOf(await s.pages(siteId), "/author/anthony/")).toMatchObject({ classificationId: company, how: "BY_HAND", underneath: null });
    await set(["/author/anthony/"], hub);
    expect(rowOf(await s.pages(siteId), "/author/anthony/")).toMatchObject({ classificationId: hub, how: "BY_HAND" });
    expect(await remove("/author/anthony/")).toEqual({ classificationId: null, how: "NONE" });
    expect(rowOf(await s.pages(siteId), "/author/anthony/")).toMatchObject({ classificationId: null, how: "NONE" });

    // Set by hand over a line: removing it goes back to the line.
    await set(["/hub/bad-websites/"], company);
    expect(rowOf(await s.pages(siteId), "/hub/bad-websites/")).toMatchObject({ classificationId: company, how: "BY_HAND", underneath: hub });
    expect(await remove("/hub/bad-websites/")).toEqual({ classificationId: hub, how: "BY_LINE" });
    expect(rowOf(await s.pages(siteId), "/hub/bad-websites/")).toMatchObject({ classificationId: hub, how: "BY_LINE" });

    // Given by a line: removing takes it out of the line — Not sorted until set again.
    expect(await remove("/hub/kapferer-brand-identity-prism/")).toEqual({ classificationId: null, how: "TAKEN_OUT" });
    const after = await s.pages(siteId);
    expect(rowOf(after, "/hub/kapferer-brand-identity-prism/")).toMatchObject({ classificationId: null, how: "TAKEN_OUT", underneath: hub });
    expect(after?.summary).toMatchObject({ sorted: 3, notSorted: 5, picks: 1 });
    // Removing again changes nothing.
    expect(await remove("/hub/kapferer-brand-identity-prism/")).toEqual({ classificationId: null, how: "TAKEN_OUT" });
    await set(["/hub/kapferer-brand-identity-prism/"], hub);
    expect(rowOf(await s.pages(siteId), "/hub/kapferer-brand-identity-prism/")).toMatchObject({ classificationId: hub, how: "BY_HAND" });
    expect((await s.pages(siteId))?.summary.picks).toBe(1);

    const actions = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).map((row) => row.actionType));
    expect(actions.filter((action) => action === "SET_PAGE_CLASSIFICATION")).toHaveLength(4);
    expect(actions.filter((action) => action === "REMOVE_PAGE_CLASSIFICATION_FROM_PAGE")).toHaveLength(3);
  });

  test("sets several ticked pages at once, each address as classifications compare it", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const company = await s.create(siteId, "Company", [], "COMPANY");

    const result = await s.as.mutation(api.pageClassifications.setPageClassification, {
      companyWebsiteId: siteId,
      classificationId: company,
      pages: ["/ai-agency/", "/VENTURE-studio/#team", "https://ronins.test/venture-studio/", "/author/anthony/"],
    });
    expect(result).toEqual({ set: 3 });
    const data = await s.pages(siteId, { classification: company });
    expect(data?.rows.map((row) => [row.page, row.how])).toEqual([
      ["/ai-agency/", "BY_HAND"], ["/venture-studio/", "BY_HAND"], ["/author/anthony/", "BY_HAND"],
    ]);
    await expect(s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: company, pages: [" "] }))
      .rejects.toThrow(/at least one page/);
  });

  test("refuses each limit, naming it and where to raise it", async () => {
    const t = harness();
    const { companyId, siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutLimits", {
        companyId, companyWebsiteId: siteId, classificationsPerSite: 10, classificationLinesPerSite: 50, classifiedPagesPerSite: 250, updatedAt: Date.now(),
      });
    });

    for (let index = 0; index < 10; index += 1) await s.create(siteId, `Group ${index}`, index === 0 ? [] : [{ kind: "CONTAINS", value: `word${index}` }]);
    await expect(s.create(siteId, "Eleventh", [])).rejects.toMatchObject(said(/can have 10 classifications\. Raise "Classifications per website" on its Limits page/));

    // Group 0 has no lines; the other nine have one each.
    const list = await s.as.query(api.pageClassifications.pageClassificationList, { companyWebsiteId: siteId });
    const first = list!.classifications[0]._id;
    const lines = Array.from({ length: 42 }, (_, index) => ({ kind: "CONTAINS" as const, value: `extra${index}` }));
    await expect(s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: siteId, classificationId: first, lines }))
      .rejects.toMatchObject(said(/can have 50 address lines in all, and this would make 51\. Raise "Address lines per website" on its Limits page/));
    await s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: siteId, classificationId: first, lines: lines.slice(0, 41) });
    await expect(s.as.mutation(api.pageClassifications.addPageClassificationLine, { companyWebsiteId: siteId, classificationId: first, kind: "EXACT", value: "/cookies/" }))
      .rejects.toMatchObject(said(/this would make 51\. Raise "Address lines per website"/));
    // At the limit, lines can still be changed one for another, or cut.
    await s.as.mutation(api.pageClassifications.updatePageClassification, {
      companyWebsiteId: siteId, classificationId: first, lines: [...lines.slice(0, 40), { kind: "EXACT", value: "/cookies/" }],
    });

    const pages = Array.from({ length: 250 }, (_, index) => `/page-${index}/`);
    await s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: first, pages });
    // Setting pages already set adds none.
    await s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: first, pages: pages.slice(0, 5) });
    await expect(s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: first, pages: ["/ai-agency/"] }))
      .rejects.toMatchObject(said(/can have 250 pages set by hand or taken out of a line, and this would make 251\. Raise "Pages set by hand per website" on its Limits page/));
  });

  test("taking a page out of its line is held to the pages-by-hand limit", async () => {
    const t = harness();
    const { companyId, siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: siteId, classifiedPagesPerSite: 250, updatedAt: Date.now() });
    });
    const hub = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);
    await s.as.mutation(api.pageClassifications.setPageClassification, {
      companyWebsiteId: siteId, classificationId: hub, pages: Array.from({ length: 250 }, (_, index) => `/page-${index}/`),
    });
    await expect(s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: siteId, page: "/hub/bad-websites/" }))
      .rejects.toThrow(/Pages set by hand per website/);
    // Removing one set by hand frees a place, and is never refused.
    await s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: siteId, page: "/page-0/" });
    await expect(s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: siteId, page: "/hub/bad-websites/" }))
      .resolves.toEqual({ classificationId: null, how: "TAKEN_OUT" });
  });

  test("a competitor has no classifications: refused, read and write", async () => {
    const t = harness();
    const { rivalId, superId } = await setUp(t);
    const s = asSuper(t, superId);

    await expect(s.create(rivalId, "Content hub", [])).rejects.toThrow(/competitor/);
    await expect(s.pages(rivalId)).rejects.toThrow(/competitor/);
    await expect(s.as.query(api.pageClassifications.pageClassificationList, { companyWebsiteId: rivalId })).rejects.toThrow(/competitor/);
    await expect(s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: rivalId, page: "/" })).rejects.toThrow(/competitor/);
  });

  test("a company admin can neither read nor set them: super admin only", async () => {
    const t = harness();
    const { siteId, superId, adminId } = await setUp(t);
    const hub = await asSuper(t, superId).create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);
    const admin = t.withIdentity({ subject: adminId });

    await expect(admin.mutation(api.pageClassifications.createPageClassification, { companyWebsiteId: siteId, name: "Mine", type: "OTHER", lines: [] })).rejects.toThrow();
    await expect(admin.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: hub, pages: ["/"] })).rejects.toThrow();
    await expect(admin.mutation(api.pageClassifications.removePageClassification, { companyWebsiteId: siteId, classificationId: hub })).rejects.toThrow();
    await expect(admin.query(api.pageClassifications.pageClassificationPages, { companyWebsiteId: siteId, page: 1, rows: 15 })).rejects.toThrow();
    await expect(admin.query(api.pageClassifications.pageClassificationList, { companyWebsiteId: siteId })).rejects.toThrow();
  });

  test("another company's website is never read or written through this one", async () => {
    const t = harness();
    const { siteId, otherSiteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const ours = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);
    const theirs = await s.create(otherSiteId, "Their hub", [{ kind: "STARTS_WITH", value: "/hub/" }, { kind: "EXACT", value: "/" }]);
    await s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: otherSiteId, classificationId: theirs, pages: ["/author/anthony/"] });
    const theirLine = await t.run(async (ctx) => (await ctx.db.query("pageClassificationLines").collect()).find((line) => line.classificationId === theirs)!._id);

    // Their classification is not ours to set, change, remove or read.
    await expect(s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: theirs, pages: ["/"] }))
      .rejects.toThrow(/not one of this website's/);
    await expect(s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: siteId, classificationId: theirs, name: "Taken" }))
      .rejects.toThrow(/not one of this website's/);
    await expect(s.as.mutation(api.pageClassifications.removePageClassification, { companyWebsiteId: siteId, classificationId: theirs }))
      .rejects.toThrow(/not one of this website's/);
    await expect(s.as.mutation(api.pageClassifications.removePageClassificationLine, { companyWebsiteId: siteId, lineId: theirLine }))
      .rejects.toThrow(/not one of this website's/);
    expect(await s.as.query(api.pageClassifications.pageClassificationDetail, { companyWebsiteId: siteId, classificationId: theirs })).toBeNull();
    expect(await s.as.query(api.pageClassifications.pageClassificationPreview, { companyWebsiteId: siteId, classificationId: theirs, lines: [] })).toBeNull();

    // Our reads see only ours: their lines and their hand-set page change nothing here.
    const data = await s.pages(siteId);
    expect(data?.classifications.map((row) => row._id)).toEqual([ours]);
    expect(rowOf(data, "/")).toMatchObject({ classificationId: null, how: "NONE" });
    expect(rowOf(data, "/author/anthony/")).toMatchObject({ classificationId: null, how: "NONE" });
    // The same line on both websites is no clash: each website's lines are its own.
    expect((await s.pages(otherSiteId))?.classifications.map((row) => row.name)).toEqual(["Their hub"]);

    // Removing a page's classification here leaves theirs alone.
    await s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: siteId, page: "/hub/bad-websites/" });
    expect(rowOf(await s.pages(otherSiteId), "/hub/bad-websites/")).toMatchObject({ classificationId: theirs, how: "BY_LINE" });
    expect(await t.run(async (ctx) => ctx.db.get(theirs))).not.toBeNull();
  });

  test("checks names and lines, and keeps each line as classifications compare it", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const hub = await s.create(siteId, "  Content   hub ", [
      { kind: "STARTS_WITH", value: "HUB/" },
      { kind: "SITEMAP_FILE", value: "https://ronins.test/Content-Hub-Sitemap.xml" },
      { kind: "EXACT", value: "https://ronins.test" },
      { kind: "CONTAINS", value: " Brand " },
    ]);
    const detail = await s.as.query(api.pageClassifications.pageClassificationDetail, { companyWebsiteId: siteId, classificationId: hub });
    expect(detail?.name).toBe("Content hub");
    expect(detail?.lines.map(({ kind, value }) => [kind, value])).toEqual([
      ["STARTS_WITH", "/hub/"], ["SITEMAP_FILE", "content-hub-sitemap.xml"], ["EXACT", "/"], ["CONTAINS", "brand"],
    ]);

    await expect(s.create(siteId, " ", [])).rejects.toThrow(/Give the classification a name/);
    await expect(s.create(siteId, "content HUB", [])).rejects.toMatchObject(said(/already has a classification called "Content hub"/));
    await expect(s.create(siteId, "Not sorted", [])).rejects.toThrow(/Not sorted/);
    await expect(s.create(siteId, "x".repeat(61), [])).rejects.toThrow(/60 characters/);
    await expect(s.create(siteId, "Everything", [{ kind: "STARTS_WITH", value: "/" }])).rejects.toThrow(/would catch every page/);
    await expect(s.create(siteId, "Dashes", [{ kind: "CONTAINS", value: "--" }])).rejects.toThrow(/word or a number/);
    await expect(s.create(siteId, "Blank", [{ kind: "EXACT", value: "  " }])).rejects.toThrow(/part of the address/);
    await expect(s.create(siteId, "Spaced", [{ kind: "CONTAINS", value: "web design" }])).rejects.toThrow(/no spaces/);
    await expect(s.create(siteId, "Query", [{ kind: "CONTAINS", value: "?page=2" }])).rejects.toMatchObject(said(/after "#" or "\?"/));
    await expect(s.create(siteId, "Again", [{ kind: "STARTS_WITH", value: "/HUB/" }])).rejects.toMatchObject(said(/already on "Content hub"/));
    await expect(s.create(siteId, "Twice", [{ kind: "EXACT", value: "/terms/" }, { kind: "EXACT", value: "/TERMS/" }])).rejects.toThrow(/listed twice/);
    expect((await s.as.query(api.pageClassifications.pageClassificationList, { companyWebsiteId: siteId }))?.classifications).toHaveLength(1);
  });

  test("saves a classification's page: its name, type and lines as they now read", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const hub = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }, { kind: "CONTAINS", value: "brand" }]);
    const kept = (await s.as.query(api.pageClassifications.pageClassificationDetail, { companyWebsiteId: siteId, classificationId: hub }))!.lines[0]._id;

    await s.as.mutation(api.pageClassifications.updatePageClassification, {
      companyWebsiteId: siteId,
      classificationId: hub,
      name: "Hub",
      type: "INFORMATIONAL",
      lines: [{ kind: "STARTS_WITH", value: "/hub/" }, { kind: "SITEMAP_FILE", value: "post-sitemap.xml" }],
    });
    const detail = await s.as.query(api.pageClassifications.pageClassificationDetail, { companyWebsiteId: siteId, classificationId: hub });
    expect(detail).toMatchObject({ name: "Hub", type: "INFORMATIONAL" });
    expect(detail?.lines.map(({ kind, value }) => [kind, value])).toEqual([["STARTS_WITH", "/hub/"], ["SITEMAP_FILE", "post-sitemap.xml"]]);
    // A line kept is the same line.
    expect(detail?.lines[0]._id).toBe(kept);

    // Renaming alone keeps the lines; saving what is already saved changes nothing.
    await s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: siteId, classificationId: hub, name: "Content hub" });
    await s.as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: siteId, classificationId: hub, name: "Content hub", type: "INFORMATIONAL" });
    expect((await s.as.query(api.pageClassifications.pageClassificationDetail, { companyWebsiteId: siteId, classificationId: hub }))?.lines).toHaveLength(2);
    const updates = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).filter((row) => row.actionType === "UPDATE_PAGE_CLASSIFICATION"));
    expect(updates).toHaveLength(2);

    const added = await s.as.mutation(api.pageClassifications.addPageClassificationLine, { companyWebsiteId: siteId, classificationId: hub, kind: "EXACT", value: "/venture-studio/" });
    expect(rowOf(await s.pages(siteId), "/venture-studio/")).toMatchObject({ classificationId: hub, how: "BY_LINE" });
    await s.as.mutation(api.pageClassifications.removePageClassificationLine, { companyWebsiteId: siteId, lineId: added });
    expect(rowOf(await s.pages(siteId), "/venture-studio/")).toMatchObject({ classificationId: null, how: "NONE" });
  });

  test("removing a classification takes its lines and the pages set to it by hand", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const hub = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);
    const words = await s.create(siteId, "Anything hub", [{ kind: "CONTAINS", value: "hub" }]);
    await s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: hub, pages: ["/author/anthony/"] });
    await s.as.mutation(api.pageClassifications.removeClassificationFromPage, { companyWebsiteId: siteId, page: "/hub/bad-websites/" });

    expect(await s.as.mutation(api.pageClassifications.removePageClassification, { companyWebsiteId: siteId, classificationId: hub }))
      .toEqual({ lines: 1, pagesByHand: 1 });

    const data = await s.pages(siteId);
    // Its pages go to the next line that catches them, or Not sorted; a page taken out stays out.
    expect(rowOf(data, "/hub/kapferer-brand-identity-prism/")).toMatchObject({ classificationId: words, how: "BY_LINE" });
    expect(rowOf(data, "/author/anthony/")).toMatchObject({ classificationId: null, how: "NONE" });
    expect(rowOf(data, "/hub/bad-websites/")).toMatchObject({ classificationId: null, how: "TAKEN_OUT" });
    expect(data?.summary).toMatchObject({ classifications: 1, lines: 1, picks: 1 });
    expect(await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).some((row) => row.actionType === "REMOVE_PAGE_CLASSIFICATION"))).toBe(true);
  });

  test("previews the pages a classification's lines would give it, before it is saved", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const bad = await s.create(siteId, "Bad websites", [{ kind: "EXACT", value: "/hub/bad-websites/" }]);
    const hub = await s.create(siteId, "Content hub", []);
    await s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: hub, pages: ["/author/anthony/"] });
    const preview = (lines: Line[], classificationId?: Id<"pageClassifications">) =>
      s.as.query(api.pageClassifications.pageClassificationPreview, { companyWebsiteId: siteId, classificationId, lines });

    const live = await preview([
      { kind: "STARTS_WITH", value: "/hub/" },
      { kind: "STARTS_WITH", value: "/" },
      { kind: "EXACT", value: "/hub/bad-websites/" },
      { kind: "CONTAINS", value: "studio" },
    ], hub);
    // The exact line on Bad websites still wins its page; the page set by hand is counted.
    expect(live?.rows.map((row) => [row.page, row.how])).toEqual([
      ["/hub/kapferer-brand-identity-prism/", "BY_LINE"], ["/venture-studio/", "BY_LINE"], ["/hub/guides/seo/", "BY_LINE"], ["/author/anthony/", "BY_HAND"],
    ]);
    expect(live).toMatchObject({ total: 4, byHand: 1, cut: false });
    expect(live?.lines).toEqual([
      { catches: 2, problem: null, on: null },
      { catches: 0, problem: "EVERY_PAGE", on: null },
      { catches: 0, problem: "TAKEN", on: "Bad websites" },
      { catches: 1, problem: null, on: null },
    ]);

    // A classification not yet saved, with no id.
    const fresh = await preview([{ kind: "SITEMAP_FILE", value: "post-sitemap.xml" }, { kind: "SITEMAP_FILE", value: "POST-sitemap.xml" }]);
    expect(fresh?.rows.map((row) => row.page)).toEqual(["/our-new-office/"]);
    expect(fresh?.lines.map((line) => line.problem)).toEqual([null, "TWICE"]);
    // Bad websites' own page, previewed, keeps its exact line.
    expect((await preview([{ kind: "EXACT", value: "/hub/bad-websites/" }], bad))?.lines).toEqual([{ catches: 1, problem: null, on: null }]);
  });

  test("a website's classifications go with it", async () => {
    const t = harness();
    const { siteId, otherSiteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    const hub = await s.create(siteId, "Content hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);
    await s.as.mutation(api.pageClassifications.setPageClassification, { companyWebsiteId: siteId, classificationId: hub, pages: ["/"] });
    await s.create(otherSiteId, "Their hub", [{ kind: "STARTS_WITH", value: "/hub/" }]);

    await t.run(async (ctx) => purgeHoldClassifications(ctx, siteId));
    const left = await t.run(async (ctx) => ({
      classifications: (await ctx.db.query("pageClassifications").collect()).map((row) => row.companyWebsiteId),
      lines: (await ctx.db.query("pageClassificationLines").collect()).map((row) => row.companyWebsiteId),
      picks: (await ctx.db.query("pageClassificationPicks").collect()).length,
    }));
    expect(left).toEqual({ classifications: [otherSiteId], lines: [otherSiteId], picks: 0 });
  });
});

describe("the suggested start", () => {
  test("makes one classification per section of the website's own, named in words, with its line", async () => {
    const t = harness();
    const { siteId, otherSiteId, superId } = await setUp(t);
    const s = asSuper(t, superId);

    const result = await s.as.mutation(api.pageClassifications.suggestPageClassifications, { companyWebsiteId: siteId });
    // ronins.co.uk's own, cut down: the hub's sitemap file is all in /hub/; the posts sitemap lists one page; the page sitemap is everything.
    expect(result).toEqual({ created: 2, names: ["Content hub", "Posts"], overLimit: 0 });
    const list = await s.as.query(api.pageClassifications.pageClassificationList, { companyWebsiteId: siteId });
    expect(list?.classifications.map((row) => [row.name, row.type, row.lines.map((line) => `${line.kind} ${line.value}`), row.pages])).toEqual([
      ["Content hub", "INFORMATIONAL", ["STARTS_WITH /hub/"], 3],
      ["Posts", "INFORMATIONAL", ["SITEMAP_FILE post-sitemap.xml"], 1],
    ]);
    // The service pages at the top level are left to classify.
    expect(list?.summary).toMatchObject({ sorted: 4, notSorted: 4 });
    // Only this website: the other company's, on the same website, has none.
    expect((await s.as.query(api.pageClassifications.pageClassificationList, { companyWebsiteId: otherSiteId }))?.classifications).toEqual([]);

    // Asked again, nothing new: its names and lines are taken.
    expect(await s.as.mutation(api.pageClassifications.suggestPageClassifications, { companyWebsiteId: siteId })).toEqual({ created: 0, names: [], overLimit: 0 });
  });

  test("skips a name or a line the website has already, and stops at its limits", async () => {
    const t = harness();
    const { companyId, siteId, superId } = await setUp(t);
    const s = asSuper(t, superId);
    // The hub's line is taken already, under another name.
    await s.create(siteId, "Hub", [{ kind: "STARTS_WITH", value: "/hub/" }], "INFORMATIONAL");
    expect(await s.as.mutation(api.pageClassifications.suggestPageClassifications, { companyWebsiteId: siteId })).toEqual({ created: 1, names: ["Posts"], overLimit: 0 });

    // A second website at its limit of classifications: what would be made is counted, not made.
    const full = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "full.test", displayHost: "full.test", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
      for (const [page, file] of [["/hub/a/", "content-hub-sitemap.xml"], ["/hub/b/", "content-hub-sitemap.xml"], ["/a-post/", "post-sitemap.xml"]]) {
        await ctx.db.insert("holdPages", { companyWebsiteId: holdId, page, sitemapFile: file, crawled: true, shown: true, clicks: 1, ranks: true, builtAt: Date.now() });
      }
      await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: holdId, classificationsPerSite: 10, updatedAt: Date.now() });
      return holdId;
    });
    for (let index = 0; index < 9; index += 1) await s.create(full, `Section ${index}`, [{ kind: "EXACT", value: `/section-${index}/` }]);
    expect(await s.as.mutation(api.pageClassifications.suggestPageClassifications, { companyWebsiteId: full })).toEqual({ created: 1, names: ["Content hub"], overLimit: 1 });
  });

  test("super admin only, and never a competitor's", async () => {
    const t = harness();
    const { siteId, rivalId, superId, adminId } = await setUp(t);
    await expect(t.withIdentity({ subject: adminId }).mutation(api.pageClassifications.suggestPageClassifications, { companyWebsiteId: siteId })).rejects.toThrow();
    await expect(t.withIdentity({ subject: superId }).mutation(api.pageClassifications.suggestPageClassifications, { companyWebsiteId: rivalId })).rejects.toThrow();
  });
});
