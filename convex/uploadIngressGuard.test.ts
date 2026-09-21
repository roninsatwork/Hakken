import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

test("all production storage writes stay behind the registered, bounded gateway", () => {
  const root = join(process.cwd(), "convex");
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated/"));
  const issuers: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    // The post-cutoff orphan sweep relies on all app-created files being registered.
    expect(source, relative(process.cwd(), join(root, file))).not.toMatch(/\.storage\.store\s*\(/);
    if (/\.storage\.generateUploadUrl\s*\(/.test(source)) issuers.push(file);
  }
  expect(issuers).toEqual(["uploadHttp.ts"]);
  for (const file of [
    "chat", "users", "settings", "knowledge", "widgets",
  ]) {
    expect(readFileSync(join(root, file + ".ts"), "utf8")).toContain("issueUpload(ctx,");
  }
});
