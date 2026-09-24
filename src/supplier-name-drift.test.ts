import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot } from './test/driftUtils';

/**
 * A client never reads the name of the company we buy data from, or of another
 * SEO tool: the numbers on their screens are presented as ours.
 *
 * On 2026-09-24 sixteen lines of the client's Sites wording named DataForSEO,
 * one of them Ahrefs too, and nothing reported it. They were rewritten the same
 * day (docs/plans/active/sites-ux-updates-plan.md §1). Admin screens keep the
 * supplier's name, because they are about the supplier — so every message under
 * `admin.` is exempt, and every other one is read.
 */
const SUPPLIERS = /dataforseo|data for seo|ahrefs|semrush|majestic|\bmoz\b/i;

function supplierLines(file: string): string[] {
  const catalogue = JSON.parse(fs.readFileSync(path.join(repoRoot, 'messages', file), 'utf8')) as Record<string, unknown>;
  const found: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const at = prefix ? `${prefix}.${key}` : key;
      if (at === 'admin') continue;
      if (typeof value === 'string') {
        if (SUPPLIERS.test(value)) found.push(`${at}: ${value}`);
      } else if (value && typeof value === 'object') {
        walk(value as Record<string, unknown>, at);
      }
    }
  };
  walk(catalogue, '');
  return found;
}

describe('no supplier names on the client side', () => {
  test.each(['en.json', 'it.json'])('%s names no supplier outside admin', (file) => {
    expect(supplierLines(file)).toEqual([]);
  });
});
