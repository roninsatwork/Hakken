import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LANGUAGES, LANGUAGE_NAMES, TRANSLATED_LANGUAGES } from "./contentLanguages";

/** A wording file added for a language means content is translated into it too, and the other way round. */
describe("the languages Hakken is read in", () => {
  it("match the screens' wording files, and each has a name the Translator can be told", () => {
    const files = fs.readdirSync(path.join(__dirname, "../../messages")).filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""));
    expect([...files].sort()).toEqual([...APP_LANGUAGES].sort());
    for (const language of APP_LANGUAGES) expect(LANGUAGE_NAMES[language]).toBeTruthy();
    expect(TRANSLATED_LANGUAGES).not.toContain("en");
  });
});
