import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { parseArgs, label } from "./model.mjs";
import {
  backend,
  backendTest,
  referencesModule,
  entitySchema,
  schemaRegistry,
} from "./backend.mjs";
import {
  ROUTES_FILE,
  routesModule,
  routesTest,
  accessTest,
  wireAccess,
} from "./access.mjs";
import { frontendTest } from "./frontend-test.mjs";
import {
  listPage,
  detailPage,
  editor,
  reference,
  errorPage,
} from "./frontend.mjs";

const NAV = "src/ui/components/layout/SidebarNavTrees.tsx";
const REGISTRY = "product.entities.json";
const SCHEMA_REGISTRY = "convex/productEntitySchema.ts";
const REFERENCES = "convex/productEntityReferences.ts";
function source(text, file) {
  const tree = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (tree.parseDiagnostics.length)
    throw new Error(
      `Cannot parse ${file}; fix its syntax before generating a feature.`,
    );
  return tree;
}
function exactlyOne(tree, predicate, description) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${description}; found ${matches.length}. No files changed.`,
    );
  return matches[0];
}
function safePath(root, relative) {
  let current = root;
  for (const part of relative.split("/")) {
    if (!part || part === "..") throw new Error("Unsafe output path.");
    current = path.join(current, part);
    {
      try {
        if (fs.lstatSync(current).isSymbolicLink())
          throw new Error(`Refusing symlink: ${relative}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  return current;
}
export function readFile(root, relative, optional = false) {
  const target = safePath(root, relative);
  if (optional && !fs.existsSync(target)) return null;
  return fs.readFileSync(target, "utf8");
}
function translations(e, it) {
  const columns = Object.fromEntries(
    e.fields.map((f) => [f.name, it ? f.labelIt : label(f.name)]),
  );
  return {
    title: it ? e.labelIt : label(e.table),
    subtitle: it
      ? `Gestisci i record: ${e.labelIt}.`
      : `Manage ${label(e.table)} records.`,
    columns,
    searchPlaceholder: it ? "Cerca per nome…" : "Search by label…",
    empty: it ? "Nessun record trovato." : "No records found.",
    loading: it ? "Caricamento…" : "Loading…",
    missing: it ? "Record non disponibile." : "Record unavailable.",
    invalid: it
      ? "Compila tutti i campi con valori validi."
      : "Complete every field with a valid value.",
    saveFailed: it
      ? "Impossibile salvare. Riprova."
      : "Unable to save. Please try again.",
    deleteFailed: it
      ? "Impossibile eliminare. Riprova."
      : "Unable to delete. Please try again.",
    loadFailed: it
      ? "Impossibile caricare questo record."
      : "Unable to load this record.",
    retry: it ? "Riprova" : "Retry",
    yes: it ? "Sì" : "Yes",
    no: "No",
    choose: it ? "Seleziona un record…" : "Choose a record…",
    searchRelated: it ? "Cerca record collegati" : "Search related records",
    previous: it ? "Precedente" : "Previous",
    next: it ? "Successiva" : "Next",
    page: it ? "Pagina {page}" : "Page {page}",
    actions: it
      ? {
          create: "Crea",
          edit: "Modifica",
          save: "Salva",
          saving: "Salvataggio…",
          delete: "Elimina",
          cancel: "Annulla",
          back: "Torna all’elenco",
        }
      : {
          create: "Create",
          edit: "Edit",
          save: "Save",
          saving: "Saving…",
          delete: "Delete",
          cancel: "Cancel",
          back: "Back to list",
        },
    deleteConfirm: it
      ? {
          title: "Eliminare questo record?",
          description:
            "Questa azione non può essere annullata. Rimuovi prima eventuali collegamenti da altri record.",
        }
      : {
          title: "Delete this record?",
          description:
            "This cannot be undone. Remove links from other records first.",
        },
  };
}
function insertObjectProperty(raw, object, text) {
  const position = object.properties.pos;
  return raw.slice(0, position) + "\n" + text + raw.slice(position);
}
function addLocale(raw, section, key, value) {
  const data = JSON.parse(raw);
  if (!data[section] || Object.hasOwn(data[section], key))
    throw new Error(
      `Locale section missing or key already exists: ${section}.${key}`,
    );
  const tree = ts.parseJsonText("locale.json", raw);
  const object = exactlyOne(
    tree,
    (node) =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(tree) === JSON.stringify(section) &&
      ts.isObjectLiteralExpression(node.initializer),
    `locale ${section}`,
  ).initializer;
  const indent = /\n( +)"/.exec(raw)?.[1] ?? "  ";
  const content = JSON.stringify({ [key]: value }, null, indent)
    .split("\n")
    .slice(1, -1)
    .map((line) => indent + line)
    .join("\n");
  return insertObjectProperty(
    raw,
    object,
    content + (object.properties.length ? "," : "") + "\n",
  );
}
function registry(raw) {
  if (raw === null) return [];
  const doc = JSON.parse(raw);
  if (doc.version !== 1 || !Array.isArray(doc.entities))
    throw new Error("Unsupported product entity registry.");
  const seen = new Set();
  for (const e of doc.entities) {
    const rebuilt = parseArgs([
      e.name,
      "--label-it",
      e.labelIt,
      ...e.fields.flatMap((f) => [
        "--field",
        `${f.name}:${f.type}${f.target ? ":" + f.target : ""}`,
        "--field-label-it",
        `${f.name}=${f.labelIt}`,
      ]),
    ]).entity;
    if (JSON.stringify(e) !== JSON.stringify(rebuilt) || seen.has(e.table))
      throw new Error("Invalid entity registry definition.");
    for (const f of e.fields.filter((f) => f.target))
      if (!seen.has(f.target))
        throw new Error(
          "Registry relationships must reference earlier generated entities.",
        );
    seen.add(e.table);
  }
  return doc.entities;
}
export function planEntity(root, entity, overlay = new Map()) {
  // Recipes plan all features against one virtual tree before writing anything.
  const read = (directory, relative, optional = false) => {
    safePath(directory, relative);
    return overlay.has(relative)
      ? overlay.get(relative)
      : readFile(directory, relative, optional);
  };
  root = fs.realpathSync(root);
  const edits = [];
  const add = (relative, after, create = false) => {
    const before = read(root, relative, true);
    if (create && before !== null)
      throw new Error(`Refusing to overwrite existing file: ${relative}`);
    if (before !== after) edits.push({ path: relative, before, after });
  };
  const entities = registry(read(root, REGISTRY, true));
  if (
    entities.some((e) => e.table === entity.table || e.route === entity.route)
  )
    throw new Error("Entity already registered.");
  for (const field of entity.fields.filter((f) => f.target))
    if (!entities.some((e) => e.table === field.target))
      throw new Error(
        `Relationship ${field.name} must target an earlier generated table; unknown: ${field.target}`,
      );
  const oldReferences = read(root, REFERENCES, true);
  if (entities.length && oldReferences !== referencesModule(entities))
    throw new Error(
      "Generated relationship guard has changed. Review it before adding another feature.",
    );
  if (!entities.length && oldReferences !== null)
    throw new Error("Relationship guard exists without a registry.");
  const all = [...entities, entity];
  const existingRoutes = read(root, ROUTES_FILE, true);
  if (existingRoutes !== (entities.length ? routesModule(entities) : null))
    throw new Error("Generated route registry has changed.");
  const routesTestFile = "src/lib/productEntityRoutes.test.ts";
  const previousRouteTest = read(root, routesTestFile, true);
  if (previousRouteTest !== (entities.length ? routesTest(entities) : null))
    throw new Error("Generated route checks have changed.");
  add(ROUTES_FILE, routesModule(all));
  add(routesTestFile, routesTest(all));
  const accessTestFile = "src/lib/productEntityAccess.test.tsx";
  if (
    read(root, accessTestFile, true) !==
    (entities.length ? accessTest(entities) : null)
  )
    throw new Error("Generated access checks have changed.");
  add(accessTestFile, accessTest(all));
  const layoutFile = "src/app/(dashboard)/admin/layout.tsx";
  const sidebarFile = "src/ui/components/layout/SidebarNavigation.tsx";
  const access = wireAccess(read(root, layoutFile), read(root, sidebarFile));
  add(layoutFile, access.layout);
  add(sidebarFile, access.sidebar);
  const schema = read(root, "convex/schema.ts");
  const schemaTree = source(schema, "schema.ts");
  const schemaCall = exactlyOne(
    schemaTree,
    (n) =>
      ts.isCallExpression(n) &&
      n.expression.getText(schemaTree) === "defineSchema",
    "defineSchema call",
  );
  const tables = schemaCall.arguments[0];
  if (!tables || !ts.isObjectLiteralExpression(tables))
    throw new Error("Schema must use a literal table map.");
  const tableNames = tables.properties.map((p) =>
    p.name?.getText(schemaTree).replace(/['"]/g, ""),
  );
  if (tableNames.includes(entity.table))
    throw new Error(`Schema table already exists: ${entity.table}`);
  for (const field of entity.fields.filter((f) => f.target)) {
    const target = entities.find((e) => e.table === field.target);
    if (
      read(root, `convex/entities/${field.target}Schema.ts`, true)?.replace(
        /\s/g,
        "",
      ) !== entitySchema(target).replace(/\s/g, "")
    )
      throw new Error(
        `Related schema ${field.target} has changed; review the relationship contract first.`,
      );
  }
  const schemaImport =
    'import { productEntityTables } from "./productEntitySchema";';
  if (entities.length) {
    if (
      read(root, SCHEMA_REGISTRY, true) !== schemaRegistry(entities) ||
      !schema.includes(schemaImport) ||
      tables.properties.filter(
        (p) =>
          ts.isSpreadAssignment(p) &&
          p.expression.getText(schemaTree) === "productEntityTables",
      ).length !== 1
    )
      throw new Error("Generated schema registry has changed.");
  } else {
    if (
      read(root, SCHEMA_REGISTRY, true) !== null ||
      schema.includes("productEntityTables")
    )
      throw new Error("Generated schema binding already exists.");
    const wiredSchema =
      schemaImport +
      "\n" +
      insertObjectProperty(schema, tables, "  ...productEntityTables,\n");
    add("convex/schema.ts", wiredSchema);
    // Account only for the one-time registry import/spread, not arbitrary
    // pre-existing growth. Later entities do not grow the root schema.
    const count = (text) =>
      text.split("\n").length - Number(text.endsWith("\n"));
    const band = (text) => Math.ceil(count(text) / 50) * 50;
    if (count(schema) > 1000) {
      const ratchets = JSON.parse(read(root, "code-ratchets.json"));
      if (ratchets.moduleSize?.["convex/schema.ts"] !== band(schema))
        throw new Error(
          "Schema size baseline is already stale; review it before generating a feature.",
        );
      if (band(wiredSchema) !== band(schema)) {
        ratchets.moduleSize["convex/schema.ts"] = band(wiredSchema);
        add("code-ratchets.json", JSON.stringify(ratchets, null, 2) + "\n");
      }
    }
  }
  add(SCHEMA_REGISTRY, schemaRegistry(all));
  add(`convex/entities/${entity.table}Schema.ts`, entitySchema(entity), true);
  const nav = read(root, NAV);
  if (nav.includes(`/admin/${entity.route}`))
    throw new Error("Navigation route already exists.");
  const navTree = source(nav, NAV);
  const admin = exactlyOne(
    navTree,
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "AdminNavTree",
    "AdminNavTree function",
  );
  const fragment = exactlyOne(
    admin,
    (n) =>
      ts.isReturnStatement(n) &&
      n.expression &&
      ts.isParenthesizedExpression(n.expression) &&
      ts.isJsxFragment(n.expression.expression),
    "admin navigation return",
  ).expression.expression;
  const pos = fragment.openingFragment.end;
  const link = `\n      {!isAuditor && <NavItem icon={Building2} label={t('${entity.table}')} href="/admin/${entity.route}"
        isActive={pathname === '/admin/${entity.route}' || pathname.startsWith('/admin/${entity.route}/')}
        onClick={() => setActiveItem('${label(entity.table)}')} />}\n`;
  const user = exactlyOne(
    navTree,
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "UserNavTree",
    "UserNavTree function",
  );
  const userFragment = exactlyOne(
    user,
    (n) =>
      ts.isReturnStatement(n) &&
      n.expression &&
      ts.isParenthesizedExpression(n.expression) &&
      ts.isJsxFragment(n.expression.expression),
    "user navigation return",
  ).expression.expression;
  const userPos = userFragment.openingFragment.end;
  const userLink = link.replace(
    "!isAuditor",
    '(user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "READ_ONLY")',
  );
  const navEdits = [
    { pos, text: link },
    { pos: userPos, text: userLink },
  ].sort((a, b) => b.pos - a.pos);
  let newNav = nav;
  for (const edit of navEdits)
    newNav = newNav.slice(0, edit.pos) + edit.text + newNav.slice(edit.pos);
  add(NAV, newNav);
  // Offline type augmentation only; Convex's next normal codegen owns this file afterwards.
  const api = read(root, "convex/_generated/api.d.ts");
  const apiTree = source(api, "api.d.ts");
  const apiType = exactlyOne(
    apiTree,
    (n) =>
      ts.isTypeReferenceNode(n) &&
      n.typeName.getText(apiTree) === "ApiFromModules",
    "ApiFromModules type",
  );
  const moduleMap = apiType.typeArguments?.[0];
  if (!moduleMap || !ts.isTypeLiteralNode(moduleMap))
    throw new Error("Unsupported Convex API declaration.");
  if (
    moduleMap.members.some((p) => p.name?.getText(apiTree) === entity.table) ||
    apiTree.statements.some(
      (s) =>
        ts.isImportDeclaration(s) &&
        s.importClause?.namedBindings?.name?.text === entity.table,
    )
  )
    throw new Error("Convex API module already exists.");
  const withMember =
    api.slice(0, moduleMap.members.pos) +
    `\n  ${entity.table}: typeof ${entity.table};` +
    api.slice(moduleMap.members.pos);
  add(
    "convex/_generated/api.d.ts",
    `import type * as ${entity.table} from "../${entity.table}.js";\n` +
      withMember,
  );
  for (const locale of ["en", "it"]) {
    const file = `messages/${locale}.json`;
    add(
      file,
      addLocale(
        addLocale(
          read(root, file),
          "admin",
          entity.table,
          translations(entity, locale === "it"),
        ),
        "sidebar",
        entity.table,
        locale === "it" ? entity.labelIt : label(entity.table),
      ),
    );
  }
  add(REGISTRY, JSON.stringify({ version: 1, entities: all }, null, 2) + "\n");
  add(REFERENCES, referencesModule(all));
  add(`convex/${entity.table}.ts`, backend(entity), true);
  add(`convex/${entity.table}.test.ts`, backendTest(entity, all), true);
  const route = `src/app/(dashboard)/admin/${entity.route}`;
  // Reject any pre-existing route, even if it contains only a custom layout or assets.
  if (
    fs.existsSync(safePath(root, route)) ||
    [...overlay.keys()].some((file) => file.startsWith(route + "/"))
  )
    throw new Error(`Route directory already exists: ${route}`);
  add(`${route}/page.tsx`, listPage(entity), true);
  add(`${route}/[id]/page.tsx`, detailPage(entity), true);
  add(`${route}/EntityEditor.tsx`, editor(entity), true);
  add(`${route}/error.tsx`, errorPage(entity), true);
  add(`${route}/EntityEditor.test.tsx`, frontendTest(entity, all), true);
  for (const field of entity.fields.filter((f) => f.target))
    add(
      `${route}/${field.name[0].toUpperCase() + field.name.slice(1)}Reference.tsx`,
      reference(
        entity,
        field,
        entities.find((e) => e.table === field.target),
      ),
      true,
    );
  return { root, entity, edits };
}
export function applyEntity(plan) {
  for (const edit of plan.edits)
    if (readFile(plan.root, edit.path, true) !== edit.before)
      throw new Error(`File changed after preview: ${edit.path}`);
  const done = [];
  const directories = [];
  const write = (relative, content, exclusive = false) => {
    const target = safePath(plan.root, relative);
    const temporary = target + ".entity-" + randomUUID();
    const mode = fs.existsSync(target) ? fs.statSync(target).mode : 0o644;
    try {
      fs.writeFileSync(temporary, content, { flag: "wx", mode });
      if (exclusive) fs.linkSync(temporary, target);
      else fs.renameSync(temporary, target);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  };
  try {
    for (const edit of plan.edits) {
      const target = safePath(plan.root, edit.path);
      const missing = [];
      let dir = path.dirname(target);
      while (!fs.existsSync(dir)) {
        missing.push(dir);
        dir = path.dirname(dir);
      }
      for (const next of missing.reverse()) {
        fs.mkdirSync(next);
        directories.push(next);
      }
      if (readFile(plan.root, edit.path, true) !== edit.before)
        throw new Error(`Concurrent edit: ${edit.path}`);
      write(edit.path, edit.after, edit.before === null);
      done.push(edit);
    }
  } catch (error) {
    for (const edit of done.reverse()) {
      if (readFile(plan.root, edit.path, true) !== edit.after)
        throw new Error(
          `Rollback stopped to preserve a concurrent edit: ${edit.path}. Original failure: ${error.message}`,
        );
      if (edit.before === null) fs.rmSync(safePath(plan.root, edit.path));
      else write(edit.path, edit.before);
    }
    for (const dir of directories.reverse()) {
      if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    }
    throw error;
  }
}
