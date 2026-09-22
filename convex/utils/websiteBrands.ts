/**
 * What a website calls itself, and how to find those names in someone's prose.
 *
 * Two jobs, kept in one pure file because they are two halves of one idea: the
 * rules for storing a brand name exist to make the matching below possible, and
 * the matching is the only reason the names are stored at all.
 *
 * Nothing here touches the database, so both halves can be tested against saved
 * engine responses. A matching bug is then fixed by re-running over payloads we
 * already hold, rather than by buying the answers again.
 */

export const MAX_BRAND_NAMES = 5;

/** The shortest name worth storing. Two characters match almost any prose. */
export const MIN_BRAND_NAME_LENGTH = 3;

export type BrandVariantKind = "NAME" | "MISSPELLING";

/**
 * `kind` is optional on the way in and absent reads as a correct name, so
 * everything saved before it existed keeps meaning what it meant.
 */
export type BrandName = { name: string; isPrimary: boolean; kind?: BrandVariantKind };

export type BrandNamesProblem =
  | "EMPTY"
  | "TOO_MANY"
  | "TOO_SHORT"
  | "DUPLICATE"
  | "NO_PRIMARY";

export const BRAND_NAME_MESSAGES: Record<BrandNamesProblem, string> = {
  EMPTY: "Enter at least one name this website goes by.",
  TOO_MANY: `A website can have at most ${MAX_BRAND_NAMES} names.`,
  TOO_SHORT: `Each name needs at least ${MIN_BRAND_NAME_LENGTH} characters.`,
  DUPLICATE: "That name is already on the list.",
  NO_PRIMARY: "Add at least one correctly spelled name; a misspelling cannot be the main one.",
};

/**
 * Tidy a submitted list, or say what is wrong with it.
 *
 * The cap is enforced here rather than only in the form, because a limit that
 * lives in a screen is a limit that the next caller does not have.
 *
 * Comparison for duplicates is case-insensitive and whitespace-collapsed, so
 * "Ronins Group" and "ronins  group" are the same name rather than two.
 */
export function readBrandNames(
  input: ReadonlyArray<{ name: string; isPrimary?: boolean; kind?: BrandVariantKind }>,
):
  | { ok: true; names: BrandName[] }
  | { ok: false; problem: BrandNamesProblem } {
  const trimmed = input
    .map((entry) => ({
      name: collapse(entry.name),
      isPrimary: entry.isPrimary === true,
      kind: entry.kind === "MISSPELLING" ? "MISSPELLING" as const : "NAME" as const,
    }))
    .filter((entry) => entry.name.length > 0);

  if (trimmed.length === 0) return { ok: false, problem: "EMPTY" };
  if (trimmed.length > MAX_BRAND_NAMES) return { ok: false, problem: "TOO_MANY" };

  const seen = new Set<string>();
  for (const entry of trimmed) {
    if (entry.name.length < MIN_BRAND_NAME_LENGTH) return { ok: false, problem: "TOO_SHORT" };
    const key = entry.name.toLowerCase();
    if (seen.has(key)) return { ok: false, problem: "DUPLICATE" };
    seen.add(key);
  }

  // Exactly one primary, and never a misspelling: the primary is what screens
  // print, and printing a client's name wrong on their own dashboard is worse
  // than picking a different one. A list that names none gets the first
  // correct name, because a screen has to print something.
  const asked = trimmed.findIndex((entry) => entry.isPrimary && entry.kind === "NAME");
  const firstCorrect = trimmed.findIndex((entry) => entry.kind === "NAME");
  if (firstCorrect === -1) return { ok: false, problem: "NO_PRIMARY" };
  const chosen = asked === -1 ? firstCorrect : asked;

  return {
    ok: true,
    names: trimmed.map((entry, index) => ({
      name: entry.name,
      isPrimary: index === chosen,
      kind: entry.kind,
    })),
  };
}

/** The name a screen prints when it has room for one. */
export function primaryBrandName(names: ReadonlyArray<BrandName> | undefined): string | null {
  if (!names || names.length === 0) return null;
  return (names.find((entry) => entry.isPrimary) ?? names[0]).name;
}

/**
 * Whether any of a site's names appears in a passage of text.
 *
 * Three things this gets right, each of which would otherwise show up as a
 * wrong number on a screen.
 *
 * **Once per site, never once per name.** A response saying "Ronins Agency"
 * matches both "Ronins" and "Ronins Agency". Counting both would inflate every
 * figure, so this answers a question about the site, not about the list.
 *
 * **Whole words only.** Without it a customer called Apex is cited every time
 * an engine says "apexes", and a customer called Nova is cited by "Nova
 * Scotia". Word boundaries are the cheapest guard against a class of false
 * positive that would otherwise need a human to spot.
 *
 * **The longest name wins the report.** When several match, the most specific
 * is the one worth telling somebody about: "Ronins Agency" says more than
 * "Ronins", and it is the one the engine actually wrote.
 */
export function findBrandMention(
  text: string,
  names: ReadonlyArray<BrandName>,
): { matched: string; kind: BrandVariantKind; at: number } | null {
  const haystack = collapse(text).toLowerCase();
  if (haystack.length === 0) return null;

  let best: BrandName | null = null;
  let bestAt = -1;
  for (const entry of names) {
    const needle = entry.name.toLowerCase();
    const at = indexOfWholeWord(haystack, needle);
    if (at === -1) continue;
    if (best === null || entry.name.length > best.name.length) {
      best = entry;
      bestAt = at;
    }
  }

  return best === null ? null : { matched: best.name, kind: best.kind ?? "NAME", at: bestAt };
}

/**
 * A whole-word search that does not need a regular expression.
 *
 * Built by hand because a brand name is user text: turning it into a pattern
 * means escaping it, and an escaping mistake in a matcher that runs over every
 * engine response is a silent wrong answer rather than a crash.
 */
function indexOfWholeWord(haystack: string, needle: string): number {
  if (needle.length === 0) return -1;

  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;

    const before = at === 0 ? " " : haystack[at - 1];
    const afterIndex = at + needle.length;
    const after = afterIndex >= haystack.length ? " " : haystack[afterIndex];

    if (!isWordCharacter(before) && !isWordCharacter(after)) return at;
    from = at + 1;
  }
}

function isWordCharacter(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

/** Trim, and collapse every run of whitespace to one space. */
function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}


/**
 * Whether two web addresses are worth asking about at all.
 *
 * Candidate generation stays in code, as TypeSafe's own guidance has it: a
 * cheap, rough first pass picks the pairs worth a closer look, and the model
 * only judges those. Asking about every pair would be a paid question per
 * tracked website per cited domain, for answers that are almost always "no".
 *
 * The test is a shared meaningful word between the two addresses' own names,
 * or between one address and a name the other goes by. `acme-plumbing.co.uk`
 * and `acmeplumbing.com` share "acmeplumbing" once punctuation is dropped;
 * `acme-plumbing.co.uk` and `rival.com` share nothing.
 */
export function couldBeSameBusiness(
  seenHost: string,
  tracked: { host: string; brandNames: ReadonlyArray<BrandName> },
): boolean {
  const seen = addressWords(seenHost);
  if (seen.size === 0) return false;

  for (const word of addressWords(tracked.host)) if (seen.has(word)) return true;
  for (const entry of tracked.brandNames) {
    for (const word of nameWords(entry.name)) if (seen.has(word)) return true;
  }
  return false;
}

/**
 * The words in an address, with the public suffix and the separators gone.
 *
 * `co`, `com` and the like are dropped because every British address shares
 * them and a shared "co" is not a shared business. Short fragments go too: two
 * addresses both containing "the" say nothing about each other.
 */
function addressWords(host: string): Set<string> {
  const stem = host.toLowerCase().split(".")[0] ?? "";
  const words = new Set<string>();
  if (stem.length >= MIN_ADDRESS_WORD) words.add(stem.replace(/[^a-z0-9]/g, ""));
  for (const part of stem.split(/[^a-z0-9]+/)) {
    if (part.length >= MIN_ADDRESS_WORD && !COMMON_ADDRESS_WORDS.has(part)) words.add(part);
  }
  return words;
}

function nameWords(name: string): Set<string> {
  const words = new Set<string>();
  const squashed = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (squashed.length >= MIN_ADDRESS_WORD) words.add(squashed);
  for (const part of name.toLowerCase().split(/[^a-z0-9]+/)) {
    if (part.length >= MIN_ADDRESS_WORD && !COMMON_ADDRESS_WORDS.has(part)) words.add(part);
  }
  return words;
}

/** Shared by half the web, so sharing one means nothing. */
const COMMON_ADDRESS_WORDS = new Set([
  "www", "com", "net", "org", "the", "and", "ltd", "limited", "group", "uk",
]);

/** Below this a shared fragment is coincidence. */
const MIN_ADDRESS_WORD = 4;
