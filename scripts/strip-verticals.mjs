import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { writeProvenance } from "./framework-snapshot.mjs";

// Only standalone comments are instructions. Examples in strings and prose are not.
const MARKER = /^\s*(?:\/\/|\{\/\*|<!--)\s*template:remove:(start|end)(?:[ \t]+([A-Za-z0-9_,]+))?/;
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md"]);
const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", ".hakken", ".next", ".next-arcade", ".claude", ".codex", ".agents", ".agent",
  ".auth", ".vercel", ".vscode", ".idea", ".npm-cache", "tmp", "coverage", "out",
  "build", "dist", "playwright-report", "test-results", "dev-export", "output",
]);
const MANIFEST = "template.verticals.json";
const FRAMEWORK_PATHS = [
  "scripts/generate-entity.mjs", "scripts/entity-generator/**",
  "scripts/product-recipe.mjs", "scripts/product-recipes/**",
  "scripts/framework-snapshot.mjs", "scripts/framework-update.mjs", "scripts/framework-updates/**",
  MANIFEST, "package.json", "package-lock.json", "code-ratchets.json", "convex/schema.ts",
  "hakken.product.json", "product.identity.ts", "scripts/init-product.mjs",
  "hakken.billing.json", "billing.config.ts", "scripts/billing-config.mjs",
  "convex/billing*", "convex/convex.config.ts",
  "src/app/(dashboard)/app/settings/billing/**", "src/app/(dashboard)/app/settings/_components/BillingLink.tsx",
  "scripts/product-config.mjs", "scripts/provider-requirements.mjs",
  "scripts/validate-setup.mjs", "scripts/verify-deployment-environment.mjs",
  "scripts/strip-verticals.mjs", "scripts/verify-template.mjs",
  "src/app/(dashboard)/app/arcade/**", "public/games/**", "convex/arcade*",
  "scripts/arcade/**", "playwright.arcade*", "tsconfig.arcade.json",
  "e2e/on-demand/ronins-run*.ts",
];

/** Arcade is framework code, even when an older caller passes only --keep base. */
export function loadKnownVerticals(root) {
  const registry = fs.readFileSync(path.join(root, "convex/utils/companyModules.ts"), "utf8");
  return new Set(["arcade", ...[...registry.matchAll(/vertical:\s*"([A-Za-z0-9_]+)"/g)]
    .map(match => match[1]).filter(name => name !== "base")]);
}

export function matchesPattern(value, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?").replace(/\u0001/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function safeSource(relative) {
  const parts = relative.split("/");
  if (parts.some(part => EXCLUDED_DIRS.has(part))) return false;
  const name = parts.at(-1);
  if (name.startsWith(".env") && name !== ".env.example") return false;
  return !/^(?:\.DS_Store|Thumbs\.db|movement_seed\.json|poseData\.json)$/.test(name)
    && !/\.(?:tsbuildinfo|log|jsonl|zip|pem|key|p12|pfx|backup|swp|swo)$/.test(name);
}

/** Git ignores are respected, and sensitive/local artifacts are denied even if tracked. */
export function sourceFiles(root) {
  let candidates = [];
  if (fs.existsSync(path.join(root, ".git"))) {
    candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  } else {
    const walk = (dir = "") => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const relative = dir ? `${dir}/${entry.name}` : entry.name;
        if (!safeSource(relative)) continue;
        if (entry.isDirectory()) walk(relative);
        else if (entry.isFile()) candidates.push(relative);
      }
    };
    walk();
  }
  return [...new Set(candidates)].filter(relative => safeSource(relative)
    && fs.existsSync(path.join(root, relative))
    && !relative.split("/").some((_, index, parts) =>
      fs.lstatSync(path.join(root, ...parts.slice(0, index + 1))).isSymbolicLink())
    && fs.statSync(path.join(root, relative)).isFile()).sort();
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, MANIFEST), "utf8"));
}

export function stripFences(text, file, known, remove = new Set()) {
  const errors = [];
  const kept = [];
  const stack = [];
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    const match = line.match(MARKER);
    const insideRemoved = stack.some((fence) => fence.removing);

    if (match && match[1] === "start") {
      const name = match[2];
      if (!name) {
        errors.push(`${at}: start fence names no vertical`);
      } else if (name.split(",").some(part => !known.has(part))) {
        errors.push(
          `${at}: unknown vertical "${name}" — known: ${[...known].sort().join(", ")}`
        );
      }
      // Comma-separated owners mean shared code: retain it while ANY owner remains.
      const removing = insideRemoved || (name !== undefined && name.split(",").every(part => remove.has(part)));
      stack.push({ name: name ?? "?", removing, at });
      if (!removing) kept.push(name ? line.replace(name, name.split(",").filter(part => !remove.has(part)).join(",")) : line);
      return;
    }

    if (match && match[1] === "end") {
      if (stack.length === 0) {
        errors.push(`${at}: end fence with no open start`);
        kept.push(line);
        return;
      }
      const fence = stack.pop();
      if (!fence.removing) kept.push(line);
      return;
    }

    if (!insideRemoved) kept.push(line);
  });

  for (const fence of stack) {
    errors.push(`${fence.at}: start fence for "${fence.name}" never closed`);
  }

  return { errors, text: kept.join("\n") };
}

/** Validate both line boundaries and ownership before writing any output. */
export function checkTree(root) {
  const known = loadKnownVerticals(root);
  const files = sourceFiles(root);
  const errors = [];
  let fenced = 0;
  for (const relative of files) {
    if (!CODE_EXTENSIONS.has(path.extname(relative))) continue;
    const text = fs.readFileSync(path.join(root, relative), "utf8");
    if (!text.split("\n").some(line => MARKER.test(line))) continue;
    fenced += 1;
    errors.push(...stripFences(text, relative, known).errors);
  }
  const manifest = readManifest(root);
  if (manifest.version !== 1 || JSON.stringify(manifest.alwaysKeep) !== '["base","arcade"]') {
    errors.push(`${MANIFEST}: version 1 must always keep base and arcade`);
  }
  for (const name of known) {
    if (name !== "arcade" && !manifest.verticals[name]?.paths?.length) {
      errors.push(`${MANIFEST}: ${name} must declare owned paths`);
    }
  }
  for (const [name, definition] of Object.entries(manifest.verticals)) {
    if (name === "arcade" || !known.has(name)) errors.push(`${MANIFEST}: unknown/removable framework vertical ${name}`);
    for (const pattern of definition.paths) {
      if (path.isAbsolute(pattern) || pattern.split("/").includes("..") || pattern.includes("\\")) {
        errors.push(`${MANIFEST}: unsafe owned path ${pattern}`);
      } else if (!files.some(file => matchesPattern(file, pattern))) {
        errors.push(`${MANIFEST}: owned path matches no source files: ${pattern}`);
      }
    }
  }
  for (const shared of manifest.shared ?? []) {
    if (!shared.owners.length || shared.owners.some(name => !manifest.verticals[name])) {
      errors.push(`${MANIFEST}: shared paths require registered optional owners`);
    }
    for (const pattern of shared.paths) {
      if (path.isAbsolute(pattern) || pattern.split("/").includes("..") || pattern.includes("\\")) {
        errors.push(`${MANIFEST}: unsafe shared path ${pattern}`);
      } else if (!files.some(file => matchesPattern(file, pattern))) errors.push(`${MANIFEST}: shared path matches no source files: ${pattern}`);
    }
  }
  for (const file of files) {
    const owners = Object.entries(manifest.verticals).filter(([, def]) => def.paths.some(pattern => matchesPattern(file, pattern)));
    const shared = (manifest.shared ?? []).filter(def => def.paths.some(pattern => matchesPattern(file, pattern)));
    if (owners.length + shared.length > 1) errors.push(`${file}: owned by ${owners.map(([name]) => name).join(", ")}; overlapping ownership`);
    if ((owners.length || shared.length) && FRAMEWORK_PATHS.some(pattern => matchesPattern(file, pattern))) {
      errors.push(`${file}: framework and Arcade paths cannot be owned by optional modules`);
    }
  }
  return { errors, fenced, known, files, manifest };
}

function deleteKey(object, dotted) {
  const keys = dotted.split(".");
  const parent = keys.slice(0, -1).reduce((current, key) => current?.[key], object);
  if (parent) delete parent[keys.at(-1)];
}

function rewriteJson(relative, text, removed, manifest, removedFiles) {
  const value = JSON.parse(text);
  if (relative === MANIFEST) {
    for (const name of removed) delete value.verticals[name];
    value.shared = (value.shared ?? []).map(shared => ({ ...shared, owners: shared.owners.filter(name => !removed.has(name)) }))
      .filter(shared => shared.owners.length);
  } else if (relative === "package.json") {
    for (const name of removed) {
      const definition = manifest.verticals[name];
      for (const dependency of definition.dependencies) {
        delete value.dependencies?.[dependency];
        delete value.devDependencies?.[dependency];
        delete value.overrides?.[dependency];
      }
      for (const script of Object.keys(value.scripts ?? {})) {
        if (definition.scripts.some(pattern => matchesPattern(script, pattern))) delete value.scripts[script];
      }
    }
  } else if (/^messages\/(en|it)\.json$/.test(relative)) {
    for (const name of removed) for (const key of manifest.verticals[name].messages) deleteKey(value, key);
  } else if (/^scripts\/(screen-kit|layering)-allowlist\.json$/.test(relative)
    || relative === "convex/authz-migration-allowlist.json") {
    const clean = item => {
      if (Array.isArray(item)) return item.filter(entry => typeof entry !== "string" || !removedFiles.has(entry)).map(clean);
      if (item && typeof item === "object") return Object.fromEntries(Object.entries(item)
        .filter(([key]) => !removedFiles.has(key)).map(([key, entry]) => [key, clean(entry)]));
      return item;
    };
    return JSON.stringify(clean(value), null, 2) + "\n";
  } else return text;
  return JSON.stringify(value, null, 2) + "\n";
}

/** Tighten copied ratchets by the contribution removed; never grant extra slack. */
function adjustRatchets(root, contents, removedFiles) {
  if (!contents.has("code-ratchets.json")) return;
  const ratchets = JSON.parse(contents.get("code-ratchets.json"));
  for (const [file, ceiling] of Object.entries(ratchets.moduleSize)) {
    if (removedFiles.has(file)) { delete ratchets.moduleSize[file]; continue; }
    const text = contents.get(file);
    if (text === undefined) continue;
    const count = text.split("\n").length - Number(text.endsWith("\n"));
    if (count <= 1000) delete ratchets.moduleSize[file];
    else ratchets.moduleSize[file] = Math.min(ceiling, Math.ceil(count / 50) * 50);
  }
  const families = "red|rose|amber|yellow|emerald|green|sky|blue|indigo|orange|purple|cyan|violet|slate|zinc|gray|fuchsia|teal|lime|pink|stone|neutral";
  const palette = new RegExp("(?:^|[\\s\"'`:])(?:[a-z-]+:)*(?:text|bg|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|shadow)-(?:" + families + ")-\\d{2,3}(?:/\\d{1,3})?", "g");
  const colors = text => (text.match(palette)?.length ?? 0) + (text.match(/\[#[0-9a-fA-F]{3,8}\]/g)?.length ?? 0);
  for (const file of new Set([...removedFiles, ...contents.keys()])) {
    if (!file.startsWith("src/") || !/\.tsx?$/.test(file) || /\.(test|spec)\./.test(file)) continue;
    const original = fs.readFileSync(path.join(root, file), "utf8");
    const output = contents.get(file) ?? "";
    if (!["/app/(public)/", "/demos/movements/_lib/movementPalette.ts", "/ui/components/charts/chartPalette.ts", "/e2e/", "/test/"].some(part => file.includes(part))) {
      ratchets.theme -= Math.max(0, colors(original) - colors(output));
    }
    if (file.endsWith(".tsx") && original.includes("useTranslations") && !output.includes("useTranslations")) {
      for (const floor of ratchets.i18nFloors) if (file.startsWith(floor.root + "/")) floor.floor -= 1;
    }
  }
  contents.set("code-ratchets.json", JSON.stringify(ratchets, null, 2) + "\n");
}

/** A reproducible preview; code is transformed in memory, assets are never loaded. */
export function planTemplate(root, keep = ["base"], checked = checkTree(root)) {
  const { errors, known, files, manifest } = checked;
  const keepSet = new Set(["base", "arcade", ...keep]);
  for (const name of keepSet) {
    if (name !== "base" && !known.has(name)) throw new Error(`--keep names unknown vertical "${name}"`);
  }
  const remove = new Set([...known].filter(name => !keepSet.has(name)));
  const removedFiles = new Set(files.filter(file => [...remove].some(name =>
    manifest.verticals[name]?.paths.some(pattern => matchesPattern(file, pattern)))
    || (manifest.shared ?? []).some(shared => shared.owners.every(name => remove.has(name))
      && shared.paths.some(pattern => matchesPattern(file, pattern)))));
  const contents = new Map();
  const changedFiles = [];
  for (const relative of files) {
    if (removedFiles.has(relative)) continue;
    const extension = path.extname(relative);
    if (!CODE_EXTENSIONS.has(extension) && ![".json", ".snap"].includes(extension) && path.basename(relative) !== ".npmrc") continue;
    const original = fs.readFileSync(path.join(root, relative), "utf8");
    let text = CODE_EXTENSIONS.has(extension) ? stripFences(original, relative, known, remove).text : original;
    if (extension === ".json") text = rewriteJson(relative, text, remove, manifest, removedFiles);
    if (path.basename(relative) === ".npmrc") {
      // Preserve install policy, never auth tokens, credentials or private registries.
      text = text.split("\n").filter(line => /^(?:engine-strict|strict-peer-deps|legacy-peer-deps|ignore-scripts|save-exact)\s*=\s*(?:true|false)\s*$/.test(line)).join("\n") + "\n";
    }
    if (extension === ".snap") {
      text = text.split("\n").filter(line => ![...remove].some(name => {
        const definition = manifest.verticals[name];
        return (definition.routes ?? []).some(route => line.includes(` -> ${route}`))
          || (definition.navLabels ?? []).some(label => line.trim() === `"${label}",`);
      })).join("\n").replace(/("\w+": )\[\n\s*\]/g, "$1[]");
    }
    if (extension === ".md") {
      const omitted = candidate => removedFiles.has(candidate.replace(/^@\//, ""));
      text = text.replace(/`([^`\n]+)`/g, (span, candidate) => omitted(candidate)
        ? "optional module (not included in this copy)" : span);
      text = text.replace(/\[([^\]\n]+)\]\(([^\n]+)\)/g, (link, label, target) => {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), target.split("#")[0]));
        return omitted(resolved) ? `${label} (not included in this copy)` : link;
      });
    }
    if (relative === "convex/_generated/api.d.ts") {
      // Retain Convex's generated types, removing only modules excluded from this copy.
      const symbols = new Set();
      for (const match of text.matchAll(/import type \* as (\w+) from "\.\.\/(.+)\.js";/g)) {
        if (removedFiles.has(`convex/${match[2]}.ts`)) symbols.add(match[1]);
      }
      text = text.split("\n").filter(line => ![...symbols].some(symbol =>
        line.startsWith(`import type * as ${symbol} from `) || new RegExp(`: typeof ${symbol};$`).test(line))).join("\n");
    }
    contents.set(relative, text);
    if (text !== original) changedFiles.push(relative);
  }
  adjustRatchets(root, contents, removedFiles);
  if (contents.has("code-ratchets.json") && !changedFiles.includes("code-ratchets.json")
    && contents.get("code-ratchets.json") !== fs.readFileSync(path.join(root, "code-ratchets.json"), "utf8")) changedFiles.push("code-ratchets.json");
  return { errors: [...errors], remove, keep: [...keepSet], removedFiles, changedFiles, contents,
    files: files.filter(file => !removedFiles.has(file)), manifest };
}

function importsOf(text, relative) {
  const ast = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true);
  const imports = [];
  const apiReferences = [];
  const tables = new Set();
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ target: node.moduleSpecifier.text, names: ts.isImportDeclaration(node)
        && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
        ? node.importClause.namedBindings.elements.map(element => (element.propertyName ?? element.name).text) : [] });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push({ target: node.arguments[0].text, names: [] });
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const parent = node.expression;
      if (ts.isIdentifier(parent.expression) && ["api", "internal"].includes(parent.expression.text)) {
        apiReferences.push({ module: parent.name.text, name: node.name.text });
      }
      if (parent.getText(ast) === "schema.tables") tables.add(node.name.text);
    }
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression;
      if ((ts.isPropertyAccessExpression(callee) && ["id", "query", "insert"].includes(callee.name.text))
        || (ts.isIdentifier(callee) && callee.text === "whole")) tables.add(node.arguments[0].text);
    }
    if (ts.isTypeReferenceNode(node) && ["Doc", "Id"].includes(node.typeName.getText(ast))) {
      const type = node.typeArguments?.[0];
      if (type && ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) tables.add(type.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const exports = new Set();
  for (const statement of ast.statements) {
    if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (statement.name) exports.add(statement.name.text);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) exports.add(declaration.name.text);
    }
  }
  return { imports, exports, apiReferences, tables };
}

/** Catch lost files and exported names without compiling sixteen copies in CI. */
export function checkReferences(root, plan, cache = new Map()) {
  const allFiles = new Set([...plan.files, ...plan.removedFiles]);
  const errors = [];
  const schemaPath = path.join(root, "convex/schema.ts");
  const tableNames = text => new Set([...text.matchAll(/^\s+(\w+): defineTable\(/gm)].map(match => match[1]));
  const originalTables = fs.existsSync(schemaPath) ? tableNames(fs.readFileSync(schemaPath, "utf8")) : new Set();
  const retainedTables = tableNames(plan.contents.get("convex/schema.ts") ?? "");
  const removedTables = new Set([...originalTables].filter(name => !retainedTables.has(name)));
  const parse = (file, text) => {
    const key = file + "\0" + text;
    if (!cache.has(key)) cache.set(key, importsOf(text, file));
    return cache.get(key);
  };
  const resolve = (from, target) => {
    const stem = target.startsWith("@/") ? target.slice(2) : target.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(from), target)) : null;
    if (stem === null) return null;
    const bare = stem.replace(/\.jsx?$/, "");
    return [stem, bare + ".ts", bare + ".tsx", bare + ".d.ts", stem + ".mjs", stem + ".js", stem + "/index.ts", stem + "/index.tsx"]
      .find(file => allFiles.has(file));
  };
  for (const [relative, text] of plan.contents) {
    if (!/\.(?:[cm]?js|jsx|tsx?)$/.test(relative)) continue;
    const { imports, apiReferences, tables } = parse(relative, text);
    for (const name of tables) if (removedTables.has(name)) errors.push(`${relative}: references removed table ${name}`);
    for (const reference of apiReferences) {
      const target = `convex/${reference.module}.ts`;
      if (plan.removedFiles.has(target)) errors.push(`${relative}: calls removed backend ${reference.module}.${reference.name}`);
      else if (plan.changedFiles.includes(target)) {
        const original = parse(target, fs.readFileSync(path.join(root, target), "utf8")).exports;
        const retained = parse(target, plan.contents.get(target)).exports;
        if (original.has(reference.name) && !retained.has(reference.name)) errors.push(`${relative}: calls removed function ${reference.module}.${reference.name}`);
      }
    }
    for (const imported of imports) {
      const target = resolve(relative, imported.target);
      if (target && plan.removedFiles.has(target)) {
        errors.push(`${relative}: imports removed file ${target}`);
      } else if (target && plan.changedFiles.includes(target)) {
        const original = parse(target, fs.readFileSync(path.join(root, target), "utf8")).exports;
        const retained = parse(target, plan.contents.get(target)).exports;
        for (const name of imported.names) if (original.has(name) && !retained.has(name)) {
          errors.push(`${relative}: imports removed export ${name} from ${target}`);
        }
      }
      for (const name of plan.remove) for (const dependency of plan.manifest.verticals[name].dependencies) {
        if (imported.target === dependency || imported.target.startsWith(dependency + "/")) {
          errors.push(`${relative}: imports removed package ${dependency}`);
        }
      }
    }
  }
  return errors;
}

export function checkCombinations(root) {
  const checked = checkTree(root);
  const errors = [...checked.errors];
  if (errors.length) return { ...checked, errors, combinations: 0 };
  const optional = [...checked.known].filter(name => name !== "arcade");
  const cache = new Map();
  for (let mask = 0; mask < 2 ** optional.length; mask += 1) {
    const keep = optional.filter((_, index) => mask & (1 << index));
    const plan = planTemplate(root, keep, checked);
    errors.push(...checkReferences(root, plan, cache).map(error => `[base,arcade,${keep.join(",")}] ${error}`));
  }
  return { ...checked, errors, combinations: 2 ** optional.length };
}

function validateOutput(root, out) {
  const resolvedRoot = fs.realpathSync(root);
  const resolvedOut = path.resolve(out);
  if (fs.existsSync(resolvedOut) || fs.lstatSync(resolvedOut, { throwIfNoEntry: false })) throw new Error(`--out must be a new directory: ${resolvedOut}`);
  let parent = path.dirname(resolvedOut);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const canonicalOut = path.join(fs.realpathSync(parent), path.relative(parent, resolvedOut));
  if (canonicalOut === resolvedRoot || canonicalOut.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`--out must be outside the repo: ${resolvedOut}`);
  }
  return resolvedOut;
}

/** Stage a safe copy, then rename it into place only when packaging has succeeded. */
export function buildTemplate(root, keep, out) {
  const resolvedOut = validateOutput(root, out);
  const plan = planTemplate(root, keep);
  if (!plan.errors.length) plan.errors.push(...checkReferences(root, plan));
  if (plan.errors.length) return { ...plan, copied: 0, changed: 0 };
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  const stage = fs.mkdtempSync(path.join(path.dirname(resolvedOut), ".hakken-template-"));
  try {
    for (const relative of plan.files) {
      const source = path.join(root, relative);
      const target = path.join(stage, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (plan.contents.has(relative)) fs.writeFileSync(target, plan.contents.get(relative), { mode: fs.statSync(source).mode });
      else fs.copyFileSync(source, target);
    }
    if (fs.existsSync(path.join(stage, "package-lock.json"))) {
      // npm prunes unreachable lock entries, preserving the installed/pinned versions.
      // Offline and lifecycle-free: a cut never contacts providers or runs project scripts.
      const result = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"],
        { cwd: stage, encoding: "utf8" });
      if (result.status !== 0) throw new Error(`Could not update the output lockfile: ${result.stderr || result.error}`);
    }
    writeProvenance(root, stage, plan.keep, plan.files);
    // Source guards inspect Git's file list. Start an empty repository, with no
    // inherited history, remotes or template hooks; there is no commit or push.
    execFileSync("git", ["init", "--quiet", "--initial-branch=dev", "--template=", stage]);
    if (fs.existsSync(resolvedOut)) throw new Error(`Output appeared during packaging: ${resolvedOut}`);
    fs.renameSync(stage, resolvedOut);
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
  return { ...plan, copied: plan.files.length, changed: plan.changedFiles.length };
}

function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  let keep = ["base"];
  let out;
  let preview = false;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") check = true;
    else if (arg === "--dry-run") preview = true;
    else if (arg === "--keep" || arg === "--out") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--out") out = value;
      else {
        keep = value.split(",").map(name => name.trim()).filter(Boolean);
        if (!keep.length) throw new Error("--keep requires at least one name");
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (check) {
    if (preview || out) throw new Error("--check cannot be combined with --out or --dry-run");
    const result = checkCombinations(root);
    if (result.errors.length) throw new Error(result.errors.join("\n"));
    console.log(`Template boundaries: ${result.fenced} fenced files; ${result.combinations} combinations valid. Base and Arcade always retained.`);
    return;
  }
  if (!out && !preview) throw new Error("Usage: npm run template:build -- --out <new-directory> [--keep base,salesData] [--dry-run]");
  const result = preview ? planTemplate(root, keep) : buildTemplate(root, keep, out);
  if (preview && !result.errors.length) result.errors.push(...checkReferences(root, result));
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  console.log(`${preview ? "Preview" : `Written to ${path.resolve(out)}`}: keep ${result.keep.join(", ")}; remove ${[...result.remove].join(", ") || "nothing"}.`);
  console.log(`${result.files.length} files kept; ${result.removedFiles.size} files removed; ${result.changedFiles.length} files adjusted.`);
  if (preview) {
    for (const file of result.removedFiles) console.log(`  remove ${file}`);
    for (const file of result.changedFiles) console.log(`  adjust ${file}`);
    for (const name of result.remove) {
      const definition = result.manifest.verticals[name];
      console.log(`  ${name}: packages [${definition.dependencies.join(", ")}], commands [${definition.scripts.join(", ")}]`);
    }
  } else console.log("Fresh Git repository on dev (no commits or remote). Next: npm ci, npm run check, npm run build. Configure a new backend using .env.example; no credentials were copied.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
