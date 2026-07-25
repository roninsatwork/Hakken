import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Structural enforcement of tenancy on client-callable Convex functions.
 *
 * Tenancy was previously enforced only by convention: each of ~360 public
 * functions had to remember to resolve the caller and scope its reads. The
 * discipline was high, but nothing made an omission impossible.
 *
 * Text-matching for a guard call does not work — a guard delegated into a
 * domain helper (for example `getKnowledgeDocumentsForScope`, which does
 * authenticate) is invisible to a regex, so such a check produces false
 * positives and gets ignored. Instead this asserts a *syntactic* fact: which
 * builder declared the function. A function declared with `tenantQuery` cannot
 * run unauthenticated, because authentication happens before the handler.
 *
 * The allowlist in `authz-migration-allowlist.json` starts holding every
 * pre-existing function and may only shrink. New functions must use a builder.
 */

const repoRoot = process.cwd();
const convexDir = path.join(repoRoot, "convex");
const allowlistPath = path.join(convexDir, "authz-migration-allowlist.json");

/** Builders that establish authentication, or record a deliberate public surface. */
const TENANT_BUILDERS = [
  "tenantQuery",
  "tenantMutation",
  "adminQuery",
  "adminMutation",
  "superAdminQuery",
  "superAdminMutation",
  "tenantAction",
  "adminAction",
  "superAdminAction",
  "publicQuery",
  "publicMutation",
  "publicAction",
] as const;

/** Raw Convex builders: client-callable with no guarantees attached. */
const RAW_PUBLIC_BUILDERS = ["query", "mutation", "action"] as const;

type FunctionDeclaration = { id: string; builder: string };

function convexSourceFiles() {
  return fs
    .readdirSync(convexDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .sort();
}

function declarationsIn(fileName: string): FunctionDeclaration[] {
  const contents = fs.readFileSync(path.join(convexDir, fileName), "utf8");
  const pattern = /export const (\w+)\s*=\s*(\w+)\(/g;
  const declarations: FunctionDeclaration[] = [];

  for (const match of contents.matchAll(pattern)) {
    const [, exportName, builder] = match;
    declarations.push({ id: `${fileName}:${exportName}`, builder });
  }

  return declarations;
}

function allDeclarations() {
  return convexSourceFiles().flatMap(declarationsIn);
}

const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8")) as {
  maxEntries: number;
  pending: string[];
};

describe("tenancy enforcement", () => {
  test("new client-callable functions must use a tenant builder", () => {
    const allowed = new Set(allowlist.pending);

    const violations = allDeclarations()
      .filter((declaration) => (RAW_PUBLIC_BUILDERS as readonly string[]).includes(declaration.builder))
      .filter((declaration) => !allowed.has(declaration.id))
      .map((declaration) => `${declaration.id} uses raw \`${declaration.builder}\``);

    expect(
      violations,
      [
        "Client-callable Convex functions must be declared with a builder from convex/tenantFunctions.ts",
        "(tenantQuery/tenantMutation, adminQuery/adminMutation, superAdminQuery/superAdminMutation),",
        "or with publicQuery/publicMutation/publicAction plus a written reason if the surface is",
        "deliberately unauthenticated. Do not add entries to authz-migration-allowlist.json:",
        "it exists only to retire the pre-existing backlog.",
        "",
        ...violations,
      ].join("\n"),
    ).toEqual([]);
  });

  test("the allowlist only shrinks", () => {
    expect(
      allowlist.pending.length,
      `The migration allowlist grew to ${allowlist.pending.length}, above its recorded maximum of ${allowlist.maxEntries}. ` +
        "Lower maxEntries as functions are migrated; never raise it.",
    ).toBeLessThanOrEqual(allowlist.maxEntries);
  });

  test("the allowlist has no stale entries", () => {
    // A migrated or deleted function left on the list would silently permit a
    // future function of the same name to skip the check.
    const existing = new Set(
      allDeclarations()
        .filter((declaration) => (RAW_PUBLIC_BUILDERS as readonly string[]).includes(declaration.builder))
        .map((declaration) => declaration.id),
    );

    const stale = allowlist.pending.filter((id) => !existing.has(id));

    expect(
      stale,
      `These functions no longer use a raw builder, so remove them from authz-migration-allowlist.json and lower maxEntries:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  test("deliberately public surfaces state a reason", () => {
    const missingReason: string[] = [];

    for (const fileName of convexSourceFiles()) {
      const contents = fs.readFileSync(path.join(convexDir, fileName), "utf8");
      const pattern = /export const (\w+)\s*=\s*(publicQuery|publicMutation|publicAction)\(\{([\s\S]{0,400}?)\n\}\)/g;

      for (const match of contents.matchAll(pattern)) {
        const [, exportName, , body] = match;
        if (!/\breason:\s*["'`]/.test(body)) {
          missingReason.push(`${fileName}:${exportName}`);
        }
      }
    }

    expect(
      missingReason,
      `Unauthenticated surfaces must record why they are public:\n${missingReason.join("\n")}`,
    ).toEqual([]);
  });

  test("every recognised builder actually exists", () => {
    // Otherwise a typo in TENANT_BUILDERS would silently whitelist a name that
    // nothing exports, letting an unguarded function pass the check above.
    const builderSource = fs.readFileSync(path.join(convexDir, "tenantFunctions.ts"), "utf8");
    const missing = TENANT_BUILDERS.filter(
      (builder) =>
        !new RegExp(`export (?:const|function) ${builder}\\b`).test(builderSource),
    );

    expect(
      missing,
      `These builders are referenced by the enforcement test but not exported from tenantFunctions.ts:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});
