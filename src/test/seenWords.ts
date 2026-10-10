import { expect } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import type { Seen } from "@/convex/utils/hakkenSees";

/**
 * Every sentence and step of a What Hakken sees box has its words in English
 * and Italian (`sites.seen.<screen>`), and every step's link its name
 * (`sites.seen.links`): a code without words would show its key on screen.
 */
export function expectWords(screen: string, box: Seen) {
  for (const messages of [en, it]) {
    const seen = messages.sites.seen as unknown as Record<string, Record<string, string> | undefined>;
    for (const phrase of [...box.says, ...box.steps]) expect(seen[screen]?.[phrase.code], `sites.seen.${screen}.${phrase.code}`).toBeTypeOf("string");
    for (const step of box.steps) expect(seen.links?.[step.link], `sites.seen.links.${step.link}`).toBeTypeOf("string");
  }
}
