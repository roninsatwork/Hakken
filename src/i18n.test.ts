import { expect, test, describe } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Utility function to flatten a nested JSON object into an array of dot-notation keys
 * example: { a: { b: "hello" } } -> ["a.b"]
 */
const flattenKeys = (obj: unknown, prefix = ''): string[] => {
  if (typeof obj !== 'object' || obj === null) return [];
  
  return Object.keys(obj).reduce((acc: string[], key: string) => {
    const pre = prefix.length ? prefix + '.' : '';
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      acc.push(...flattenKeys(value, pre + key));
    } else {
      acc.push(pre + key);
    }
    return acc;
  }, []);
};

describe("UX Layer: Internationalization (i18n) Parity", () => {
  test("English and Italian translation files must have exactly matching key structures", () => {
    // 1. Read the raw dicts
    const enPath = path.resolve(process.cwd(), 'messages/en.json');
    const itPath = path.resolve(process.cwd(), 'messages/it.json');
    
    // Ensure files actually exist before we verify
    expect(fs.existsSync(enPath)).toBe(true);
    expect(fs.existsSync(itPath)).toBe(true);

    const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const itData = JSON.parse(fs.readFileSync(itPath, 'utf8'));

    // 2. Flatten internal keys down to single strings
    const enKeys = flattenKeys(enData).sort();
    const itKeys = flattenKeys(itData).sort();

    // 3. Find missing keys in each respective language map
    const missingInItalian = enKeys.filter(k => !itKeys.includes(k));
    const missingInEnglish = itKeys.filter(k => !enKeys.includes(k));

    // 4. Assert there are 0 missing translations
    try {
        expect(missingInItalian.length).toBe(0);
        expect(missingInEnglish.length).toBe(0);
    } catch {
        // Provide hyper-specific debugging text if it fails
        throw new Error(
            `Localization Parity Failure!\n` +
            `Missing in Italian (Needs translation): ${missingInItalian.join(', ') || 'None'}\n` +
            `Missing in English (Orphaned Italian keys): ${missingInEnglish.join(', ') || 'None'}`
        );
    }
  });
});

/**
 * Every key a screen asks for has to exist in the namespace it declared.
 *
 * The parity test above only proves English and Italian agree. It says nothing
 * about whether a key exists at all, so a label added to the wrong section
 * passes both files and renders its own key path on screen — which happened
 * three times in one sitting, once destroying keys another branch had added.
 *
 * Only files declaring exactly one namespace are checked, and only literal
 * keys: a template key like `t(`filterRecord${option}`)` cannot be resolved
 * without running the component, and guessing at its shape would trade a real
 * check for a flaky one.
 */
describe("UX Layer: Internationalization (i18n) Coverage", () => {
  const collectFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(full);
      return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [full] : [];
    });

  test("every translation key a component asks for exists in its namespace", () => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'messages/en.json'), 'utf-8')
    ) as Record<string, unknown>;

    const has = (dotted: string) => {
      let node: unknown = messages;
      for (const part of dotted.split('.')) {
        if (typeof node !== 'object' || node === null || !(part in node)) return false;
        node = (node as Record<string, unknown>)[part];
      }
      return true;
    };

    const missing: string[] = [];
    for (const file of collectFiles(path.join(process.cwd(), 'src'))) {
      const source = fs.readFileSync(file, 'utf-8');
      // Both quote styles. Matching only double quotes meant a file holding one
      // of each — `useTranslations("a.b")` beside `useTranslations('a')` —
      // counted as single-namespace, and every `t("…")` in it was then checked
      // against whichever one happened to be double-quoted. That is not a
      // near-miss: on the company usage screen it reported five keys missing
      // that were present, under a namespace no call there uses. A file with
      // two translators cannot be checked this way and is skipped, which is
      // what the count below is for.
      const namespaces = [...source.matchAll(/useTranslations\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
      if (new Set(namespaces).size !== 1) continue;

      for (const match of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
        const dotted = `${namespaces[0]}.${match[1]}`;
        if (!has(dotted)) missing.push(`${path.relative(process.cwd(), file)}: ${dotted}`);
      }
    }

    expect(
      missing,
      `Translation keys used but not defined in messages/en.json:\n${missing.join('\n')}`
    ).toEqual([]);
  });
});

describe("placeholder parity between the catalogues", () => {
  /**
   * Key parity says both languages answer to the same names; it says nothing
   * about the {placeholders} inside the sentences. An Italian entry that loses
   * {count} or {platformName} renders the braces literally or drops the value —
   * broken copy that every other check waves through. Same placeholders, both
   * languages, every key.
   */
  test("every key uses the same placeholders in English and Italian", () => {
    const en = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages/en.json"), "utf8"));
    const it = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages/it.json"), "utf8"));
    // Argument names only. ICU plural/select bodies nest braces whose inner
    // words are translated text ({count, plural, one {entry} other {entries}}),
    // so a flat regex reports translations as mismatches. Names are read where
    // the brace depth steps from zero to one, and nowhere else.
    const placeholders = (value: string) => {
      const names: string[] = [];
      let depth = 0;
      for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        if (char === "{") {
          depth += 1;
          if (depth === 1) {
            const match = /^\s*(\w+)/.exec(value.slice(i + 1));
            if (match) names.push(match[1]);
          }
        } else if (char === "}") {
          depth -= 1;
        }
      }
      return names.sort().join(",");
    };

    const mismatches: string[] = [];
    const walk = (enNode: unknown, itNode: unknown, trail: string) => {
      if (typeof enNode === "string" && typeof itNode === "string") {
        if (placeholders(enNode) !== placeholders(itNode)) {
          mismatches.push(`${trail}: en {${placeholders(enNode)}} vs it {${placeholders(itNode)}}`);
        }
        return;
      }
      if (enNode && itNode && typeof enNode === "object" && typeof itNode === "object") {
        for (const key of Object.keys(enNode as Record<string, unknown>)) {
          walk(
            (enNode as Record<string, unknown>)[key],
            (itNode as Record<string, unknown>)[key],
            trail ? `${trail}.${key}` : key
          );
        }
      }
    };
    walk(en, it, "");

    expect(
      mismatches,
      `These translations disagree about their placeholders — the sentence will render broken in one language:\n${mismatches.join("\n")}`
    ).toEqual([]);
  });
});
