import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseArgs } from "../scripts/entity-generator/model.mjs";
import { applyEntity, planEntity } from "../scripts/entity-generator/plan.mjs";

const root = process.cwd();
let sandbox: string;
const fixtureFiles: Record<string, string> = {
  "convex/schema.ts":
    'import { defineSchema, defineTable } from "convex/server";\nimport { v } from "convex/values";\nexport default defineSchema({});\n',
  "convex/_generated/api.d.ts":
    'import type { ApiFromModules } from "convex/server";\ndeclare const fullApi: ApiFromModules<{}>;\n',
  "src/ui/components/layout/SidebarNavTrees.tsx":
    "export function AdminNavTree() { return (<> </>); }\nexport function UserNavTree() { return (<> </>); }\n",
  "src/app/(dashboard)/admin/layout.tsx":
    '\"use client\";\nconst allowed = ADMIN_SECTION_ROLES.includes(user?.role ?? \"\");\n',
  "src/ui/components/layout/SidebarNavigation.tsx":
    '"use client";\nfunction getActiveItemFromPathname(pathname: string) { return pathname; }\n{isAdmin ? (\n                  <AdminNavTree />) : <UserNavTree />}',
};
function read(file: string) {
  return fs.readFileSync(path.join(sandbox, file), "utf8");
}
function write(file: string, contents: string) {
  fs.mkdirSync(path.dirname(path.join(sandbox, file)), { recursive: true });
  fs.writeFileSync(path.join(sandbox, file), contents);
}
function plan(...args: string[]) {
  return planEntity(sandbox, parseArgs(args).entity);
}
function generate(...args: string[]) {
  const result = plan(...args);
  applyEntity(result);
  return result;
}
function snapshot() {
  return fs
    .readdirSync(sandbox, { recursive: true })
    .filter((p) => fs.statSync(path.join(sandbox, String(p))).isFile())
    .map((p) => [String(p), read(String(p))]);
}
beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "entity-gen-"));
  for (const [file, contents] of Object.entries(fixtureFiles))
    write(file, contents);
  for (const locale of ["en", "it"])
    write(
      `messages/${locale}.json`,
      '{\n  "admin": {},\n  "sidebar": {},\n  "unchanged": "keep me"\n}\n',
    );
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("complete feature generator", () => {
  test("CLI previews by default and --apply creates a complete local feature", () => {
    const before = snapshot();
    const output = execFileSync(
      process.execPath,
      [path.join(root, "scripts/generate-entity.mjs"), "supplier"],
      { cwd: sandbox, encoding: "utf8" },
    );
    expect(output).toContain("Preview only");
    expect(snapshot()).toEqual(before);
    execFileSync(
      process.execPath,
      [path.join(root, "scripts/generate-entity.mjs"), "supplier", "--apply"],
      { cwd: sandbox },
    );
    for (const file of [
      "convex/suppliers.ts",
      "convex/suppliers.test.ts",
      "src/app/(dashboard)/admin/suppliers/page.tsx",
      "src/app/(dashboard)/admin/suppliers/[id]/page.tsx",
      "src/app/(dashboard)/admin/suppliers/EntityEditor.tsx",
      "src/app/(dashboard)/admin/suppliers/error.tsx",
    ])
      expect(read(file).length).toBeGreaterThan(100);
    expect(read("convex/schema.ts")).toContain("...productEntityTables");
    expect(read("convex/entities/suppliersSchema.ts")).toContain("defineTable");
    expect(read("convex/_generated/api.d.ts")).toContain(
      "suppliers: typeof suppliers",
    );
    expect(read("src/ui/components/layout/SidebarNavTrees.tsx")).toContain(
      'href="/admin/suppliers"',
    );
  });
  test("preserves both locale dictionaries and existing formatting outside the inserted namespaces", () => {
    generate("supplier");
    const en = JSON.parse(read("messages/en.json"));
    const it = JSON.parse(read("messages/it.json"));
    expect(Object.keys(en.admin.suppliers)).toEqual(
      Object.keys(it.admin.suppliers),
    );
    expect(it.admin.suppliers.actions.delete).toBe("Elimina");
    expect(en.sidebar.suppliers).toBe("Suppliers");
    expect(read("messages/en.json")).toContain('  "unchanged": "keep me"\n');
  });
  test("uses indexed cursor and search queries, explicit validators and protected mutations", () => {
    generate("supplier");
    const backend = read("convex/suppliers.ts");
    expect(backend.match(/adminMutation\(/g)).toHaveLength(3);
    expect(backend.match(/returns:/g)).toHaveLength(5);
    expect(backend).toContain("numItems: 15");
    expect(backend).toContain("withSearchIndex");
    expect(backend).not.toContain(".collect(");
    expect(backend).not.toContain(".filter(");
    expect(backend).toContain("record.companyId !== companyId");
    expect(backend).toContain("record.revision !== args.expectedRevision");
  });
  test("registers relationships and prevents deletion of referenced parents", () => {
    generate("supplier");
    generate(
      "purchase-order",
      "--field",
      "title:string",
      "--field",
      "supplierId:ref:suppliers",
    );
    expect(read("convex/productEntityReferences.ts")).toContain(
      "by_company_supplierId",
    );
    expect(read("convex/purchaseOrders.ts")).toContain(
      "supplierIdRecord.companyId !== companyId",
    );
    expect(
      read("src/app/(dashboard)/admin/purchase-orders/SupplierIdReference.tsx"),
    ).toContain("api.suppliers.list");
    expect(read("convex/purchaseOrders.test.ts")).toContain(
      "protects referenced records",
    );
  });
  test("refuses unknown relationship targets before any writes", () => {
    const before = snapshot();
    expect(() =>
      generate(
        "supplier",
        "--field",
        "name:string",
        "--field",
        "userId:ref:users",
        "--field-label-it",
        "userId=Utente",
      ),
    ).toThrow("earlier generated");
    expect(snapshot()).toEqual(before);
  });
  test("refuses duplicate files, tables, routes and locale keys without partial writes", () => {
    for (const file of [
      "convex/suppliers.ts",
      "src/app/(dashboard)/admin/suppliers/custom.txt",
    ]) {
      write(file, "custom");
      const before = snapshot();
      expect(() => generate("supplier")).toThrow(/overwrite|already exists/);
      expect(snapshot()).toEqual(before);
      fs.rmSync(path.join(sandbox, file));
      if (file.includes("custom.txt"))
        fs.rmdirSync(path.dirname(path.join(sandbox, file)));
    }
    write("messages/it.json", '{"admin":{"suppliers":{}},"sidebar":{}}');
    const before = snapshot();
    expect(() => generate("supplier")).toThrow("already exists");
    expect(snapshot()).toEqual(before);
  });
  test("refuses repeat generation", () => {
    generate("supplier");
    const before = snapshot();
    expect(() => generate("supplier")).toThrow("already registered");
    expect(snapshot()).toEqual(before);
  });
  test("detects custom edits to relationship guards and related schema", () => {
    generate("supplier");
    const original = read("convex/productEntityReferences.ts");
    write("convex/productEntityReferences.ts", original + "// custom\n");
    expect(() =>
      generate(
        "invoice",
        "--field",
        "name:string",
        "--field",
        "supplierId:ref:suppliers",
      ),
    ).toThrow("guard has changed");
    write("convex/productEntityReferences.ts", original);
    write(
      "convex/entities/suppliersSchema.ts",
      read("convex/entities/suppliersSchema.ts").replace(
        'searchField: "name"',
        'searchField: "other"',
      ),
    );
    expect(() =>
      generate(
        "invoice",
        "--field",
        "name:string",
        "--field",
        "supplierId:ref:suppliers",
      ),
    ).toThrow("schema suppliers has changed");
  });
  test("refuses ambiguous schema and navigation anchors", () => {
    write(
      "convex/schema.ts",
      read("convex/schema.ts") + "\nconst extra = defineSchema({});\n",
    );
    expect(() => plan("supplier")).toThrow("found 2");
  });
  test("refuses files changed after planning", () => {
    const p = plan("supplier");
    write("messages/en.json", read("messages/en.json") + "\n");
    const before = snapshot();
    expect(() => applyEntity(p)).toThrow("changed after preview");
    expect(snapshot()).toEqual(before);
  });
  test("refuses symlink output directories and leaves their targets untouched", () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "entity-link-"));
    try {
      fs.mkdirSync(path.join(sandbox, "src/app/(dashboard)/admin"), {
        recursive: true,
      });
      fs.symlinkSync(
        external,
        path.join(sandbox, "src/app/(dashboard)/admin/suppliers"),
      );
      expect(() => plan("supplier")).toThrow("symlink");
      expect(fs.readdirSync(external)).toEqual([]);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
  test("rolls back earlier edits if a later write fails", () => {
    const p = plan("supplier");
    const before = snapshot();
    const rename = fs.renameSync;
    let calls = 0;
    vi.spyOn(fs, "renameSync").mockImplementation((...args) => {
      if (++calls === 3) throw new Error("disk failure");
      return rename(...args);
    });
    expect(() => applyEntity(p)).toThrow("disk failure");
    expect(snapshot()).toEqual(before);
  });
  test("atomic replacement does not mutate hard-linked originals", () => {
    const external = path.join(os.tmpdir(), `entity-original-${Date.now()}`);
    fs.linkSync(path.join(sandbox, "convex/schema.ts"), external);
    const original = fs.readFileSync(external, "utf8");
    try {
      generate("supplier");
      expect(fs.readFileSync(external, "utf8")).toBe(original);
    } finally {
      fs.rmSync(external);
    }
  });
  test.each(["../escape", "Supplier", "foo/bar", "0thing", "constructor"])(
    "rejects unsafe entity %s",
    (name) => {
      expect(() => parseArgs([name])).toThrow();
    },
  );
  test.each([
    "companyId:string",
    "expectedRevision:number",
    "x:datetime",
    "x:string:ignored",
    "x:ref",
    "__proto__:string",
    "x-y:string",
  ])("rejects invalid field %s", (field) => {
    expect(() => parseArgs(["supplier", "--field", field])).toThrow();
  });
  test("requires real Italian copy for custom domain vocabulary", () => {
    expect(() => parseArgs(["asset", "--field", "name:string"])).toThrow(
      "--label-it",
    );
    expect(() =>
      parseArgs(["asset", "--label-it", "Beni", "--field", "serial:string"]),
    ).toThrow("--field-label-it");
    const e = parseArgs([
      "asset",
      "--label-it",
      "Beni",
      "--field",
      "serial:string",
      "--field-label-it",
      "serial=Numero di serie",
    ]).entity;
    expect(e.labelIt).toBe("Beni");
    expect(e.fields[0].labelIt).toBe("Numero di serie");
  });
  test("budgets only the one-time schema wiring and refuses existing schema-size drift", () => {
    const original =
      read("convex/schema.ts") + "// existing schema line\n".repeat(1047);
    write("convex/schema.ts", original);
    write(
      "code-ratchets.json",
      JSON.stringify({ moduleSize: { "convex/schema.ts": 1000 } }),
    );
    expect(() => plan("supplier")).toThrow("already stale");
    write(
      "code-ratchets.json",
      JSON.stringify({ moduleSize: { "convex/schema.ts": 1050 } }),
    );
    generate("supplier");
    expect(
      JSON.parse(read("code-ratchets.json")).moduleSize["convex/schema.ts"],
    ).toBe(1100);
    const after = read("convex/schema.ts");
    generate("invoice");
    expect(read("convex/schema.ts")).toBe(after);
  });
  test("requires a label, unique fields and unambiguous apply intent", () => {
    expect(() => parseArgs(["supplier", "--field", "active:boolean"])).toThrow(
      "string field",
    );
    expect(() =>
      parseArgs([
        "supplier",
        "--field",
        "name:string",
        "--field",
        "name:number",
      ]),
    ).toThrow("duplicate");
    expect(() => parseArgs(["supplier", "--apply", "--dry-run"])).toThrow(
      "Choose",
    );
    expect(parseArgs(["company-policy"]).entity.table).toBe("companyPolicies");
    expect(parseArgs(["supplier", "--dry-run"]).apply).toBe(false);
  });
});
