import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A fixture of saved figures, read from `src/test/fixtures/` when a test runs. Never imported as JSON: 1.3MB of them
 * imported took the type check past its 4GB (Anthony's overnight build, 2026-11-04: 4.7GB, out of memory at random),
 * as TypeScript builds a type for every value in an imported JSON file. `src/ask-hakken-chart-pages-drift.test.ts` fails one
 * imported. The caller says what shape it reads.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a test's figures, shaped by the test that reads them
export function readFixture<T = any>(name: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "src/test/fixtures", `${name}.json`), "utf8")) as T;
}
