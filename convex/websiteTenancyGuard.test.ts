import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Nothing starts from a website and walks outward to its watchers.
 *
 * A `websites` row is shared — one host is stored once for everyone tracking
 * it — so the record implicitly knows that a company and its rival both watch
 * the same site. Tenancy lives only on the join row, `companyWebsites`, which
 * records both a company's own sites and the ones it tracks, and the leak is
 * not a missing check but a *direction*:
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
    // Entitlement is what the company holds, owned or tracked, and nothing
    // else. It walked the competition graph for a while, so a rival another
    // company had asserted against a shared host was entitled too — and this
    // door is what lets the agent ask for a pull, so that assertion could spend
    // this company's money. The graph is for reading and suggesting.
    expect(source).not.toContain('.query("websiteRivals")');
  });
});

/**
 * The second rule: a company's lists are its own.
 *
 * Anthony, 2026-09-25: *"If I track a keyword that's related to the company,
 * other people should not see what I am tracking."* That reversed the rule of
 * 2026-09-22, which put one list of searches and questions on the host for
 * every company watching it (docs/plans/active/private-tracking-lists-plan.md).
 *
 * So the lists, and the AI lines worked out from them, carry the hold they
 * belong to, and every screen reads them through it. Two checks, one on the
 * shape of the rows and one on the direction of every read:
 *
 * - the list tables and the AI lines name their hold, and the competition
 *   graph — a fact about a market, never shown to another company — still
 *   names no company;
 * - a read of them that is not through a hold (`by_hold…`) happens only in
 *   the writers and purges that must find everyone who asked, which show
 *   nothing to anybody. A query that reads a list by website, search or
 *   question is one careless edit from showing another company's.
 *
 * Read as source, like the first rule: a field or an index added in a hurry is
 * exactly how it would be lost.
 */
describe("a company's lists are read only through its own hold", () => {
  const schemaSource = [
    readFileSync(join(CONVEX, "schema.ts"), "utf8"),
    readFileSync(join(CONVEX, "siteSchema.ts"), "utf8"),
  ].join("\n");

  /** The table body: from its declaration to its first index, which every one of them has. */
  const bodyOf = (table: string) => {
    const start = schemaSource.indexOf(`${table}: defineTable({`);
    expect(start, `${table} is not in the schema. If it was renamed, rename it here too.`).toBeGreaterThan(-1);
    const end = schemaSource.indexOf(".index(", start);
    return schemaSource.slice(start, end > start ? end : start + 2000);
  };

  test.each(["websiteQuestions", "websiteKeywords", "siteListAiDays"])("%s names the hold it belongs to", (table) => {
    expect(bodyOf(table), `${table} must carry companyWebsiteId, the hold its list belongs to.`)
      .toMatch(/\bcompanyWebsiteId: /);
  });

  test("the competition graph names no company", () => {
    expect(
      /\b(companyId|companyWebsiteId|tenantId|clientId|createdBy|ownerId)\b/.test(bodyOf("websiteRivals")),
      "websiteRivals has a field naming a company. Who competes with whom is a fact about a market, "
      + "shared on the host; which rivals a company watches belongs on companyWebsites.",
    ).toBe(false);
  });

  /**
   * The files that may read the lists across companies: the writers that file
   * a result for everyone who asked, the purges, and the migrations. None of
   * them returns what it reads to a screen. May shrink, never grow.
   */
  const ACROSS_COMPANIES = new Set([
    "seoKeywordChecks.ts",
    "websiteTrackingStats.ts",
    "siteKeywordList.ts",
    "siteSummaries.ts",
    "websitePurge.ts",
    "privateListsMigration.ts",
    "websiteTrackingStatsMigration.ts",
  ]);

  const READS_A_LIST = /\.query\(\s*["'](websiteQuestions|websiteKeywords|siteListAiDays)["']\s*\)([\s\S]{0,200})/g;

  test("every other read of a list goes through a hold", () => {
    const files = readdirSync(CONVEX, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated"));
    expect(files.length).toBeGreaterThan(200);

    const offenders = files.flatMap((file) => {
      const source = readFileSync(join(CONVEX, file), "utf8");
      return Array.from(source.matchAll(READS_A_LIST)).flatMap((match) => {
        const index = /withIndex\(\s*["']([a-z_]+)["']/.exec(match[2])?.[1] ?? "(no index)";
        if (index.startsWith("by_hold") || ACROSS_COMPANIES.has(file)) return [];
        return [`${file}: ${match[1]} read by ${index}`];
      });
    });
    expect(
      offenders,
      "A list read by website, search or question outside the writers and purges. Read a company's "
      + "list through its hold with holdLists.ts, so no screen can reach another company's.",
    ).toEqual([]);
  });
});
