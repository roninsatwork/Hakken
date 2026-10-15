import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { sourceFields } from "./contentTranslation";
import { readPageKinds } from "./pageKinds";
import schema from "./schema";
import { APP_LANGUAGES } from "./utils/contentLanguages";
import { MOST_TYPES, SHIPPED_TYPES } from "./utils/classificationTypes";

/**
 * System Settings → Classification (docs/plans/active/classification-types-
 * plan.md): one list of page types for every company. A type is one field,
 * its name. The shipped seven need no row, a type added there is keyed by its
 * own id, and names are written once in English.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function setUp(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "korda.test", displayHost: "korda.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    const superId = await ctx.db.insert("users", { name: "Super", email: "super@hakken.test", role: "SUPER_ADMIN", createdAt: now });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@korda.test", role: "ADMIN", companyId, createdAt: now });
    await ctx.db.insert("holdPages", { companyWebsiteId: siteId, page: "/shops/london/", crawled: true, shown: true, clicks: 12, ranks: true });
    return { siteId, superId, adminId };
  });
}

/** A refusal's own sentence, read from the error's data. */
const said = (pattern: RegExp) => ({ data: { message: expect.stringMatching(pattern) } });

describe("classification types", () => {
  // A save asks the Translator; on fake timers it runs only when a test asks, never after the test.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("with no rows at all, the list is the shipped seven, in their order and every language", async () => {
    const t = harness();
    const { superId } = await setUp(t);
    const as = t.withIdentity({ subject: superId });

    const list = await as.query(api.classificationTypes.classificationTypeList, { language: "en" });
    expect(list.types.map((type) => [type.key, type.name, type.builtIn, type.classifications])).toEqual([
      ["INFORMATIONAL", "Informational content", true, 0],
      ["SERVICE", "Service", true, 0],
      ["PRODUCT", "Product", true, 0],
      ["CASE_STUDY", "Case study", true, 0],
      ["COMPANY", "Company", true, 0],
      ["LEGAL", "Legal", true, 0],
      ["OTHER", "Other", true, 0],
    ]);
    expect(list.most).toBe(MOST_TYPES);
    const italian = await as.query(api.classificationTypes.classificationTypeChoices, { language: "it" });
    expect(italian.map((type) => type.name)).toEqual(["Contenuti informativi", "Servizio", "Prodotto", "Caso di studio", "Azienda", "Note legali", "Altro"]);
  });

  test("every shipped type has its names in every language Hakken is read in", () => {
    for (const type of SHIPPED_TYPES) {
      for (const language of APP_LANGUAGES) expect(type.names[language], `${type.key} in ${language}`).toBeTruthy();
    }
  });

  test("only a super admin reads or changes the list", async () => {
    const t = harness();
    const { adminId } = await setUp(t);
    const admin = t.withIdentity({ subject: adminId });
    await expect(admin.query(api.classificationTypes.classificationTypeList, { language: "en" })).rejects.toThrow();
    await expect(admin.mutation(api.classificationTypes.saveClassificationType, { name: "Location page" })).rejects.toThrow();
  });

  test("an added type is keyed by its own id and offered to every classification", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const as = t.withIdentity({ subject: superId });

    const key = await as.mutation(api.classificationTypes.saveClassificationType, { name: "  Location   page " });
    const row = await t.run(async (ctx) => await ctx.db.get(key as Id<"classificationTypes">));
    expect(row).toMatchObject({ key, nameEn: "Location page", builtIn: false });

    const choices = await as.query(api.classificationTypes.classificationTypeChoices, { language: "en" });
    expect(choices.at(-1)).toEqual({ key, name: "Location page" });

    const classificationId = await as.mutation(api.pageClassifications.createPageClassification, {
      companyWebsiteId: siteId,
      name: "Shops",
      type: key,
      lines: [{ kind: "STARTS_WITH", value: "/shops/" }],
    });
    const kinds = await t.run(async (ctx) => {
      const read = await readPageKinds(ctx, siteId);
      return { kind: read?.kindOf("/shops/london/"), type: read?.typeOf(classificationId) };
    });
    expect(kinds).toEqual({ kind: classificationId, type: key });

    const list = await as.query(api.classificationTypes.classificationTypeList, { language: "en" });
    expect(list.types.find((type) => type.key === key)).toMatchObject({ builtIn: false, classifications: 1, more: false });
    expect(await as.query(api.classificationTypes.classificationTypeDetail, { key })).toMatchObject({ nameEn: "Location page", classifications: 1, websites: 1, builtIn: false });
  });

  test("a shipped type renamed gets a row of its own; until then its shipped names stand", async () => {
    const t = harness();
    const { superId } = await setUp(t);
    const as = t.withIdentity({ subject: superId });
    const italian = async () => (await as.query(api.classificationTypes.classificationTypeChoices, { language: "it" })).find((type) => type.key === "CASE_STUDY");

    // Saved unchanged, it stays as shipped: no row, its names in every language.
    await as.mutation(api.classificationTypes.saveClassificationType, { key: "CASE_STUDY", name: "Case study" });
    expect(await italian()).toEqual({ key: "CASE_STUDY", name: "Caso di studio" });
    expect(await t.run(async (ctx) => await ctx.db.query("classificationTypes").collect())).toEqual([]);

    // Renamed, a reader in Italian sees the English until the Translator makes their copy from it.
    await as.mutation(api.classificationTypes.saveClassificationType, { key: "CASE_STUDY", name: "Client story" });
    expect((await italian())?.name).toBe("Client story");
    const rows = await t.run(async (ctx) => await ctx.db.query("classificationTypes").collect());
    expect(rows.map((row) => [row.key, row.nameEn, row.builtIn])).toEqual([["CASE_STUDY", "Client story", true]]);
  });

  test("the Translator translates a shipped type only once it is renamed", () => {
    const row = (nameEn: string) => ({ key: "LEGAL", nameEn, builtIn: true }) as Doc<"classificationTypes">;
    expect(sourceFields("classificationTypes", row("Legal"))).toBeNull();
    expect(sourceFields("classificationTypes", row("Legal pages"))).toEqual({ name: "Legal pages" });
  });

  test("a name must be there, short enough, and no other type's, whatever its case", async () => {
    const t = harness();
    const { superId } = await setUp(t);
    const as = t.withIdentity({ subject: superId });
    await expect(as.mutation(api.classificationTypes.saveClassificationType, { name: "  " })).rejects.toMatchObject(said(/Give the type a name/));
    await expect(as.mutation(api.classificationTypes.saveClassificationType, { name: "x".repeat(41) })).rejects.toMatchObject(said(/at most 40/));
    await expect(as.mutation(api.classificationTypes.saveClassificationType, { name: "service" })).rejects.toMatchObject(said(/Another type already has that name/));
    // Its own name, unchanged, is no clash.
    expect(await as.mutation(api.classificationTypes.saveClassificationType, { key: "SERVICE", name: "Service" })).toBe("SERVICE");
  });

  test("there are at most fifty types, the shipped seven included", async () => {
    const t = harness();
    const { superId } = await setUp(t);
    const as = t.withIdentity({ subject: superId });
    await t.run(async (ctx) => {
      for (let index = 0; index < MOST_TYPES - SHIPPED_TYPES.length; index += 1) {
        await ctx.db.insert("classificationTypes", { key: `ADDED_${index}`, nameEn: `Added ${index}`, builtIn: false, createdAt: index, updatedAt: index });
      }
    });
    await expect(as.mutation(api.classificationTypes.saveClassificationType, { name: "One more" })).rejects.toMatchObject(said(/already 50 types/));
  });

  test("only an added type no classification uses is removed, with its translations", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const as = t.withIdentity({ subject: superId });

    await expect(as.mutation(api.classificationTypes.removeClassificationType, { key: "LEGAL" })).rejects.toThrow();
    const used = await as.mutation(api.classificationTypes.saveClassificationType, { name: "Location page" });
    await as.mutation(api.pageClassifications.createPageClassification, { companyWebsiteId: siteId, name: "Shops", type: used, lines: [] });
    await expect(as.mutation(api.classificationTypes.removeClassificationType, { key: used })).rejects.toMatchObject(said(/Classifications use this type/));

    const unused = await as.mutation(api.classificationTypes.saveClassificationType, { name: "Careers" });
    await t.run(async (ctx) => {
      await ctx.db.insert("contentTranslations", { owner: "classificationTypes", ownerId: unused, language: "it", fields: { name: "Lavora con noi" }, sourceHash: "x", translatedAt: 0 });
    });
    await as.mutation(api.classificationTypes.removeClassificationType, { key: unused });
    expect((await as.query(api.classificationTypes.classificationTypeChoices, { language: "en" })).map((type) => type.key)).not.toContain(unused);
    expect(await t.run(async (ctx) => await ctx.db.query("contentTranslations").collect())).toEqual([]);
  });

  test("a classification's type must be in the list", async () => {
    const t = harness();
    const { siteId, superId } = await setUp(t);
    const as = t.withIdentity({ subject: superId });
    await expect(as.mutation(api.pageClassifications.createPageClassification, { companyWebsiteId: siteId, name: "Shops", type: "NO_SUCH_TYPE", lines: [] }))
      .rejects.toMatchObject(said(/no longer in the list/));
    const classificationId = await as.mutation(api.pageClassifications.createPageClassification, { companyWebsiteId: siteId, name: "Shops", type: "OTHER", lines: [] });
    await expect(as.mutation(api.pageClassifications.updatePageClassification, { companyWebsiteId: siteId, classificationId, type: "NO_SUCH_TYPE" }))
      .rejects.toMatchObject(said(/no longer in the list/));
  });
});
