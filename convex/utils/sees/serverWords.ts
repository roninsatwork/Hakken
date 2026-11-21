import en from "../../../messages/en.json";

/**
 * The screens' own English words, for figures built on the server
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). A screen hands
 * its eye figures named in the reader's words (`useTranslations`); the same
 * figures built for a chat app take the English ones from the same file, so the
 * server and the screen can't call a thing two names. Chat apps reply in the
 * person's own language from these.
 */

type Tree = { [key: string]: string | Tree };

function branch(path: string): Tree {
  let node: string | Tree = en as unknown as Tree;
  for (const key of path.split(".")) {
    if (typeof node !== "object" || !(key in node)) return {};
    node = node[key];
  }
  return typeof node === "object" ? node : {};
}

/**
 * A plural block's words for a count, as next-intl picks them: an exact `=n` branch, then English's plural rule,
 * then `other`, with `#` as the count. "{count, plural, one {# other group} other {# other groups}}" and 3 give
 * "3 other groups".
 */
export function pluralWords(block: string, count: number): string {
  const branches = new Map([...block.matchAll(/(=\d+|zero|one|two|few|many|other) \{([^{}]*)\}/g)].map((match) => [match[1], match[2]]));
  const words = branches.get(`=${count}`) ?? branches.get(new Intl.PluralRules("en").select(count)) ?? branches.get("other") ?? "";
  return words.replace(/#/g, new Intl.NumberFormat("en").format(count));
}

/** Fills `{name}` holes and plural or select blocks, as next-intl does for the English words. */
function fill(template: string, values: Record<string, string | number> = {}): string {
  const blocks = template.replace(/\{(\w+), (plural|select), ((?:[^{}]|\{[^{}]*\})*)\}/g, (whole: string, key: string, kind: string, body: string) => {
    const value = values[key];
    // A count not given yet stays as written, for whoever has the number to fill it (`pluralWords`).
    if (kind === "plural") return value === undefined || Number.isNaN(Number(value)) ? whole : pluralWords(body, Number(value));
    const branches = new Map([...body.matchAll(/(\w+) \{([^{}]*)\}/g)].map((match) => [match[1], match[2]]));
    return branches.get(String(value)) ?? branches.get("other") ?? "";
  });
  return blocks.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** A `useTranslations`-shaped reader over one namespace of the English words. */
export type ServerWords = ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean };

export function englishWords(namespace: string): ServerWords {
  const tree = branch(namespace);
  const at = (key: string): string | undefined => {
    let node: string | Tree | undefined = tree;
    for (const part of key.split(".")) {
      if (!node || typeof node !== "object") return undefined;
      node = node[part];
    }
    return typeof node === "string" ? node : undefined;
  };
  const words = ((key: string, values?: Record<string, string | number>) => {
    const found = at(key);
    return found === undefined ? key : fill(found, values);
  }) as ServerWords;
  words.has = (key: string) => at(key) !== undefined;
  return words;
}

/** A namespace's chosen keys as a record, as `useEyeNames` and its kin hand them over. */
export function englishNames(namespace: string, keys: readonly string[], values: Record<string, string | number> = {}): Record<string, string> {
  const words = englishWords(namespace);
  return Object.fromEntries(keys.map((key) => [key, words(key, values)]));
}
