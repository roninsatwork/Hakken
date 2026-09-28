import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { followPlatformWhereStartingNumber, readCompanyDataLimits, readSiteDataLimits } from "./companyDataLimits";
import { readFanOutLimits } from "./fanOutLimits";
import { LIMIT_KEYS, LIMITS } from "./platformLimits";
import { parseAiOverviewFanOuts } from "./aiOverviewFanOuts";
import { readSharedLimits, SHARED_LIMIT_KEYS } from "./sharedLimits";
import en from "@/messages/en.json";
import it_ from "@/messages/it.json";
import { LIMIT_TOPICS, LIMIT_UNITS } from "@/src/app/(dashboard)/admin/_components/limits/limitTopics";

/**
 * Limits on three levels (docs/plans/active/platform-limits-plan.md). Anthony,
 * 2026-09-28: "it should be Platform - company - website", a company that can
 * "inherit the platform default but we can override", and a website the same
 * one level down — for the Data limits and the fan-out ones alike.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Anthony", email: `a-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

async function company(t: Harness, name: string, host: string, relationship: "OWNED" | "TRACKED" = "OWNED") {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship, createdAt: Date.now() });
    return { companyId, holdId };
  });
}

describe("limits on three levels", () => {
  test("a website's own, else its company's, else the platform's, else Hakken's starting number", async () => {
    const t = harness();
    const { companyId, holdId } = await company(t, "Korda", "kordatackle.com");
    const admin = await superAdmin(t);
    const read = async () => await t.run(async (ctx) => ({
      site: { ...(await readSiteDataLimits(ctx, companyId, holdId)), ...(await readFanOutLimits(ctx, companyId, holdId)) },
      company: { ...(await readCompanyDataLimits(ctx, companyId)), ...(await readFanOutLimits(ctx, companyId)) },
    }));

    expect((await read()).site).toMatchObject({ keywordsPerSite: 1_000, anglesShown: 1_000, promptsPerSite: LIMITS.promptsPerSite.start });

    await admin.mutation(api.platformLimits.setPlatformLimits, { limits: { keywordsPerSite: 2_500, anglesShown: 500 } });
    expect((await read()).site).toMatchObject({ keywordsPerSite: 2_500, anglesShown: 500 });

    await admin.mutation(api.platformLimits.setCompanyLimits, { companyId, limits: { keywordsPerSite: 5_000, anglesShown: 250 } });
    expect((await read()).site).toMatchObject({ keywordsPerSite: 5_000, anglesShown: 250 });

    await admin.mutation(api.platformLimits.setSiteLimits, { companyWebsiteId: holdId, limits: { keywordsPerSite: 10_000, anglesShown: 3_000 } });
    expect(await read()).toMatchObject({
      site: { keywordsPerSite: 10_000, anglesShown: 3_000 },
      company: { keywordsPerSite: 5_000, anglesShown: 250 },
    });

    // Back to the platform's: the company keeps nothing of its own, and the website keeps its own.
    await admin.mutation(api.platformLimits.setCompanyLimits, { companyId, limits: { keywordsPerSite: null, anglesShown: null } });
    expect(await read()).toMatchObject({
      site: { keywordsPerSite: 10_000, anglesShown: 3_000 },
      company: { keywordsPerSite: 2_500, anglesShown: 500 },
    });
    expect(await t.run(async (ctx) => ({
      data: await ctx.db.query("companyDataLimits").collect(),
      fanOut: (await ctx.db.query("fanOutLimits").collect()).filter((row) => row.companyWebsiteId === undefined),
    }))).toEqual({ data: [], fanOut: [] });
  });

  test("a whole-company limit stops at the company", async () => {
    const t = harness();
    const { companyId, holdId } = await company(t, "Korda", "kordatackle.com");
    const admin = await superAdmin(t);
    expect(LIMITS.purchasesPerCollection.reach).toBe("company");

    await expect(admin.mutation(api.platformLimits.setSiteLimits, { companyWebsiteId: holdId, limits: { purchasesPerCollection: 5_000 } }))
      .rejects.toThrow();
    await admin.mutation(api.platformLimits.setCompanyLimits, { companyId, limits: { purchasesPerCollection: 5_000 } });
    expect((await t.run(async (ctx) => await readFanOutLimits(ctx, companyId, holdId))).purchasesPerCollection).toBe(5_000);
    expect((await admin.query(api.platformLimits.getSiteLimits, { companyWebsiteId: holdId }))?.keys).not.toContain("purchasesPerCollection");
  });

  test("the platform takes only the listed choices, only from a super admin, and every change is audited", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    await expect(admin.mutation(api.platformLimits.setPlatformLimits, { limits: { keywordsPerSite: 1_234 } })).rejects.toThrow();
    await expect(admin.mutation(api.platformLimits.setPlatformLimits, { limits: { notALimit: 100 } })).rejects.toThrow();

    const { companyId } = await company(t, "Ronins Agency", "ronins.co.uk");
    const companyAdmin = t.withIdentity({
      subject: await t.run(async (ctx) => await ctx.db.insert("users", { email: "admin@ronins.co.uk", role: "ADMIN", companyId })),
    });
    await expect(companyAdmin.mutation(api.platformLimits.setPlatformLimits, { limits: { keywordsPerSite: 2_500 } })).rejects.toThrow();
    await expect(companyAdmin.query(api.platformLimits.getPlatformLimits, {})).rejects.toThrow();

    await admin.mutation(api.platformLimits.setPlatformLimits, { limits: { keywordsPerSite: 2_500 } });
    // The same number again changes nothing, so it records nothing.
    await admin.mutation(api.platformLimits.setPlatformLimits, { limits: { keywordsPerSite: 2_500 } });
    const audits = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).filter((row) => row.actionType === "PLATFORM_LIMITS_CHANGED"));
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].metadata ?? "{}")).toEqual({ changes: [{ field: "keywordsPerSite", from: 1_000, to: 2_500 }] });
    expect((await admin.query(api.platformLimits.getPlatformLimits, {})).values.keywordsPerSite).toBe(2_500);
  });

  test("names who one level down has a number of their own, and what is built in", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins Agency", "ronins.co.uk");
    await company(t, "Korda", "kordatackle.com");
    const admin = await superAdmin(t);
    await admin.mutation(api.platformLimits.setCompanyLimits, { companyId: ronins.companyId, limits: { backlinksPerSite: 500 } });
    await admin.mutation(api.platformLimits.setSiteLimits, { companyWebsiteId: ronins.holdId, limits: { keywordsPerSite: 10_000 } });

    const platform = await admin.query(api.platformLimits.getPlatformLimits, {});
    expect(platform.others.backlinksPerSite).toEqual([{ id: ronins.companyId, name: "Ronins Agency", value: 500 }]);
    expect(platform.others.keywordsPerSite).toBeUndefined();
    expect(Object.keys(platform.values).sort()).toEqual([...LIMIT_KEYS].sort());
    // What was fixed in code until 2026-09-28 starts at the number it was.
    expect(platform.values).toMatchObject({ fanOutPerAnswer: 50, competitorsPerSite: 100, rowsPerDownload: 50_000 });

    const own = await admin.query(api.platformLimits.getCompanyLimits, { companyId: ronins.companyId });
    expect(own?.own).toMatchObject({ backlinksPerSite: 500, keywordsPerSite: null });
    expect(own?.platform).toMatchObject({ backlinksPerSite: 1_000 });
    expect(own?.others.keywordsPerSite).toEqual([{ id: ronins.holdId, name: "ronins.co.uk", value: 10_000 }]);
    // The platform's own limits: shown to the company, never its to set.
    expect(own?.shared).toMatchObject({ fanOutPerAnswer: 50, sourcesPerAnswer: 40 });
    expect(Object.keys(own?.own ?? {})).not.toContain("fanOutPerAnswer");
  });

  test("the platform alone sets what every company shares, and the code reads it", async () => {
    const t = harness();
    const { companyId, holdId } = await company(t, "Korda", "kordatackle.com");
    const admin = await superAdmin(t);
    expect(SHARED_LIMIT_KEYS.every((key) => LIMITS[key].reach === "platform")).toBe(true);

    await admin.mutation(api.platformLimits.setPlatformLimits, { limits: { fanOutPerAnswer: 100, rowsPerDownload: 10_000 } });
    expect(await t.run(async (ctx) => await readSharedLimits(ctx))).toMatchObject({ fanOutPerAnswer: 100, rowsPerDownload: 10_000, sourcesPerAnswer: 40 });
    expect((await admin.query(api.platformLimits.getCompanyLimits, { companyId }))?.shared).toMatchObject({ fanOutPerAnswer: 100 });

    await expect(admin.mutation(api.platformLimits.setCompanyLimits, { companyId, limits: { fanOutPerAnswer: 25 } })).rejects.toThrow();
    await expect(admin.mutation(api.platformLimits.setSiteLimits, { companyWebsiteId: holdId, limits: { rowsPerDownload: 25_000 } })).rejects.toThrow();
    await expect(admin.mutation(api.platformLimits.setPlatformLimits, { limits: { fanOutPerAnswer: 70 } })).rejects.toThrow();
    expect((await admin.query(api.platformLimits.getSiteLimits, { companyWebsiteId: holdId }))?.keys).not.toContain("fanOutPerAnswer");

    // The AI Overview searches kept from one purchase follow it too, the most run first.
    const result = [{ items: [{ fan_out_queries: ["carp rigs", "carp bait", "carp rigs"] }, { fan_out_queries: ["carp rigs", "zig rigs"] }] }];
    expect(parseAiOverviewFanOuts(result, 1).map((search) => search.query)).toEqual(["carp rigs"]);
  });

  test("competitors collected per website on three levels, and never on a competitor", async () => {
    const t = harness();
    const { companyId, holdId } = await company(t, "Korda", "kordatackle.com");
    const rival = await company(t, "Korda", "nashtackle.co.uk", "TRACKED");
    const admin = await superAdmin(t);
    const site = async () => (await t.run(async (ctx) => await readFanOutLimits(ctx, companyId, holdId))).competitorsPerSite;

    expect(await site()).toBe(100);
    await admin.mutation(api.platformLimits.setPlatformLimits, { limits: { competitorsPerSite: 50 } });
    expect(await site()).toBe(50);
    await admin.mutation(api.platformLimits.setCompanyLimits, { companyId, limits: { competitorsPerSite: 25 } });
    expect(await site()).toBe(25);
    await admin.mutation(api.platformLimits.setSiteLimits, { companyWebsiteId: holdId, limits: { competitorsPerSite: 10 } });
    expect(await site()).toBe(10);
    expect((await admin.query(api.platformLimits.getSiteLimits, { companyWebsiteId: rival.holdId }))?.keys).not.toContain("competitorsPerSite");
  });

  test("a competitor's Limits offer only how much of it is kept", async () => {
    const t = harness();
    const { holdId } = await company(t, "Korda", "nashtackle.co.uk", "TRACKED");
    const admin = await superAdmin(t);

    const limits = await admin.query(api.platformLimits.getSiteLimits, { companyWebsiteId: holdId });
    expect(limits).toMatchObject({ competitor: true, keys: ["keywordsPerSite", "everydayKeywords", "backlinksPerSite"] });
    await admin.mutation(api.platformLimits.setSiteLimits, { companyWebsiteId: holdId, limits: { backlinksPerSite: 100 } });
    await expect(admin.mutation(api.platformLimits.setSiteLimits, { companyWebsiteId: holdId, limits: { anglesShown: 500 } })).rejects.toThrow();
  });

  test("a company's saved 1,000s become the platform's, and any other number stays its own", async () => {
    const t = harness();
    const korda = await company(t, "Korda", "kordatackle.com");
    const ronins = await company(t, "Ronins Agency", "ronins.co.uk");
    await t.run(async (ctx) => {
      await ctx.db.insert("companyDataLimits", { companyId: korda.companyId, keywordsPerSite: 1_000, backlinksPerSite: 1_000, updatedAt: 1 });
      await ctx.db.insert("companyDataLimits", { companyId: ronins.companyId, keywordsPerSite: 1_000, backlinksPerSite: 500, updatedAt: 1 });
    });

    const result = await t.run(async (ctx) => await followPlatformWhereStartingNumber(ctx, null, 100));
    expect(result).toMatchObject({ isDone: true, processed: 2, updated: 2 });
    const rows = await t.run(async (ctx) => await ctx.db.query("companyDataLimits").collect());
    expect(rows.map(({ companyId, keywordsPerSite, backlinksPerSite }) => ({ companyId, keywordsPerSite, backlinksPerSite })))
      .toEqual([{ companyId: ronins.companyId, keywordsPerSite: undefined, backlinksPerSite: 500 }]);
    // Nothing collected changes: both still read the same numbers.
    expect(await t.run(async (ctx) => await readCompanyDataLimits(ctx, korda.companyId))).toEqual({ keywordsPerSite: 1_000, backlinksPerSite: 1_000, everydayKeywords: 1_000 });
    expect(await t.run(async (ctx) => await readCompanyDataLimits(ctx, ronins.companyId))).toMatchObject({ keywordsPerSite: 1_000, backlinksPerSite: 500 });
  });
});

/**
 * The Limits screens read their words by key — `fields.<limit>.label` — which
 * the messages guard cannot see, so this holds the list together: every limit
 * here sits in exactly one of the screens' topics, says what it counts, and has
 * its words in English and Italian. A limit added without them fails here
 * rather than showing a key path on screen.
 */
type Words = Record<string, { label?: string; description?: string; cost?: string }>;

describe("the Limits screens' list", () => {
  test("puts every limit in exactly one topic, and nothing else", () => {
    const listed = LIMIT_TOPICS.flatMap((topic) => topic.keys);
    expect([...listed].sort()).toEqual([...LIMIT_KEYS].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  test("says what every limit counts, and words it in both languages", () => {
    for (const [lang, messages] of [["en", en], ["it", it_]] as const) {
      const fields = messages.admin.limits.fields as Words;
      for (const key of LIMIT_KEYS) {
        expect(LIMIT_UNITS[key], key).toBeDefined();
        expect(fields[key], `${lang} ${key}`).toMatchObject({ label: expect.any(String), description: expect.any(String), cost: expect.any(String) });
      }
      for (const topic of LIMIT_TOPICS) {
        expect(messages.admin.limits.topics[topic.id], `${lang} ${topic.id}`)
          .toMatchObject({ title: expect.any(String), intro: expect.any(String), footer: expect.any(String) });
      }
    }
  });

  test("never says angle: it is a topic on every screen (Anthony, 2026-09-28: \"yes topic is good\")", () => {
    const text = (value: unknown): string[] =>
      typeof value === "string" ? [value] : Object.values(value as Record<string, unknown>).flatMap(text);
    for (const messages of [en, it_]) {
      expect(text(messages).filter((words) => /\bangles?\b|\bangol[oi]\b/i.test(words))).toEqual([]);
    }
  });
});
