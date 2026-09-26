/**
 * How the Sites tables search (docs/plans/active/sites-table-pages-plan.md,
 * T8): every word typed must start a word of one of the row's texts — its
 * keyword, an address, an anchor — a different word each, all in the same
 * text. "rod" finds "rods" and "rod pod" but not "products"; "carp ro" finds
 * "carp rods"; "c.com" finds c.com and not b.com, whose "com" cannot stand
 * for both the "c" and the "com" typed. Plain "contains" would find "rod" inside
 * "products", and Convex's search index matches only the start of the last
 * word, in best-match order that cannot be sorted by a column or counted past
 * 1,024 — so the big lists search here instead.
 *
 * Words split on anything that is not a letter or a digit, in any language,
 * and compare without case: a web address is words too, so "kaizen" finds
 * "/products/kaizen-green". Shared by the server's lists and the lists a Sites
 * page holds whole, so both answer the same search the same way.
 */
export function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** A test of a row's texts against what was typed, or null when nothing was: an empty search narrows nothing. */
export function wordStartMatcher(typed: string | null | undefined): ((...texts: Array<string | null | undefined>) => boolean) | null {
  // Longest first, so a short word typed cannot take the one word a longer
  // one needs ("c" would otherwise take "com" from "com").
  const wanted = wordsOf(typed ?? "").sort((left, right) => right.length - left.length);
  if (wanted.length === 0) return null;
  const within = (words: string[]) => {
    const used = new Set<number>();
    return wanted.every((part) => {
      const index = words.findIndex((word, at) => !used.has(at) && word.startsWith(part));
      if (index < 0) return false;
      used.add(index);
      return true;
    });
  };
  return (...texts) => texts.some((text) => Boolean(text) && within(wordsOf(text as string)));
}
