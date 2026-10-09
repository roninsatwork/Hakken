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
    // else. It walked a shared competition graph for a while, so a rival
    // another company had asserted against a shared host was entitled too —
    // and this door is what lets the agent ask for a pull, so that assertion
    // could spend this company's money. The graph itself went on 2026-09-28.
    expect(source).not.toMatch(/websiteRivals/);
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
 * - the list tables and the AI lines name their hold;
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

  test.each(["websiteQuestions", "websiteKeywords", "siteListAiDays", "siteListQuestions", "siteListAiSummary"])("%s names the hold it belongs to", (table) => {
    expect(bodyOf(table), `${table} must carry companyWebsiteId, the hold its list belongs to.`)
      .toMatch(/\bcompanyWebsiteId: /);
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
    "websitePurge.ts",
    "privateListsMigration.ts",
    "websiteTrackingStatsMigration.ts",
  ]);

  const READS_A_LIST = /\.query\(\s*["'](websiteQuestions|websiteKeywords|siteListAiDays|siteListQuestions|siteListAiSummary)["']\s*\)([\s\S]{0,200})/g;

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

/**
 * The third rule: a website's Search Console is its company's alone
 * (docs/plans/active/search-console-plan.md §3). Unlike what is collected
 * about a host, Google's figures for a site belong to whoever connected it —
 * another company holding the same host has no right to them — so every table
 * names the hold it belongs to, and is read through it.
 *
 * The connection is also found by its sign-in's state (the return from
 * Google), by its status (the daily job) and by its Google account (whether a
 * grant is still in use before it is revoked). Those lookups live in the two
 * Search Console modules and show nothing to anybody. The tokens are read by
 * those two modules alone.
 */
describe("Search Console is read only through the company's own hold", () => {
  const schemaSource = readFileSync(join(CONVEX, "searchConsoleSchema.ts"), "utf8");
  const files = readdirSync(CONVEX, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated"));

  const TABLES = [
    "searchConsoleConnections",
    "searchConsoleDays",
    "searchConsoleLists",
    "searchConsolePeriods",
    "searchConsoleSeen",
    "searchConsoleSeenDays",
    "searchConsoleTracked",
    "searchConsoleWeeks",
    "searchConsoleRuns",
    // Each keyword the daily lines hold, once a month (keep-less-history-plan.md, part 8.3).
    "searchConsoleKeywordBooks",
    // Each build's book of the ready-made lists, and which build each list is read from (core-data plan §5.1).
    "searchConsolePeriodBooks",
    "searchConsolePeriodUses",
    // Each page address the daily lines point to, 250 a record (core-data plan §5.7).
    "searchConsolePageAddresses",
  ];

  test.each(TABLES)("%s names the hold it belongs to", (table) => {
    const start = schemaSource.indexOf(`${table}: defineTable({`);
    expect(start, `${table} is not in searchConsoleSchema.ts. If it was renamed, rename it here too.`).toBeGreaterThan(-1);
    const body = schemaSource.slice(start, schemaSource.indexOf(".index(", start));
    expect(body, `${table} must carry companyWebsiteId, the hold it belongs to.`).toMatch(/\bcompanyWebsiteId: /);
  });

  const MODULES = new Set(["searchConsoleConnect.ts", "searchConsoleSync.ts"]);
  const LOOKUPS = new Set(["by_pending_state", "by_status", "by_google_account"]);
  const READS = new RegExp(`\\.query\\(\\s*["'](${TABLES.join("|")})["']\\s*\\)([\\s\\S]{0,200})`, "g");

  test("every read goes through a hold, but the connection's own lookups", () => {
    expect(files.length).toBeGreaterThan(200);
    const offenders = files.flatMap((file) => {
      const source = readFileSync(join(CONVEX, file), "utf8");
      return Array.from(source.matchAll(READS)).flatMap((match) => {
        const index = /withIndex\(\s*["']([a-z_]+)["']/.exec(match[2])?.[1] ?? "(no index)";
        if (index.startsWith("by_hold") || (MODULES.has(file) && LOOKUPS.has(index))) return [];
        return [`${file}: ${match[1]} read by ${index}`];
      });
    });
    expect(
      offenders,
      "A Search Console read that is not through the company's hold. Find the site with requireMySite "
      + "and read by its hold, so no screen can reach another company's Search Console.",
    ).toEqual([]);
  });

  test("the tokens are read by the Search Console modules alone", () => {
    const readers = files.filter((file) => /\.query\(\s*["']searchConsoleTokens["']\s*\)/.test(readFileSync(join(CONVEX, file), "utf8")));
    expect(readers.sort()).toEqual([...MODULES].sort());
  });
});

/**
 * The fourth rule: what a company calls a website, and what it says its own
 * business is, are its own (docs/plans/active/company-level-website-facts-plan.md).
 * Anthony, 2026-09-28: *"i think these need to be set at the company level"* —
 * until then they sat on the shared website record, set once for everyone
 * watching the host.
 *
 * A profile names its hold and is read through it. The one read across
 * companies is the answer parser's: an answer is bought once, read against
 * every name any company holds, and each company counts only its own names'
 * mentions (`answersSeenBy`, `holdNamedIn`). Nothing else may read them by
 * website or across companies — that read is one careless edit from printing
 * another company's names for a shared competitor.
 */
describe("a company's names and profile for a website are its own", () => {
  const schemaSource = readFileSync(join(CONVEX, "holdProfileSchema.ts"), "utf8");
  const files = readdirSync(CONVEX, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated"));

  test("a profile names the hold it belongs to", () => {
    const start = schemaSource.indexOf("holdProfiles: defineTable({");
    expect(start, "holdProfiles is not in holdProfileSchema.ts. If it was renamed, rename it here too.").toBeGreaterThan(-1);
    expect(schemaSource.slice(start, schemaSource.indexOf(".index(", start))).toMatch(/\bcompanyWebsiteId: /);
  });

  test("every read goes through a hold, but the answer parser's one", () => {
    expect(files.length).toBeGreaterThan(200);
    const reads = /\.query\(\s*["']holdProfiles["']\s*\)([\s\S]{0,200})/g;
    const offenders = files.flatMap((file) => Array.from(readFileSync(join(CONVEX, file), "utf8").matchAll(reads))
      .flatMap((match) => {
        const index = /withIndex\(\s*["']([a-z_]+)["']/.exec(match[1])?.[1] ?? "(no index)";
        if (index === "by_hold" || (file === "holdProfiles.ts" && index === "by_has_brand_names")) return [];
        return [`${file}: holdProfiles read by ${index}`];
      }));
    expect(
      offenders,
      "A profile read that is not through the company's hold. Read one with holdProfileOf or "
      + "holdBrandNames in holdProfiles.ts, so no screen can reach another company's names.",
    ).toEqual([]);
  });

  test("the shared website record carries none of them", () => {
    const websites = readFileSync(join(CONVEX, "schema.ts"), "utf8");
    const start = websites.indexOf("websites: defineTable({");
    expect(start).toBeGreaterThan(-1);
    const body = websites.slice(start, websites.indexOf(".index(", start));
    expect(body, "The shared website record is the same for every company watching it: names and profile belong on holdProfiles.")
      .not.toMatch(/\b(brandNames|sector|marketLabel|businessDescription): /);
  });
});

/**
 * The fifth rule: a fan-out query's first check is its company's own record
 * (docs/plans/active/fan-out-opt-in-plan.md). The check itself is filed
 * against the website for everyone, like any search's; the record of who
 * asked is what lets a company read the result (`holdFirstCheck`), so it
 * names its hold and is read through it — but by the filing, which finds
 * every website a check answers for and shows nothing to anybody.
 */
describe("a fan-out query's first check is read only through its company's own hold", () => {
  const schemaSource = readFileSync(join(CONVEX, "fanOutSchema.ts"), "utf8");
  const files = readdirSync(CONVEX, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated"));

  test("the record names the hold it belongs to", () => {
    const start = schemaSource.indexOf("fanOutFirstChecks: defineTable({");
    expect(start, "fanOutFirstChecks is not in fanOutSchema.ts. If it was renamed, rename it here too.").toBeGreaterThan(-1);
    expect(schemaSource.slice(start, schemaSource.indexOf(".index(", start))).toMatch(/\bholdId: /);
  });

  test("every read goes through a hold, but the filing's", () => {
    expect(files.length).toBeGreaterThan(200);
    const reads = /\.query\(\s*["']fanOutFirstChecks["']\s*\)([\s\S]{0,200})/g;
    const offenders = files.flatMap((file) => Array.from(readFileSync(join(CONVEX, file), "utf8").matchAll(reads))
      .flatMap((match) => {
        const index = /withIndex\(\s*["']([a-z_]+)["']/.exec(match[1])?.[1] ?? "(no index)";
        if (index.startsWith("by_hold") || (file === "seoKeywordChecks.ts" && index === "by_pull")) return [];
        return [`${file}: fanOutFirstChecks read by ${index}`];
      }));
    expect(
      offenders,
      "A first check read that is not through the company's hold. Read one with holdFirstCheck in holdLists.ts, "
      + "so no screen can show a company another company's fan-out queries.",
    ).toEqual([]);
  });
});

/**
 * The sixth rule: which businesses are a company's offices and rivals, what
 * it typed into Find, and its Local menu numbers are its own
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, §3 rule 1). The
 * businesses themselves are the platform's (`listings`), read by anyone; the
 * company's links to them are read through its hold — but by the filing and
 * the sweeps, which find everyone watching a business to tell their menus, or
 * to keep it, and show nothing to anybody. May shrink, never grow.
 */
describe("a company's Local links are read only through its own hold", () => {
  const schemaSource = readFileSync(join(CONVEX, "localSchema.ts"), "utf8");
  const files = readdirSync(CONVEX, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated"));
  const PRIVATE = ["holdListings", "listingFinds", "localSummaries"];
  const ACROSS = new Map([
    ["localSummaries.ts", new Set(["by_listing"])],
    ["localSweep.ts", new Set(["by_listing"])],
    ["localFiling.ts", new Set(["by_pull"])],
    ["siteLocalListings.ts", new Set(["by_pull"])],
  ]);

  test.each(PRIVATE)("%s names the hold it belongs to", (table) => {
    const start = schemaSource.indexOf(`${table}: defineTable({`);
    expect(start, `${table} is not in localSchema.ts. If it was renamed, rename it here too.`).toBeGreaterThan(-1);
    expect(schemaSource.slice(start, schemaSource.indexOf(".index(", start))).toMatch(/\bcompanyWebsiteId: /);
  });

  test("every other read goes through a hold", () => {
    expect(files.length).toBeGreaterThan(200);
    const reads = /\.query\(\s*["'](holdListings|listingFinds|localSummaries)["']\s*\)([\s\S]{0,200})/g;
    const offenders = files.flatMap((file) => Array.from(readFileSync(join(CONVEX, file), "utf8").matchAll(reads))
      .flatMap((match) => {
        const index = /withIndex\(\s*["']([a-z_]+)["']/.exec(match[2])?.[1] ?? "(no index)";
        if (index.startsWith("by_hold") || ACROSS.get(file)?.has(index)) return [];
        return [`${file}: ${match[1]} read by ${index}`];
      }));
    expect(
      offenders,
      "A company's Local links read other than through its hold, outside the filing and the sweeps. "
      + "Read them by the website's hold, so no screen can show one company another's offices or rivals.",
    ).toEqual([]);
  });
});
