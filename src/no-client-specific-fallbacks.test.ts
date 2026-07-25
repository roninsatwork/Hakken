import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * No client-specific values as runtime fallbacks.
 *
 * A fallback belonging to whoever built the platform is inherited by every
 * deployment made from this repo. The email sender was the clearest case: a
 * hardcoded `noreply@<builder-domain>` meant another company's mail provider
 * was not authorised to send as that domain, so SPF/DKIM failed and their
 * login emails were spam-filtered — while appearing to come from the wrong
 * company. It had been live because neither `RESEND_FROM_EMAIL` nor the
 * settings field was configured.
 *
 * A "safe" default is worse than none here: it fails quietly and looks
 * deliberate. Unconfigured deployments must fail visibly instead
 * (`UNCONFIGURED_EMAIL_ADDRESS` uses the reserved `.invalid` TLD).
 *
 * Seed and fixture files are exempt: they are run deliberately by an operator,
 * not served to a customer.
 */

const repoRoot = process.cwd();

/** Domains owned by the platform's authors, not by its deployments. */
const BUILDER_DOMAINS = ["ronins.co.uk"];

const SEARCH_ROOTS = ["src", "convex", "scripts", "messages", "public"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".json"]);

/**
 * Deliberate, reviewed exceptions. Operator-run seeds only — never anything on
 * a request path.
 */
const ALLOWED_FILES = new Set(["convex/seedUsers.ts"]);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "_generated") return [];
      return walk(fullPath);
    }
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function toRepoRelative(filePath: string) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

describe("no client-specific fallbacks", () => {
  test("builder-owned domains do not appear in shipped code", () => {
    const violations: string[] = [];

    for (const root of SEARCH_ROOTS) {
      for (const filePath of walk(path.join(repoRoot, root))) {
        const relativePath = toRepoRelative(filePath);
        if (ALLOWED_FILES.has(relativePath)) continue;
        if (/\.test\.(ts|tsx)$/.test(relativePath)) continue;
        // This file names the domains in order to forbid them.
        if (relativePath === "src/no-client-specific-fallbacks.test.ts") continue;

        const contents = fs.readFileSync(filePath, "utf8");
        for (const domain of BUILDER_DOMAINS) {
          if (contents.includes(domain)) {
            violations.push(`${relativePath} contains ${domain}`);
          }
        }
      }
    }

    expect(
      violations,
      [
        "Shipped code must not reference a domain owned by the platform's authors.",
        "Every deployment inherits it: mail fails SPF/DKIM, and UI copy shows the wrong company.",
        "Read the value from settings or an environment variable, and let an unconfigured",
        "deployment fail visibly rather than fall back to a real address.",
        "",
        ...violations,
      ].join("\n"),
    ).toEqual([]);
  });

  test("the unconfigured email placeholder cannot be delivered to", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "convex", "emailBrandingService.ts"),
      "utf8",
    );

    const match = /UNCONFIGURED_EMAIL_ADDRESS\s*=\s*["'`]([^"'`]+)["'`]/.exec(source);
    expect(match, "UNCONFIGURED_EMAIL_ADDRESS should be defined").not.toBeNull();

    // RFC 2606 reserves .invalid precisely so it can never resolve. A real
    // domain here would silently send as somebody else.
    expect(match?.[1]).toMatch(/\.invalid$/);
  });
});
