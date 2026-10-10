import { expect } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import type { Seen, SeenPhrase } from "@/convex/utils/hakkenSees";

/**
 * Every sentence and step of a What Hakken sees box has its words in English
 * and Italian (`sites.seen.<screen>`), and every step's link its name
 * (`sites.seen.links`), and each formats with the values `SiteSees` gives it:
 * a code without words would show its key on screen, and a slot the screen
 * does not fill would fail there.
 */
export function expectWords(screen: string, box: Seen) {
  for (const [locale, messages] of [["en", en], ["it", it]] as const) {
    const seen = messages.sites.seen as unknown as Record<string, Record<string, string> | undefined>;
    const t = createTranslator({ locale, messages, onError: (error) => { throw error; } }) as unknown as (key: string, values?: Record<string, string | number>) => string;
    const values = (phrase: SeenPhrase) => ({
      a: String(phrase.a ?? 0), b: String(phrase.b ?? 0), c: String(phrase.c ?? 0), count: phrase.a ?? 0,
      text: phrase.text ?? "", more: phrase.more ?? "", engine: phrase.engine ?? "",
    });
    // A code may name a group's own sentence: "fix.HOURS" is `fix` → `HOURS`.
    const wordsOf = (code: string) => code.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], seen[screen]);
    for (const phrase of [...box.says, ...box.steps]) {
      expect(wordsOf(phrase.code), `sites.seen.${screen}.${phrase.code}`).toBeTypeOf("string");
      expect(t(`sites.seen.${screen}.${phrase.code}`, values(phrase)), `${locale}: sites.seen.${screen}.${phrase.code}`).not.toMatch(/[{}]/);
    }
    for (const step of box.steps) expect(seen.links?.[step.link], `sites.seen.links.${step.link}`).toBeTypeOf("string");
  }
}
