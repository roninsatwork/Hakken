import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { planRecipe } from "./product-recipes/plan.mjs";
import { applyEntity } from "./entity-generator/plan.mjs";

let root;
const write = (file, value) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), value);
};
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const tree = () =>
  fs
    .readdirSync(root, { recursive: true })
    .filter((file) => fs.statSync(path.join(root, file)).isFile())
    .sort()
    .map((file) => [file, read(file)]);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hakken-recipes-"));
  const files = {
    "convex/schema.ts":
      'import { defineSchema, defineTable } from "convex/server";\nimport { v } from "convex/values";\nexport default defineSchema({});\n',
    "convex/_generated/api.d.ts":
      'import type { ApiFromModules } from "convex/server";\ndeclare const fullApi: ApiFromModules<{}>;\n',
    "src/ui/components/layout/SidebarNavTrees.tsx":
      "export function AdminNavTree() { return (<> </>); }\nexport function UserNavTree() { return (<> </>); }\n",
    "src/app/(dashboard)/admin/layout.tsx":
      '"use client";\nconst allowed = ADMIN_SECTION_ROLES.includes(user?.role ?? "");\n',
    "src/ui/components/layout/SidebarNavigation.tsx":
      '"use client";\nfunction getActiveItemFromPathname(pathname: string) { return pathname; }\n{isAdmin ? (\n                  <AdminNavTree />) : <UserNavTree />}',
    "hakken.product.json": fs.readFileSync("hakken.product.json", "utf8"),
    "messages/en.json": '{"admin":{},"sidebar":{}}',
    "messages/it.json": '{"admin":{},"sidebar":{}}',
  };
  for (const [file, contents] of Object.entries(files)) write(file, contents);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

test("the CLI lists recipes and defaults to a non-writing full preview", () => {
  const cli = path.resolve("scripts/product-recipe.mjs");
  const run = (...args) =>
    execFileSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: "utf8",
    });
  expect(run("--list")).toContain("knowledge-assistant");
  const before = tree();
  expect(run("service-desk")).toContain("Preview only");
  expect(tree()).toEqual(before);
  expect(run("service-desk", "--apply")).toContain("Applied locally");
  expect(
    JSON.parse(read("product.entities.json")).entities.map(
      (entity) => entity.table,
    ),
  ).toEqual(["serviceCustomers", "serviceCases"]);
});
test("multiple recipes compose relationships, shared wiring and both locales", () => {
  for (const id of ["service-desk", "project-tracker", "knowledge-assistant"])
    applyEntity(planRecipe(root, id));
  expect(JSON.parse(read("product.entities.json")).entities).toHaveLength(4);
  expect(JSON.parse(read("product.recipes.json")).recipes).toHaveLength(3);
  expect(read("convex/productEntityReferences.ts")).toContain("serviceCases");
  expect(read("convex/productEntityReferences.ts")).toContain("deliverables");
  expect(read("convex/productEntitySchema.ts")).toContain(
    "deliveryProjectsSchema",
  );
  expect(read("messages/it.json")).toContain("Data obiettivo");
  expect(Object.keys(JSON.parse(read("messages/en.json")).admin)).toEqual(
    Object.keys(JSON.parse(read("messages/it.json")).admin),
  );
});
test("a collision in the last feature prevents the entire recipe", () => {
  write("convex/serviceCases.ts", "product-owned");
  const before = tree();
  expect(() => planRecipe(root, "service-desk")).toThrow(/overwrite/);
  expect(tree()).toEqual(before);
});
test("a stale whole-recipe plan fails before any writes", () => {
  const plan = planRecipe(root, "project-tracker");
  write("messages/it.json", '{"admin":{},"sidebar":{},"local":"edit"}');
  const before = tree();
  expect(() => applyEntity(plan)).toThrow(/changed after preview/);
  expect(tree()).toEqual(before);
});
test("a late write failure rolls back every earlier feature and shared file", () => {
  const plan = planRecipe(root, "service-desk");
  const before = tree();
  const original = fs.linkSync;
  vi.spyOn(fs, "linkSync").mockImplementation((source, destination) => {
    if (String(destination).endsWith("product.recipes.json"))
      throw new Error("disk failure");
    return original(source, destination);
  });
  expect(() => applyEntity(plan)).toThrow("disk failure");
  expect(tree()).toEqual(before);
});
test("knowledge setup writes only the guide/registry and preserves product configuration", () => {
  const before = read("hakken.product.json");
  const plan = planRecipe(root, "knowledge-assistant");
  expect(plan.edits.map((edit) => edit.path)).toEqual([
    "docs/product/knowledge-assistant.md",
    "product.recipes.json",
  ]);
  applyEntity(plan);
  expect(read("hakken.product.json")).toBe(before);
  expect(read("docs/product/knowledge-assistant.md")).toContain(
    "No new tables, pages, agents, credentials",
  );
  expect(() => planRecipe(root, "knowledge-assistant")).toThrow(
    /already installed/,
  );
});
test("refuses a symlink guide directory and unknown recipes", () => {
  fs.mkdirSync(path.join(root, "docs"));
  fs.symlinkSync(root, path.join(root, "docs/product"));
  expect(() => planRecipe(root, "knowledge-assistant")).toThrow(/symlink/);
  expect(() => planRecipe(root, "unknown")).toThrow(/Unknown recipe/);
});
test("does not overwrite a custom guide or accept a malformed registry", () => {
  write("docs/product/service-desk.md", "My existing guide");
  expect(() => planRecipe(root, "service-desk")).toThrow(/overwrite/);
  write("product.recipes.json", '{"version":2,"recipes":[]}');
  expect(() => planRecipe(root, "project-tracker")).toThrow(/Invalid/);
});
