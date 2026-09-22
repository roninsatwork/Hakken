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
    // Entitlement for a rival runs company → its holds → the competition
    // graph. It used to read a per-company `trackedCompetitors` row; the graph
    // names no company, so the company's own holds are what grant a host.
    expect(source).toContain('.query("websiteRivals")');
  });
});

/**
 * The second rule, which arrived with the host's own lists.
 *
 * A host now carries what is asked about it, what it is checked against and who
 * it competes with, and every company attached to it reads all of that. That is
 * deliberate — Anthony, 2026-09-22: *"another agency may also want to see my
 * keywrods and what i do to mak etheir website better. Thats a valid use
 * case."* It is what the product sells, and it is observable from outside
 * anyway.
 *
 * What must never travel with it is **who is watching**. A client's portfolio
 * is their strategy and their client book, and it is the one thing in this
 * model that is genuinely private. So the rule is not "keep the host clean of
 * company data" — the lists are company data in every ordinary sense. It is
 * narrower and sharper: nothing stored on a host may name a company.
 *
 * Read off the schema rather than the source, because this is a fact about the
 * shape of the rows. A field added in a hurry is exactly how it would be lost.
 */
describe("nothing stored on a host names who is watching it", () => {
  /** The host's own lists. Each hangs off a `websites` row and nothing else. */
  const HOST_OWNED_TABLES = ["websiteQuestions", "websiteKeywords", "websiteRivals"];

  /** Anything that would identify a watcher, however it were spelled. */
  const NAMES_A_WATCHER = /\b(companyId|companyWebsiteId|tenantId|clientId|createdBy|ownerId)\b/;

  const schemaSource = readFileSync(join(CONVEX, "schema.ts"), "utf8");

  test.each(HOST_OWNED_TABLES)("%s carries no company", (table) => {
    const start = schemaSource.indexOf(`${table}: defineTable({`);
    expect(start, `${table} is not in the schema. If it was renamed, rename it here too.`)
      .toBeGreaterThan(-1);

    // The table body ends at its first index declaration, which every one of
    // them has; taking the whole block would run into the next table.
    const end = schemaSource.indexOf(".index(", start);
    const body = schemaSource.slice(start, end > start ? end : start + 2000);

    expect(
      NAMES_A_WATCHER.test(body),
      `${table} has a field naming a company. The host's lists are shared with `
      + "every client attached to it, so a watcher's identity stored beside them "
      + "is one query away from being read off another client's screen. Who "
      + "watches whom belongs on companyWebsites.",
    ).toBe(false);
  });
});
