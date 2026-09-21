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

/**
 * Builder-chosen names that must not be hardcoded into customer-visible
 * strings. `systemSettings.platformName` is configurable, so every email,
 * AI prompt, refusal, and end-user error should resolve the name through
 * `resolvePlatformName` / `getEmailBranding` rather than baking in the
 * shipped default.
 */
const BUILDER_STRINGS = ["Sonae"];

const SEARCH_ROOTS = ["src", "convex", "scripts", "messages", "public"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".json"]);

/**
 * Deliberate, reviewed exceptions. Operator-run seeds only — never anything on
 * a request path.
 */
const ALLOWED_FILES = new Set(["convex/seedUsers.ts"]);

/**
 * Where "Sonae" may still appear inside a string literal in convex/, and how
 * many times. SHRINK-ONLY: entries exist for the deliberate sites below and
 * for nothing else — remove or reduce them as sites are converted, never add
 * or raise one without the same review the site itself had.
 *
 * The deliberate sites, and why they stay:
 * - settingsService.ts: `DEFAULT_SETTINGS.platformName` — the single source of
 *   the shipped default every fallback resolves through.
 * - emailLayoutService.ts: the shared email shell's own fallback default
 *   (same value, kept local so the shell stays dependency-light).
 * - gmailWatcher.ts: `PROCESSED_LABEL_NAME` — the default Gmail label; the
 *   label actually written is the configured platform name.
 * - webhookSignatureService.ts / webhookDeliveryActions.ts: outbound header
 *   names and User-Agent — wire protocol existing consumers parse; renaming
 *   them breaks every receiver in production.
 * - localDemoSeed.ts / memoryMigration.ts: operator-run seed and one-time
 *   migration, not on any request path.
 *
 * Scope is convex/ (the backend builders).
 */
const ALLOWED_BUILDER_STRING_COUNTS: Record<string, number> = {
  "convex/emailLayoutService.ts": 2,
  "convex/gmailWatcher.ts": 1,
  "convex/localDemoSeed.ts": 2,
  "convex/memoryMigration.ts": 1,
  "convex/settingsService.ts": 0,
  "convex/webhookDeliveryActions.ts": 1,
  "convex/webhookSignatureService.ts": 2,
};

/**
 * The same rule for the admin screens and the shared components they use —
 * the "follow-up phase" the convex/ scan's original docstring promised,
 * executed 2026-08-21 (admin-clone-readiness plan, phase 3). Every
 * user-visible builder-name string in these roots now resolves through
 * `useSystemSettings().platformName`; entries here are the reviewed
 * survivors, shrink-only, same contract as the backend map. The public site
 * and user front end are deliberately outside this scan for now.
 */
const ADMIN_SCAN_ROOTS = ["src/app/(dashboard)/admin", "src/ui"];
const ALLOWED_ADMIN_BUILDER_STRING_COUNTS: Record<string, number> = {};

/**
 * The catalogues are copy too. Phase 4 moved admin wording into
 * `messages/*.json`, which the source scans above cannot see — the audit
 * caught three "Sonae" values that had escaped the de-brand that way. Every
 * catalogue value containing a builder name must be one of the reviewed key
 * paths below: all public-site or user-front-end surfaces, which stay
 * branded until each clone rebuilds them. Shrink-only; an admin-consumed
 * key must never appear here — parameterise it with {platformName} instead.
 */
const ALLOWED_BUILDER_STRING_MESSAGE_KEYS = new Set([
  "projectName",
  "landing.frameworkDescription",
  "landing.copyright",
  "dashboard.layers.platform",
  "dashboard.capabilities.items.0.body",
  "dashboard.capabilities.items.2.body",
  "dashboard.hosting.items.1.body",
]);

/**
 * The text of every string literal in a TS/JS source, comments and regex
 * literals excluded. A small state machine rather than a parser dependency:
 * it understands line and block comments, single/double/backtick strings with
 * escapes, `${}` interpolation (the literal parts count, the expressions are
 * re-scanned as code), and regex literals (via the standard
 * operator-precedes-regex heuristic) so an escaper like `/"/g` cannot flip
 * the string state.
 */
function extractStringLiteralText(source: string): string[] {
  const collected: string[] = [];
  let state:
    | "code"
    | "line"
    | "block"
    | "single"
    | "double"
    | "template"
    | "regex"
    | "regexClass" = "code";
  let current = "";
  const templateDepth: number[] = [];
  let lastCodeChar = "";

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (ch === "/" && next === "/") { state = "line"; i++; continue; }
      if (ch === "/" && next === "*") { state = "block"; i++; continue; }
      if (ch === "/") {
        if (lastCodeChar === "" || "([{,;:=!&|?+-*%<>~^".includes(lastCodeChar)) {
          state = "regex";
        } else {
          lastCodeChar = ch;
        }
        continue;
      }
      if (ch === "'") { state = "single"; current = ""; continue; }
      if (ch === '"') { state = "double"; current = ""; continue; }
      if (ch === "`") { state = "template"; current = ""; templateDepth.push(0); continue; }
      if (ch === "}" && templateDepth.length > 0) {
        if (templateDepth[templateDepth.length - 1] === 0) {
          state = "template";
          current = "";
        } else {
          templateDepth[templateDepth.length - 1]--;
          lastCodeChar = ch;
        }
        continue;
      }
      if (ch === "{" && templateDepth.length > 0) {
        templateDepth[templateDepth.length - 1]++;
        lastCodeChar = ch;
        continue;
      }
      if (!/\s/.test(ch)) lastCodeChar = ch;
      continue;
    }
    if (state === "line") { if (ch === "\n") state = "code"; continue; }
    if (state === "block") { if (ch === "*" && next === "/") { state = "code"; i++; } continue; }
    if (state === "regex") {
      if (ch === "\\") { i++; continue; }
      if (ch === "[") { state = "regexClass"; continue; }
      if (ch === "/" || ch === "\n") { state = "code"; lastCodeChar = "x"; }
      continue;
    }
    if (state === "regexClass") {
      if (ch === "\\") { i++; continue; }
      if (ch === "]") state = "regex";
      continue;
    }
    if (ch === "\\") { current += ch + (next ?? ""); i++; continue; }
    if (state === "single") {
      if (ch === "'") { collected.push(current); state = "code"; lastCodeChar = "x"; } else current += ch;
      continue;
    }
    if (state === "double") {
      if (ch === '"') { collected.push(current); state = "code"; lastCodeChar = "x"; } else current += ch;
      continue;
    }
    // template
    if (ch === "`") { collected.push(current); state = "code"; lastCodeChar = "x"; templateDepth.pop(); continue; }
    if (ch === "$" && next === "{") { collected.push(current); current = ""; state = "code"; lastCodeChar = "{"; i++; continue; }
    current += ch;
  }

  return collected;
}

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

  test("builder names appear in backend strings only at the reviewed sites", () => {
    const failures: string[] = [];

    for (const filePath of walk(path.join(repoRoot, "convex"))) {
      const relativePath = toRepoRelative(filePath);
      if (/\.test\.(ts|tsx)$/.test(relativePath)) continue;
      if (![".ts", ".tsx", ".mjs", ".js"].includes(path.extname(relativePath))) continue;

      const strings = extractStringLiteralText(fs.readFileSync(filePath, "utf8"));
      let count = 0;
      for (const literal of strings) {
        for (const name of BUILDER_STRINGS) {
          count += literal.split(name).length - 1;
        }
      }

      const allowed = ALLOWED_BUILDER_STRING_COUNTS[relativePath] ?? 0;
      if (count > allowed) {
        failures.push(
          `${relativePath} has ${count} builder-name string(s), allowance is ${allowed}. ` +
            `Customer-visible copy must resolve the platform name from settings ` +
            `(resolvePlatformName / internal.settings.getEmailBranding), not hardcode the shipped default.`,
        );
      } else if (count < allowed) {
        failures.push(
          `${relativePath} has ${count} builder-name string(s) but the allowance says ${allowed}. ` +
            `The allowlist is shrink-only: lower this file's entry in ALLOWED_BUILDER_STRING_COUNTS so it cannot grow back.`,
        );
      }
    }

    expect(
      failures,
      [
        "The platform name is configurable (systemSettings.platformName); a hardcoded builder name",
        "in a backend string ships the wrong identity to every deployment made from this repo.",
        "",
        ...failures,
      ].join("\n"),
    ).toEqual([]);
  });

  test("builder names appear in admin-screen strings only at the reviewed sites", () => {
    const failures: string[] = [];

    for (const root of ADMIN_SCAN_ROOTS) {
      for (const filePath of walk(path.join(repoRoot, root))) {
        const relativePath = toRepoRelative(filePath);
        if (/\.test\.(ts|tsx)$/.test(relativePath)) continue;
        if (![".ts", ".tsx"].includes(path.extname(relativePath))) continue;

        const strings = extractStringLiteralText(fs.readFileSync(filePath, "utf8"));
        let count = 0;
        for (const literal of strings) {
          // Module specifiers are string literals too, and the internal
          // component names (SonaeModal etc.) live in import paths. A path
          // is not user-visible copy; the components' own rendered text is
          // still scanned like any other literal.
          if (literal.startsWith("@/") || literal.startsWith("./") || literal.startsWith("../")) continue;
          for (const name of BUILDER_STRINGS) {
            count += literal.split(name).length - 1;
          }
        }

        const allowed = ALLOWED_ADMIN_BUILDER_STRING_COUNTS[relativePath] ?? 0;
        if (count > allowed) {
          failures.push(
            `${relativePath} has ${count} builder-name string(s), allowance is ${allowed}. ` +
              `Admin screens resolve the platform name via useSystemSettings().platformName, ` +
              `never a hardcoded builder name.`,
          );
        } else if (count < allowed) {
          failures.push(
            `${relativePath} has ${count} builder-name string(s) but the allowance says ${allowed}. ` +
              `Shrink-only: lower this file's entry in ALLOWED_ADMIN_BUILDER_STRING_COUNTS.`,
          );
        }
      }
    }

    expect(
      failures,
      [
        "A clone renames itself by setting platformName in admin settings; a hardcoded",
        "builder name in an admin-screen string undoes that for every product cloned",
        "from this repo.",
        "",
        ...failures,
      ].join("\n"),
    ).toEqual([]);
  });

  test("builder names appear in catalogue values only at the reviewed keys", () => {
    const failures: string[] = [];

    for (const catalogue of ["messages/en.json", "messages/it.json"]) {
      const walkValues = (node: unknown, prefix: string) => {
        if (typeof node === "string") {
          const carries = BUILDER_STRINGS.some((name) => node.includes(name));
          if (carries && !ALLOWED_BUILDER_STRING_MESSAGE_KEYS.has(prefix)) {
            failures.push(`${catalogue}: ${prefix} = ${JSON.stringify(node)}`);
          }
          return;
        }
        if (node && typeof node === "object") {
          for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            walkValues(value, prefix ? `${prefix}.${key}` : key);
          }
        }
      };
      walkValues(JSON.parse(fs.readFileSync(path.join(repoRoot, catalogue), "utf8")), "");
    }

    const staleAllowances = [...ALLOWED_BUILDER_STRING_MESSAGE_KEYS].filter((key) => {
      return !["messages/en.json", "messages/it.json"].some((catalogue) => {
        const data = JSON.parse(fs.readFileSync(path.join(repoRoot, catalogue), "utf8"));
        const value = key.split(".").reduce<unknown>(
          (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
          data,
        );
        return typeof value === "string" && BUILDER_STRINGS.some((name) => value.includes(name));
      });
    });
    for (const key of staleAllowances) {
      failures.push(`stale allowance: ${key} no longer carries a builder name — remove its entry (shrink-only).`);
    }

    expect(
      failures,
      [
        "A catalogue value with a hardcoded builder name undoes the rename-by-settings",
        "de-brand for every clone. Use a {platformName} parameter, or — for public-site",
        "and user-front-end copy only — add the key to the reviewed list.",
        "",
        ...failures,
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
