/**
 * The Translator's definition and the reading of its replies
 * (`contentTranslation.ts`, `contentTranslationActions.ts`): plain code, free
 * of any Convex function, so the Node actions and the database functions can
 * both use it.
 */

export const TRANSLATOR = {
  systemKey: "CONTENT_TRANSLATOR",
  name: "The Translator",
  description:
    "Translates what people write in English — Knowledge articles, Google updates, News and its recommendations — into every other language the platform is read in, as soon as it is saved. Run it to translate anything still missing.",
  systemPrompt:
    "You translate the values of one JSON object from English into one language, for the readers of an SEO and AI search platform. Keep the meaning and the plain, friendly tone. Keep Markdown, links, numbers and names exactly as they are. Reply with a JSON object with exactly the same keys and nothing else.",
  standingObjective: "Translate every published piece of English content into every language the platform is read in.",
} as const;

type Fields = Record<string, string>;

/** The model's reply as translated fields with the English's keys, or null when it is not that. */
export function parseTranslation(text: string, keys: readonly string[]): Fields | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const fields: Fields = {};
  for (const key of keys) {
    if (typeof record[key] !== "string") return null;
    fields[key] = record[key] as string;
  }
  return fields;
}
