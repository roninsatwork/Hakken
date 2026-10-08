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
  // The one file the server stores itself: DataForSEO's answer, from the action
  // that bought it — never a person's upload — registered by the answer row that
  // names it, which the sweep honours (`isAnswerFile`), and removed with it
  // (core-data-normalisation-plan.md §6.5; Anthony, 2026-10-08: "Allow the
  // answer files"). Nothing else may store a file but through the gateway.
  expect(serverStores).toEqual(["seoPullAnswers.ts"]);
  for (const file of [
    "chat", "users", "settings", "knowledge", "widgets",
  ]) {
    expect(readFileSync(join(root, file + ".ts"), "utf8")).toContain("issueUpload(ctx,");
  }
});
