import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Nothing starts from a website and walks outward to its watchers.
 *
 * A `websites` row is shared — one host is stored once for everyone tracking
 * it — so the record implicitly knows that a company and its rival both watch
 * the same site. Tenancy lives only on the join rows, `companyWebsites` and
 * `trackedCompetitors`, and the leak is not a missing check but a *direction*:
 * a query that reads a website and then finds who holds it has already crossed
 * the line, and filtering afterwards is one careless edit from not filtering.
 *
 * So the rule is structural. Two files may read the `websites` table: the one
 * that owns the records, and the one helper that resolves a host through a
 * company's own holdings. Everything else takes a website id it was already
 * entitled to.
 *
 * Read as source in the house style, the same way
 * `no-client-specific-fallbacks` reads it. A rule that lives in a reviewer's
 * memory is a rule that lasts until the reviewer is busy.
 */

const CONVEX = join(process.cwd(), "convex");

/**
 * The two files allowed to query `websites` directly.
 *
 * `websites.ts` owns the records: creating them, listing them for a super
 * admin, and deleting them. Its cross-company reads are the deliberate
 * exception and are super-admin-only by their own gate.
 *
 * `seoTools.ts` holds `requireCompanyWebsite`, the one door that turns a host
 * into a website id, and it does so by proving the caller's own join row
 * first. May shrink, never grow.
 */
const ALLOWED = new Set(["websites.ts", "seoTools.ts"]);

/** `.query("websites")` and nothing cleverer — the direction, not the intent. */
const READS_WEBSITES = /\.query\(\s*["']websites["']\s*\)/;

describe("the shared website record stays behind its join rows", () => {
  const files = readdirSync(CONVEX, { recursive: true, encoding: "utf8" })
    .filter((file) =>
      file.endsWith(".ts")
      && !file.endsWith(".test.ts")
      && !file.startsWith("_generated"));

  test("the guard read the backend", () => {
    // A rule that reads nothing passes exactly as happily as one that works.
    expect(files.length).toBeGreaterThan(200);
  });

  test("only the record's owner and the entitlement helper read it", () => {
    const offenders = files.filter((file) => {
      if (ALLOWED.has(file)) return false;
      return READS_WEBSITES.test(readFileSync(join(CONVEX, file), "utf8"));
    });

    expect(
      offenders,
      "Take a websiteId you were already entitled to, or go through "
      + "requireCompanyWebsite in seoTools.ts. Reading `websites` and then "
      + "working out who holds it is how one customer's competitor list "
      + "reaches another.",
    ).toEqual([]);
  });

  test("the helper the rule depends on is still there", () => {
    // The allowlist above is only safe while this exists and still resolves
    // through a company's own rows.
    const source = readFileSync(join(CONVEX, "seoTools.ts"), "utf8");

    expect(source).toContain("export async function requireCompanyWebsite");
    expect(source).toContain('.query("companyWebsites")');
    expect(source).toContain('.query("trackedCompetitors")');
  });
});
