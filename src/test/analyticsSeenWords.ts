import { expect } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import type { Seen, SeenPhrase } from "@/convex/utils/hakkenSees";

/**
 * Every sentence and step of a Google Analytics What Hakken sees box has its
 * words in English and Italian (`googleAnalytics.seen.<screen>`), and every
 * step's link its name (`googleAnalytics.seen.links`), and each formats with
 * the values `AnalyticsSees` gives it — numbers, money, shares, plurals and a
 * conversion's own name — as Visibility's `expectWords` holds its boxes: a code
 * without words would show its key on screen, and a slot the screen does not
 * fill would fail there.
 */
export function expectAnalyticsWords(screen: string, box: Seen) {
  for (const [locale, messages] of [["en", en], ["it", it]] as const) {
    const seen = (messages.googleAnalytics as unknown as { seen: Record<string, Record<string, unknown> | undefined> }).seen;
    const t = createTranslator({ locale, messages, onError: (error) => { throw error; } }) as unknown as (key: string, values?: Record<string, string | number>) => string;
    const values = (phrase: SeenPhrase) => ({
      a: String(phrase.a ?? 0), b: String(phrase.b ?? 0), c: String(phrase.c ?? 0),
      aMoney: "£1", bMoney: "£2", cMoney: "£3", aRate: "1%", bRate: "2%", cRate: "3%",
      count: phrase.a ?? 0, countB: phrase.b ?? 0, countC: phrase.c ?? 0,
      text: phrase.text ?? "", more: phrase.more ?? "", event: phrase.text ?? "",
    });
    // A code may name a group's own sentence: "lead.down.up" is `lead` → `down` → `up`.
    const wordsOf = (code: string) => code.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], seen[screen]);
    for (const phrase of [...box.says, ...box.steps]) {
      expect(wordsOf(phrase.code), `googleAnalytics.seen.${screen}.${phrase.code}`).toBeTypeOf("string");
      expect(t(`googleAnalytics.seen.${screen}.${phrase.code}`, values(phrase)), `${locale}: googleAnalytics.seen.${screen}.${phrase.code}`).not.toMatch(/[{}]/);
    }
    for (const step of box.steps) expect(seen.links?.[step.link], `googleAnalytics.seen.links.${step.link}`).toBeTypeOf("string");
  }
}
