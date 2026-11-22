import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { extractPdfTextWithinBudget } from "./pdfBudget";

test("a normal PDF still yields its text", async () => {
  const packageRoot = dirname(createRequire(import.meta.url).resolve("pdf-extraction"));
  const fixture = readFileSync(join(packageRoot, "test/data/04-valid.pdf"));
  const text = await extractPdfTextWithinBudget(fixture);
  expect(text).toContain("Exercise  is  one  of  the  low-cost");
});
