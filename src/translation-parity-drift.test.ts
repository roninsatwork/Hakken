import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot } from './test/driftUtils';

/**
 * An Italian value identical to its English one is untranslated until it says
 * otherwise.
 *
 * Key parity is already checked — every key present in one catalogue is present
 * in the other. That is a weaker property than it sounds, because copying the
 * English string into the Italian file satisfies it perfectly. On 2026-08-26
 * 120 sentence-shaped values were byte-identical across the two catalogues,
 * almost all of them plain English under `admin.*` and `ai.*`: a whole
 * Italian-speaking administrator's experience of the rules screen, the
 * knowledge screen, the activity log and the cost dashboard was English, and
 * nothing anywhere reported it.
 *
 * 94 were translated the same day. What remains is listed below with a reason
 * each, because a value being identical is sometimes correct and there is no
 * way to tell the two apart by looking.
 *
 * Only sentence-shaped values are read — eight characters or more, containing a
 * space. A single word matching across languages is ordinary ("Email", "OK",
 * "Widget") and reading those would bury the signal in noise.
 */
describe('the Italian catalogue is translated, not copied', () => {
  /**
   * Values that are the same in both languages on purpose. May shrink, never
   * grow.
   *
   * Four kinds, and each is a reason a translator would give:
   *   - a product or brand name, which does not translate;
   *   - a font or currency name, which is written the same way;
   *   - a code sample, which would stop working if translated;
   *   - a pattern made only of placeholders and punctuation, with no word in it
   *     to translate.
   */
  const IDENTICAL_ON_PURPOSE: ReadonlyMap<string, string> = new Map([
    ['dashboard.hero.eyebrow', 'the platform tagline, which is a brand mark rather than a sentence'],
    ['sidebar.postureStudio', 'product name'],
    ['sidebar.roninsRun', 'product name'],
    ['arcade.title', 'product name'],
    ['admin.companies.modules.postureStudio.name', 'product name'],
    ['admin.overview.providers.names.google', 'a provider brand name'],
    ['dashboard.hosting.items.0.title', 'a provider brand name'],
    ['admin.workflows.designer.drawer.dbIndexes.rightmoveId', 'a brand name plus an abbreviation'],
    ['admin.workflows.designer.drawer.standardTab', '"Standard" is written the same way in Italian'],
    ['admin.settings.appearance.fonts.inter', 'a typeface name'],
    ['admin.settings.appearance.fonts.jetbrains', 'a typeface name'],
    ['admin.settings.appearance.sizes.standard', '"Standard" plus a CSS unit'],
    ['admin.settings.appearance.sizes.micro', '"Micro" is written the same way in Italian'],
    ['admin.settings.economics.currencies.eur', 'the euro is written the same way in both'],
    ['admin.agents.details.evals.form.toolsPlaceholder', 'a code sample; translating it would make the example wrong'],
    ['user.preferences.language.en', 'a language named in its own language, which is the point of the list'],
    ['user.preferences.language.it', 'the other half of the same list'],
    ['admin.overview.metrics.computeSub', 'placeholders and two abbreviations that are used untranslated in both'],
    ['ai.costs.metrics.tokenSub', 'the same pattern as the line above'],
    ['admin.companyDetails.models.strandedOption', 'two placeholders and a dash — no word to translate'],
    ['admin.agents.details.observability.dashboard.research.exception', 'the same pattern'],
    ['salesData.customers.marketWorkingOn', 'two placeholders and a separator'],
    ['admin.aiTools.edit.idTag', '"ID" is used untranslated in Italian technical copy'],
    ['ai.rules.form.idTag', 'the same'],
    ['admin.agents.details.rules.form.edit.idLabel', 'the same'],
    ['ai.chatLogs.company.widgetSource', '"Widget" is used untranslated in Italian'],
    ['ai.costs.chart.titleUsd', 'a placeholder and a currency code'],
  ]);

  const readCatalogue = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(repoRoot, 'messages', `${name}.json`), 'utf8')) as unknown;

  const identical: string[] = [];
  let sentenceValues = 0;

  const walk = (english: unknown, italian: unknown, trail: string) => {
    if (typeof english === 'string' && typeof italian === 'string') {
      const trimmed = english.trim();
      if (trimmed.length < 8 || !trimmed.includes(' ') || !/[A-Za-z]/.test(trimmed)) return;
      sentenceValues += 1;
      if (english === italian && !IDENTICAL_ON_PURPOSE.has(trail)) identical.push(`${trail} — "${english}"`);
      return;
    }

    if (english && italian && typeof english === 'object' && typeof italian === 'object') {
      for (const [key, value] of Object.entries(english as Record<string, unknown>)) {
        const other = (italian as Record<string, unknown>)[key];
        if (other !== undefined) walk(value, other, trail ? `${trail}.${key}` : key);
      }
    }
  };

  walk(readCatalogue('en'), readCatalogue('it'), '');

  test('the scan reads a real population of sentences', () => {
    // Without this, a walk that stopped descending would leave the rule below
    // asserting nothing — which is exactly how 120 English sentences sat in the
    // Italian catalogue with a green key-parity check beside them.
    expect(sentenceValues, 'no sentence-shaped values were compared at all').toBeGreaterThan(1000);
  });

  test('no Italian value is a copy of the English one', () => {
    expect(
      identical,
      `These read identically in both catalogues, which almost always means the English was copied across rather than translated. Translate them, or — if the value really is the same in both languages, as a product name or a code sample is — add it to IDENTICAL_ON_PURPOSE with the reason:\n${identical.join('\n')}`
    ).toEqual([]);
  });

  test('every listed exception is still identical (drop the entry otherwise)', () => {
    const translated: string[] = [];
    const check = (english: unknown, italian: unknown, trail: string) => {
      if (typeof english === 'string' && typeof italian === 'string') {
        if (IDENTICAL_ON_PURPOSE.has(trail) && english !== italian) translated.push(trail);
        return;
      }
      if (english && italian && typeof english === 'object' && typeof italian === 'object') {
        for (const [key, value] of Object.entries(english as Record<string, unknown>)) {
          const other = (italian as Record<string, unknown>)[key];
          if (other !== undefined) check(value, other, trail ? `${trail}.${key}` : key);
        }
      }
    };
    check(readCatalogue('en'), readCatalogue('it'), '');

    expect(
      translated,
      `These are listed as identical on purpose but now differ. Remove their entries so the list keeps shrinking:\n${translated.join('\n')}`
    ).toEqual([]);
  });
});
