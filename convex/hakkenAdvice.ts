import { v } from "convex/values";
import { IntlMessageFormat } from "intl-messageformat";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { tenantMutation } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { shiftDay } from "./searchConsoleDays";
import { appError } from "./utils/appError";
import { seenAdvice, seenValidator, MOST_SAYS, MOST_STEPS, type SeenPhrase } from "./utils/hakkenSees";
import seenWords from "./utils/seenWords.json";
import { AI_ENGINE_NAMES } from "./seoAiEngines";

/**
 * What Hakken advised (docs/plans/active/search-console-volatility-plan.md §8,
 * HS4, HS5, HS7). A screen's What Hakken sees is worked out by its rules on
 * its own figures; when it shows, it is saved here — once a screen a day per
 * website, the newest advice that day — so Ask Hakken says what the screens
 * say, in their words, and the company has a record of what Hakken advised
 * and when.
 *
 * Saved as codes and numbers, never words: each code is checked against the
 * screen's real sentences (`seenWords.json`, cut from `messages/`), so what
 * is saved can only ever be one of Hakken's own sentences, with the names and
 * numbers it fills in — nobody's words of their own reach Ask Hakken.
 */

/** Days advice is kept: the record of what Hakken advised. */
export const ADVICE_KEPT_DAYS = 90;
/** Old records cleared per save, so a save never reads much. */
const CLEARED_PER_SAVE = 10;
/** The longest name a sentence quotes (a keyword, an update, a page). */
const MOST_TEXT = 300;

type Language = "en" | "it";
type Words = Record<string, unknown>;
const WORDS = seenWords as unknown as Record<Language, Record<string, Words>>;

/** A screen's words, "searchConsole.seen.volatility" → its namespace's sentences for that screen, and the namespace's links. */
function screenWords(screen: string, language: Language): { sentences: Words; links: Words; namespace: string } | null {
  const at = screen.lastIndexOf(".");
  const namespace = screen.slice(0, at);
  const book = WORDS[language][namespace] as Record<string, Words> | undefined;
  const sentences = book?.[screen.slice(at + 1)];
  if (!book || !sentences || typeof sentences !== "object") return null;
  return { sentences, links: (book.links ?? {}) as Words, namespace };
}

/** A code's sentence: "fix.HOURS" is `fix` → `HOURS`. */
const sentenceOf = (sentences: Words, code: string): string | null => {
  const found = code.split(".").reduce<unknown>((node, part) => (node as Words | undefined)?.[part], sentences);
  return typeof found === "string" ? found : null;
};

/** The day it is, as the record files it. */
const today = (now: number) => new Date(now).toISOString().slice(0, 10);

/**
 * A screen's box, saved when it shows: the screen's own sentences only, for one of the company's websites. Called by
 * the box on screen (`useNoteAdvice`), at most once a day per screen and advice.
 */
export const noteAdvice = tenantMutation({
  args: { siteId: v.id("companyWebsites"), screen: v.string(), path: v.string(), seen: seenValidator, currency: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const words = screenWords(args.screen, "en");
    if (!words) throw appError("INVALID_INPUT", "That is not a screen that gives advice.");
    const parts = [...args.seen.says, ...args.seen.steps];
    if (args.seen.says.length === 0 || args.seen.says.length > MOST_SAYS || args.seen.steps.length > MOST_STEPS) throw appError("INVALID_INPUT", "A box says one to three things.");
    for (const part of parts) {
      if (!sentenceOf(words.sentences, part.code)) throw appError("INVALID_INPUT", "That is not one of the screen's sentences.");
      if ((part.text?.length ?? 0) > MOST_TEXT || (part.more?.length ?? 0) > MOST_TEXT) throw appError("INVALID_INPUT", "A name in a sentence is too long.");
    }
    if (!/^\/app\/[^\s]{1,300}$/.test(args.path)) throw appError("INVALID_INPUT", "The screen's address is not one of the app's.");
    const now = Date.now();
    const day = today(now);
    const holdId = site.hold._id;
    const advice = seenAdvice(args.seen);
    const held = await ctx.db
      .query("hakkenAdvice")
      .withIndex("by_hold_screen_day", (q) => q.eq("companyWebsiteId", holdId).eq("screen", args.screen).eq("day", day))
      .first();
    const record = { seen: args.seen, advice, path: args.path, notedAt: now, ...(args.currency ? { currency: args.currency } : {}) };
    if (held && held.advice === advice && JSON.stringify(held.seen) === JSON.stringify(args.seen)) return null;
    if (held) await ctx.db.patch(held._id, record);
    else await ctx.db.insert("hakkenAdvice", { companyId: site.hold.companyId, companyWebsiteId: holdId, screen: args.screen, day, ...record });
    // Kept 90 days: the oldest of this screen's records cleared a few at a time, as each new one is saved.
    const old = await ctx.db
      .query("hakkenAdvice")
      .withIndex("by_hold_screen_day", (q) => q.eq("companyWebsiteId", holdId).eq("screen", args.screen).lt("day", shiftDay(day, -ADVICE_KEPT_DAYS)))
      .take(CLEARED_PER_SAVE);
    for (const row of old) await ctx.db.delete(row._id);
    return null;
  },
});

// ── Advice in words, as the screens write it ────────────────────────────────

const MONTHS: Record<Language, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"],
  it: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
};
/** Each engine by its name, as the screens name it (`engineLabel.ts`); the searches Google's AI Overviews ran, too. */
const ENGINES: Record<string, string> = { ...AI_ENGINE_NAMES, google_ai_overview: "Google AI Overviews" };

/** A day as the screens write it: "24 Sept". */
const shortDay = (day: string | undefined, language: Language) => {
  if (!day) return "";
  const [, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[language][month - 1] ?? ""}`;
};
const grouped = (value: number, language: Language) => {
  const whole = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, language === "it" ? "." : ",");
  return whole;
};
/**
 * A figure as its box writes it: whole for a count; otherwise one decimal for a
 * small figure — and, on Search Console's boxes, for any (a position of 18.2).
 */
const figure = (value: number | undefined, language: Language, everyDecimal = false) => {
  const number = value ?? 0;
  return Number.isInteger(number) || (!everyDecimal && Math.abs(number) >= 10) ? grouped(number, language) : number.toFixed(1);
};
const money = (hundredths: number | undefined, currency: string | undefined) => {
  const value = (hundredths ?? 0) / 100;
  const symbol = ({ GBP: "£", EUR: "€", USD: "$" } as Record<string, string>)[currency ?? "GBP"] ?? `${currency} `;
  return `${symbol}${Math.abs(value) < 10 && value % 1 !== 0 ? value.toFixed(2) : grouped(value, "en")}`;
};
const rate = (share: number | undefined) => {
  const percent = (share ?? 0) * 100;
  return `${percent.toFixed(percent > 0 && percent < 1 ? 2 : 1)}%`;
};

function valuesOf(phrase: SeenPhrase, language: Language, currency: string | undefined, everyDecimal: boolean): Record<string, string | number> {
  return {
    a: figure(phrase.a, language, everyDecimal),
    b: figure(phrase.b, language, everyDecimal),
    c: figure(phrase.c, language, everyDecimal),
    count: phrase.a ?? 0,
    countB: phrase.b ?? 0,
    countC: phrase.c ?? 0,
    aMoney: money(phrase.a, currency),
    bMoney: money(phrase.b, currency),
    cMoney: money(phrase.c, currency),
    aRate: rate(phrase.a),
    bRate: rate(phrase.b),
    cRate: rate(phrase.c),
    text: phrase.text ?? "",
    more: phrase.more ?? "",
    period: phrase.period ?? "other",
    event: (phrase.text ?? "").split(",").filter(Boolean).map((name) => `“${name}”`).join(", "),
    engine: phrase.engine ? ENGINES[phrase.engine] ?? phrase.engine : "",
    day1: shortDay(phrase.days?.[0], language),
    day2: shortDay(phrase.days?.[1], language),
  };
}

/** A saved box in words: its sentences and its steps, each with the link's words and the screen to do it on. */
export type AdviceInWords = { screen: string; day: string; path: string; says: string; steps: Array<{ words: string; link: string }> };

export function adviceInWords(record: Pick<Doc<"hakkenAdvice">, "screen" | "day" | "path" | "seen" | "currency">, language: string): AdviceInWords | null {
  const lang: Language = language === "it" ? "it" : "en";
  const words = screenWords(record.screen, lang) ?? screenWords(record.screen, "en");
  if (!words) return null;
  const write = (phrase: SeenPhrase) => {
    const sentence = sentenceOf(words.sentences, phrase.code);
    if (!sentence) return "";
    try {
      return String(new IntlMessageFormat(sentence, lang === "en" ? "en-GB" : lang).format(valuesOf(phrase, lang, record.currency, words.namespace === "searchConsole.seen")));
    } catch {
      return "";
    }
  };
  return {
    screen: record.screen,
    day: record.day,
    path: record.path,
    says: record.seen.says.map(write).filter(Boolean).join(" "),
    steps: record.seen.steps.map((step) => ({ words: write(step), link: typeof words.links[step.link] === "string" ? (words.links[step.link] as string) : step.link })),
  };
}

/** Advice older than this is no longer what the screen says: not read to Ask Hakken. */
const FRESH_DAYS = 14;
/** Records read for one website: every screen's newest, with room. */
const ADVICE_READ = 300;

/** Each screen's newest advice for one website, in words: what Ask Hakken is told the screens say (HS7). */
export async function latestAdvice(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, language: string, now = Date.now()): Promise<AdviceInWords[]> {
  const rows = await ctx.db
    .query("hakkenAdvice")
    .withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).gte("day", shiftDay(today(now), -FRESH_DAYS)))
    .order("desc")
    .take(ADVICE_READ);
  const newest = new Map<string, Doc<"hakkenAdvice">>();
  for (const row of rows) if (!newest.has(row.screen)) newest.set(row.screen, row);
  return [...newest.values()].flatMap((row) => {
    const words = adviceInWords(row, language);
    return words ? [words] : [];
  });
}

/** One website's advice in words, for Ask Hakken: the company's own websites only. */
export const latestAdviceInternal = internalQuery({
  args: { companyId: v.id("companies"), holdId: v.id("companyWebsites"), language: v.string() },
  returns: v.array(v.object({
    screen: v.string(),
    day: v.string(),
    path: v.string(),
    says: v.string(),
    steps: v.array(v.object({ words: v.string(), link: v.string() })),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || hold.companyId !== args.companyId) return [];
    return await latestAdvice(ctx, args.holdId, args.language);
  },
});
