#!/usr/bin/env node

/**
 * Scaffold a new domain entity.
 *
 * Adding one by hand touches eight to ten files, two of which every feature must
 * edit — the sidebar and both locale files. That cost is paid on every entity,
 * by every developer, and the parts that get skipped under time pressure are the
 * ones that matter: the tenant guard, the second locale, the test.
 *
 * So this does not generate a sketch to fill in. It generates code that passes
 * the repo's own gates as written:
 *
 * - Convex functions declared with the tenant builders, because
 *   `authzEnforcement.test.ts` fails CI for anything using a raw `query` /
 *   `mutation`, and the allowlist may only shrink.
 * - Both `messages/en.json` and `messages/it.json`, because a key present in one
 *   locale and missing from the other renders as the raw key to whoever is
 *   reading in the other language.
 * - A real test, not a placeholder — it asserts the tenant boundary holds,
 *   which is the assertion most worth having and the one most often deferred.
 *
 * Nothing is overwritten. A name that collides with existing files stops the
 * run and reports what it found, because half-generating over someone's work is
 * worse than refusing.
 *
 * Usage:
 *   node scripts/generate-entity.mjs <name> [--field name:type ...]
 *   node scripts/generate-entity.mjs supplier --field name:string --field active:boolean
 *
 * The `--dry-run` flag prints what would be written and touches nothing.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const FIELD_TYPES = {
  string: { validator: "v.string()", ts: "string", form: "text" },
  number: { validator: "v.number()", ts: "number", form: "number" },
  boolean: { validator: "v.boolean()", ts: "boolean", form: "checkbox" },
};

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** `supplier` → `Supplier`; `purchase-order` → `PurchaseOrder`. */
function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** `purchase-order` → `purchaseOrder`. */
function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** `purchase-order` → `purchase-order` (route segment). */
function toKebabCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .join("-")
    .toLowerCase();
}

/**
 * Naive pluralisation.
 *
 * Deliberately simple, and reported back so it can be corrected: guessing
 * "supplys" is obvious at a glance and cheap to fix, whereas silently choosing a
 * table name the developer did not expect is not.
 */
function pluralise(value) {
  if (/[^aeiou]y$/.test(value)) return `${value.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z)$/.test(value)) return `${value}es`;
  return `${value}s`;
}

function parseArgs(argv) {
  const [name, ...rest] = argv;
  if (!name || name.startsWith("--")) {
    fail("Usage: node scripts/generate-entity.mjs <name> [--field name:type ...] [--dry-run]");
  }

  const fields = [];
  let dryRun = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg !== "--field") fail(`Unrecognised argument: ${arg}`);

    const spec = rest[index + 1];
    index += 1;
    if (!spec) fail("--field needs a value, for example --field name:string");

    const [fieldName, fieldType] = spec.split(":");
    if (!fieldName || !fieldType) fail(`Field must be name:type — got '${spec}'`);
    if (!FIELD_TYPES[fieldType]) {
      fail(`Unknown field type '${fieldType}'. Supported: ${Object.keys(FIELD_TYPES).join(", ")}`);
    }
    fields.push({ name: fieldName, ...FIELD_TYPES[fieldType], type: fieldType });
  }

  // Every entity needs something to show in a table and search on.
  if (fields.length === 0) {
    fields.push({ name: "name", ...FIELD_TYPES.string, type: "string" });
  }

  return { name, fields, dryRun };
}

function buildNames(rawName) {
  const singular = toCamelCase(rawName);
  const table = pluralise(singular);
  return {
    singular,
    plural: table,
    Pascal: toPascalCase(rawName),
    PascalPlural: toPascalCase(table),
    route: toKebabCase(pluralise(rawName)),
    label: toPascalCase(rawName).replace(/([a-z])([A-Z])/g, "$1 $2"),
  };
}

function convexModule(names, fields) {
  const createArgs = fields.map((field) => `    ${field.name}: ${field.validator},`).join("\n");
  const updateArgs = fields
    .map((field) => `    ${field.name}: v.optional(${field.validator}),`)
    .join("\n");
  const patchFields = fields
    .map((field) => `      ...(args.${field.name} !== undefined ? { ${field.name}: args.${field.name} } : {}),`)
    .join("\n");
  const insertFields = fields.map((field) => `      ${field.name}: args.${field.name},`).join("\n");

  return `import { v } from "convex/values";
import { adminMutation, adminQuery, assertTenantAccess, requireTenant } from "./tenantFunctions";

/**
 * ${names.label} records.
 *
 * Declared with the tenant builders rather than raw \`query\`/\`mutation\`:
 * authentication happens before the handler runs, so there is no path into this
 * module that skips it. Reads are scoped by the caller's company at the index,
 * not filtered afterwards — a filter is something a later edit can drop without
 * anything failing.
 */

const ${names.plural.toUpperCase().replace(/[^A-Z]/g, "_")}_LIMIT = 500;

export const list${names.PascalPlural} = adminQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = requireTenant(ctx);

    return await ctx.db
      .query("${names.plural}")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(${names.plural.toUpperCase().replace(/[^A-Z]/g, "_")}_LIMIT);
  },
});

export const get${names.Pascal} = adminQuery({
  args: { id: v.id("${names.plural}") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    // Throws for another tenant's record rather than returning null, so a
    // probing caller cannot tell "not yours" from "does not exist".
    assertTenantAccess(ctx, record);
    return record;
  },
});

export const create${names.Pascal} = adminMutation({
  args: {
${createArgs}
  },
  handler: async (ctx, args) => {
    const companyId = requireTenant(ctx);
    const now = Date.now();

    return await ctx.db.insert("${names.plural}", {
${insertFields}
      companyId,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.userId,
    });
  },
});

export const update${names.Pascal} = adminMutation({
  args: {
    id: v.id("${names.plural}"),
${updateArgs}
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    assertTenantAccess(ctx, record);

    await ctx.db.patch(args.id, {
${patchFields}
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const delete${names.Pascal} = adminMutation({
  args: { id: v.id("${names.plural}") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    assertTenantAccess(ctx, record);

    await ctx.db.delete(args.id);
    return true;
  },
});
`;
}

function schemaTable(names, fields) {
  const columns = fields.map((field) => `    ${field.name}: ${field.validator},`).join("\n");
  return `  ${names.plural}: defineTable({
${columns}
    companyId: v.id("companies"),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_created", ["companyId", "createdAt"]),
`;
}

function convexTest(names, fields) {
  const sampleValue = (field) =>
    field.type === "string" ? `"sample"` : field.type === "number" ? "1" : "true";
  const createArgs = fields.map((field) => `      ${field.name}: ${sampleValue(field)},`).join("\n");

  return `import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The assertion worth having here is the tenant boundary: one company's admin
 * must not be able to read or change another's records. It is also the one most
 * easily lost to a later edit, because nothing else fails when a scope check
 * goes missing.
 */

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type TestConvex = ReturnType<typeof makeTest>;

async function seedCompanyAdmin(t: TestConvex, name: string) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    const userId = await ctx.db.insert("users", {
      email: \`admin@\${name.toLowerCase()}.test\`,
      role: "ADMIN",
      companyId,
    });
    return { companyId, userId };
  });
}

describe("${names.label}", () => {
  test("an admin can create and read their own records", async () => {
    const t = makeTest();
    const acme = await seedCompanyAdmin(t, "Acme");
    const client = t.withIdentity({ subject: acme.userId });

    const id = await client.mutation(api.${names.plural}.create${names.Pascal}, {
${createArgs}
    });

    const record = await client.query(api.${names.plural}.get${names.Pascal}, { id });
    expect(record?.companyId).toBe(acme.companyId);

    const all = await client.query(api.${names.plural}.list${names.PascalPlural}, {});
    expect(all.map((row) => row._id)).toContain(id);
  });

  test("one company cannot read another's records", async () => {
    const t = makeTest();
    const acme = await seedCompanyAdmin(t, "Acme");
    const globex = await seedCompanyAdmin(t, "Globex");

    const id = await t.withIdentity({ subject: acme.userId })
      .mutation(api.${names.plural}.create${names.Pascal}, {
${createArgs}
      });

    const intruder = t.withIdentity({ subject: globex.userId });
    await expect(intruder.query(api.${names.plural}.get${names.Pascal}, { id })).rejects.toThrow();
    // Nor does it leak through the list.
    expect(await intruder.query(api.${names.plural}.list${names.PascalPlural}, {})).toHaveLength(0);
  });

  test("one company cannot change or delete another's records", async () => {
    const t = makeTest();
    const acme = await seedCompanyAdmin(t, "Acme");
    const globex = await seedCompanyAdmin(t, "Globex");

    const id = await t.withIdentity({ subject: acme.userId })
      .mutation(api.${names.plural}.create${names.Pascal}, {
${createArgs}
      });

    const intruder = t.withIdentity({ subject: globex.userId });
    await expect(intruder.mutation(api.${names.plural}.update${names.Pascal}, { id })).rejects.toThrow();
    await expect(intruder.mutation(api.${names.plural}.delete${names.Pascal}, { id })).rejects.toThrow();
  });

  test("an unauthenticated caller gets nothing", async () => {
    const t = makeTest();
    await expect(t.query(api.${names.plural}.list${names.PascalPlural}, {})).rejects.toThrow();
  });
});
`;
}

function adminPage(names, fields) {
  const headerCells = fields
    .map((field) => `                <AdminTableHeaderCell>{t("columns.${field.name}")}</AdminTableHeaderCell>`)
    .join("\n");
  const bodyCells = fields
    .map((field) => `                    <td className="px-4 py-3 text-[13px] text-foreground">{String(row.${field.name} ?? "")}</td>`)
    .join("\n");

  return `"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Boxes, Trash2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import {
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "../_components/AdminTable";
import { AdminConfirmationModal } from "../_components/AdminConfirmationModal";

const COLUMN_COUNT = ${fields.length + 1};

export default function ${names.PascalPlural}Page() {
  const t = useTranslations("admin.${names.plural}");
  const rows = useQuery(api.${names.plural}.list${names.PascalPlural});
  const remove = useMutation(api.${names.plural}.delete${names.Pascal});

  const [searchTerm, setSearchTerm] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<Id<"${names.plural}"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const visibleRows = useMemo(() => {
    if (!rows) return undefined;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
  }, [rows, searchTerm]);

  async function handleDelete() {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await remove({ id: pendingDeleteId });
      setPendingDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        icon={<Boxes className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <AdminSearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t("searchPlaceholder")} />

      <AdminTableShell>
        <thead>
          <AdminTableHeaderRow>
${headerCells}
            <AdminTableHeaderCell align="right">{t("columns.actions")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {visibleRows === undefined ? (
            <AdminTableLoadingRow colSpan={COLUMN_COUNT} />
          ) : visibleRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={COLUMN_COUNT}
              icon={<Boxes className="w-5 h-5" />}
              label={t("empty")}
            />
          ) : (
            visibleRows.map((row) => (
              <tr key={row._id} className="border-b border-border-dim/60 last:border-0">
${bodyCells}
                <td className="px-4 py-3">
                  <AdminRowActions>
                    <AdminRowIconButton
                      label={t("actions.delete")}
                      tone="danger"
                      onClick={() => setPendingDeleteId(row._id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </AdminRowIconButton>
                  </AdminRowActions>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>

      <AdminConfirmationModal
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title={t("deleteConfirm.title")}
        cancelLabel={t("actions.cancel")}
        confirmLabel={t("actions.delete")}
        isSubmitting={isDeleting}
        onConfirm={handleDelete}
      >
        <p className="text-[13px] text-muted">{t("deleteConfirm.description")}</p>
      </AdminConfirmationModal>
    </div>
  );
}
`;
}

function translations(names, fields, locale) {
  const columns = Object.fromEntries([
    ...fields.map((field) => [
      field.name,
      locale === "it" ? field.name : field.name.charAt(0).toUpperCase() + field.name.slice(1),
    ]),
    ["actions", locale === "it" ? "Azioni" : "Actions"],
  ]);

  return locale === "it"
    ? {
      title: names.label,
      subtitle: `Gestisci i record ${names.label}.`,
      searchPlaceholder: "Cerca...",
      empty: "Nessun record ancora.",
      columns,
      actions: { delete: "Elimina", cancel: "Annulla" },
      deleteConfirm: {
        title: "Eliminare questo record?",
        description: "Questa azione non può essere annullata.",
      },
    }
    : {
      title: names.label,
      subtitle: `Manage ${names.label} records.`,
      searchPlaceholder: "Search...",
      empty: "No records yet.",
      columns,
      actions: { delete: "Delete", cancel: "Cancel" },
      deleteConfirm: {
        title: "Delete this record?",
        description: "This cannot be undone.",
      },
    };
}

/**
 * Add translations without reformatting the file.
 *
 * These files are 2,400 lines and 4-space indented. A naive
 * `JSON.parse`/`stringify` round trip rewrites every line, burying a ten-line
 * addition in a four-thousand-line diff that nobody can review.
 */
function addTranslations(localePath, key, value, dryRun) {
  const raw = fs.readFileSync(localePath, "utf8");
  const parsed = JSON.parse(raw);

  if (parsed.admin?.[key]) {
    return { skipped: true, reason: `admin.${key} already exists` };
  }

  parsed.admin = parsed.admin ?? {};
  parsed.admin[key] = value;

  if (!dryRun) {
    fs.writeFileSync(localePath, `${JSON.stringify(parsed, null, 4)}\n`);
  }
  return { skipped: false };
}

function main() {
  const { name, fields, dryRun } = parseArgs(process.argv.slice(2));
  const names = buildNames(name);

  const files = [
    {
      path: path.join(repoRoot, "convex", `${names.plural}.ts`),
      contents: convexModule(names, fields),
    },
    {
      path: path.join(repoRoot, "convex", `${names.plural}.test.ts`),
      contents: convexTest(names, fields),
    },
    {
      path: path.join(repoRoot, "src", "app", "(dashboard)", "admin", names.route, "page.tsx"),
      contents: adminPage(names, fields),
    },
  ];

  const existing = files.filter((file) => fs.existsSync(file.path));
  if (existing.length > 0) {
    fail(
      "Refusing to overwrite existing files:\n    "
      + existing.map((file) => path.relative(repoRoot, file.path)).join("\n    "),
    );
  }

  console.log(`\n  Entity:  ${names.Pascal}`);
  console.log(`  Table:   ${names.plural}   (rename in convex/schema.ts if this reads wrong)`);
  console.log(`  Route:   /admin/${names.route}`);
  console.log(`  Fields:  ${fields.map((field) => `${field.name}:${field.type}`).join(", ")}\n`);

  for (const file of files) {
    const relative = path.relative(repoRoot, file.path);
    if (dryRun) {
      console.log(`  would write  ${relative}`);
      continue;
    }
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.contents);
    console.log(`  wrote        ${relative}`);
  }

  for (const locale of ["en", "it"]) {
    const localePath = path.join(repoRoot, "messages", `${locale}.json`);
    const result = addTranslations(localePath, names.plural, translations(names, fields, locale), dryRun);
    console.log(result.skipped
      ? `  skipped      messages/${locale}.json (${result.reason})`
      : `  ${dryRun ? "would write " : "wrote       "} messages/${locale}.json`);
  }

  console.log(`
  Two steps left, both deliberately manual:

  1. Add the table to convex/schema.ts:

${schemaTable(names, fields).split("\n").map((line) => `  ${line}`).join("\n")}
     Left to you because schema.ts defines ordering and relationships a
     generator cannot infer, and a bad automated edit there is expensive.

  2. Add a sidebar link in src/ui/components/layout/SidebarNavigation.tsx
     with navKey "${names.plural}", so it can be hidden by navigation profile.

  Then: npx convex codegen && npm run typecheck && npx vitest run convex/${names.plural}.test.ts
`);
}

main();
