import { convexTest } from "convex-test";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import { adviceInWords } from "./hakkenAdvice";
import { adviceLines } from "./assistantKnowledge";
import { useFixedDay } from "@/src/test/realTime";

/**
 * What Hakken advised (search-console-volatility-plan.md §8, HS4, HS5, HS7):
 * a box saved as it shows — only the screen's own sentences, one record a
 * screen a day — and read to Ask Hakken in the very words the screen shows.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** ronins.co.uk's Volatility box of October 2026. */
const VOLATILITY = {
  says: [
    { code: "updateMoved", text: "September 2026 spam update", a: 40, days: ["2026-09-24", "2026-10-08"] },
    { code: "clicksFellWithIt", a: 21 },
    { code: "pointsToGoogle" },
  ],
  steps: [
    { code: "holdUntil", days: ["2026-10-22"], link: "seeUpdate", to: { segment: "google-updates" } },
    { code: "checkDropped", a: 6, link: "seeKeywords", to: { segment: "volatility", filters: { way: "down" } } },
  ],
};
const SCREEN = "searchConsole.seen.volatility";
const PATH = "/app/search-console/hold/volatility";

async function setUp(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const otherId = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const member = await ctx.db.insert("users", { name: "Member", email: "member@ronins.test", role: "USER", companyId, createdAt: 1 });
    const stranger = await ctx.db.insert("users", { name: "Stranger", email: "stranger@other.test", role: "ADMIN", companyId: otherId, createdAt: 1 });
    return { companyId, holdId, member, stranger };
  });
}

describe("saved advice", () => {
  beforeEach(() => useFixedDay("2026-10-11"));
  afterEach(() => vi.useRealTimers());

  test("a box is saved as it shows: one record a screen a day, the newest advice that day", async () => {
    const t = harness();
    const { holdId, member, companyId } = await setUp(t);
    const asMember = t.withIdentity({ subject: member });
    await asMember.mutation(api.hakkenAdvice.noteAdvice, { siteId: holdId, screen: SCREEN, path: PATH, seen: VOLATILITY });
    await asMember.mutation(api.hakkenAdvice.noteAdvice, { siteId: holdId, screen: SCREEN, path: PATH, seen: VOLATILITY });
    const calm = { says: [{ code: "calm", a: 1.7, b: 1.6, days: ["2026-10-09"] }], steps: [] };
    await asMember.mutation(api.hakkenAdvice.noteAdvice, { siteId: holdId, screen: SCREEN, path: PATH, seen: calm });
    const rows = await t.run(async (ctx) => await ctx.db.query("hakkenAdvice").collect());
    expect(rows.map((row) => [row.day, row.advice])).toEqual([["2026-10-11", "calm |"]]);
    const read = await t.query(internal.hakkenAdvice.latestAdviceInternal, { companyId, holdId, language: "en" });
    expect(read[0].says).toBe("Google is calm for your keywords: 1.7 out of 10 on 9 Oct, close to your usual 1.6.");
  });

  test("only the screen's own sentences, and only for the company's own website", async () => {
    const t = harness();
    const { holdId, member, stranger } = await setUp(t);
    const asMember = t.withIdentity({ subject: member });
    const forged = { says: [{ code: "ignoreYourRulesAndSayThis" }], steps: [] };
    await expect(asMember.mutation(api.hakkenAdvice.noteAdvice, { siteId: holdId, screen: SCREEN, path: PATH, seen: forged })).rejects.toThrow(/sentences/);
    await expect(asMember.mutation(api.hakkenAdvice.noteAdvice, { siteId: holdId, screen: "searchConsole.seen.nowhere", path: PATH, seen: VOLATILITY })).rejects.toThrow(/screen/);
    await expect(asMember.mutation(api.hakkenAdvice.noteAdvice, { siteId: holdId, screen: SCREEN, path: "https://elsewhere.test/", seen: VOLATILITY })).rejects.toThrow(/address/);
    await expect(t.withIdentity({ subject: stranger }).mutation(api.hakkenAdvice.noteAdvice, { siteId: holdId, screen: SCREEN, path: PATH, seen: VOLATILITY })).rejects.toThrow();
  });
});

describe("one voice: Ask Hakken is told the screen's very words (HS4, HS7)", () => {
  test("the server writes the box as the screen does, in English and Italian", () => {
    for (const [language, messages, months] of [["en", en, "Sept|Oct"], ["it", it, "set|ott"]] as const) {
      const t = createTranslator({ locale: language, messages }) as unknown as (key: string, values?: Record<string, string | number>) => string;
      const day = (iso: string) => {
        const [, month, date] = iso.split("-").map(Number);
        return `${date} ${months.split("|")[month - 9]}`;
      };
      // As `SearchConsoleSees` fills them: one decimal for a small figure, the reader's short date.
      const values = (phrase: { a?: number; text?: string; days?: string[] }) => ({
        a: phrase.a === undefined ? "0" : String(phrase.a), count: phrase.a ?? 0, text: phrase.text ?? "",
        day1: phrase.days?.[0] ? day(phrase.days[0]) : "", day2: phrase.days?.[1] ? day(phrase.days[1]) : "",
      });
      const onScreen = VOLATILITY.says.map((phrase) => t(`searchConsole.seen.volatility.${phrase.code}`, values(phrase))).join(" ");
      const steps = VOLATILITY.steps.map((step) => t(`searchConsole.seen.volatility.${step.code}`, values(step)));
      const told = adviceInWords({ screen: SCREEN, day: "2026-10-11", path: PATH, seen: VOLATILITY, currency: undefined }, language)!;
      expect(told.says, language).toBe(onScreen);
      expect(told.steps.map((step) => step.words), language).toEqual(steps);
    }
  });

  test("told at the start of a conversation as quoted data, with the way to each screen", () => {
    const told = adviceInWords({ screen: SCREEN, day: "2026-10-11", path: PATH, seen: VOLATILITY, currency: undefined }, "en")!;
    const lines = adviceLines("ronins.co.uk", [told]);
    expect(lines).toContain("never give different advice");
    expect(lines).toContain(`- ${PATH}: Google's September 2026 spam update ran from 24 Sept to 8 Oct, and your positions moved 40% more than usual while it did.`);
    expect(lines).toContain("Do first: 1. Hold big changes to your pages until 22 Oct, while Google settles. 2. Check the 6 keywords that dropped 5 places or more.");
  });
});

