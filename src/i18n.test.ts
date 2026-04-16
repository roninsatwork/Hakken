import { expect, test, describe } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Utility function to flatten a nested JSON object into an array of dot-notation keys
 * example: { a: { b: "hello" } } -> ["a.b"]
 */
const flattenKeys = (obj: any, prefix = ''): string[] => {
  if (typeof obj !== 'object' || obj === null) return [];
  
  return Object.keys(obj).reduce((acc: string[], key: string) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      acc.push(...flattenKeys(obj[key], pre + key));
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
    } catch (e: any) {
        // Provide hyper-specific debugging text if it fails
        throw new Error(
            `Localization Parity Failure!\n` +
            `Missing in Italian (Needs translation): ${missingInItalian.join(', ') || 'None'}\n` +
            `Missing in English (Orphaned Italian keys): ${missingInEnglish.join(', ') || 'None'}`
        );
    }
  });
});
