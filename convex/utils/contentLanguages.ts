/**
 * The languages Hakken is read in (docs/plans/active/knowledge-news-and-
 * digest-plan.md, revised 2026-10-01): people write content once, in English,
 * and the Translator writes every other language (`contentTranslation.ts`).
 * One list for the whole platform — the screens' wording files
 * (`messages/<language>.json`) must match it, which
 * `contentLanguages.test.ts` checks, so a new language is added here and
 * every article, update and news item is translated into it.
 */
export const APP_LANGUAGES = ["en", "it"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** The language people write in. */
export const SOURCE_LANGUAGE: AppLanguage = "en";

/** Every language the Translator writes. */
export const TRANSLATED_LANGUAGES: readonly AppLanguage[] = APP_LANGUAGES.filter((language) => language !== SOURCE_LANGUAGE);

/** What a language is called, for the model told to write in it. */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = { en: "English", it: "Italian" };

export function isTranslatedLanguage(language: string): language is AppLanguage {
  return (TRANSLATED_LANGUAGES as readonly string[]).includes(language);
}
