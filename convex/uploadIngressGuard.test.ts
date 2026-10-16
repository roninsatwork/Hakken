import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("all production storage writes stay behind the registered, bounded gateway", () => {
  const root = join(process.cwd(), "convex");
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated/"));
  const issuers: string[] = [];
  const serverStores: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    // The post-cutoff orphan sweep relies on all app-created files being registered.
    if (/\.storage\.store\s*\(/.test(source)) serverStores.push(file);
    if (/\.storage\.generateUploadUrl\s*\(/.test(source)) issuers.push(file);
  }
  expect(issuers).toEqual(["uploadHttp.ts"]);
  // The files the server stores itself, never a person's upload:
  // - DataForSEO's answer, from the action that bought it, registered by the
  //   answer row that names it, which the sweep honours (`isAnswerFile`), and
  //   removed with it (core-data-normalisation-plan.md §6.5; Anthony,
  //   2026-10-08: "Allow the answer files");
  // - a Search Console long period's running sums, saved between two jobs of
  //   one settle stage and let go by the job that carries them on, minutes
  //   later (search-console-streamed-lists-plan.md, SL4; Anthony, 2026-10-16:
  //   "do it", to allowing them). Younger than a day, the sweep leaves them; a
  //   stage stalled past that loses them and begins its weeks again.
  // Nothing else may store a file but through the gateway.
  expect(serverStores).toEqual(["searchConsoleLongLists.ts", "seoPullAnswers.ts"]);
  for (const file of [
    "chat", "users", "settings", "knowledge", "widgets",
  ]) {
    expect(readFileSync(join(root, file + ".ts"), "utf8")).toContain("issueUpload(ctx,");
  }
});
