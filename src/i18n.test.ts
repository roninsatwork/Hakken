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
      const namespaces = [...source.matchAll(/useTranslations\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
      if (namespaces.length !== 1) continue;

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
