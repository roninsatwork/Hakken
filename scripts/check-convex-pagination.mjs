import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Convex allows exactly one paginated query per function call.
 *
 * The second `.paginate()` to actually execute is rejected by the deployment
 * at runtime, because the built-in query cannot track two cursors at once and
 * `loadMore` would have no way to say which one it meant. The restriction is
 * per invocation, not per query function: it applies to mutations too, and it
 * counts calls made through ordinary helper functions.
 *
 * `convex-test` does not model any of this, so a function that paginates twice
 * passes the whole suite and fails the moment it is called for real. It has
 * happened twice: a page-filling loop in the sales data search, and a billing
 * reset that paginated companies and then users in one mutation. This script
 * exists because a green suite is not evidence for anything paginated.
 *
 * It counts the worst *single execution path* rather than the calls in the
 * file, which is what keeps it quiet on the common shape — a query that picks
 * one of several indexes and returns from each branch. Early returns, throws,
 * if/else, ternaries and switch arms are all treated as alternatives rather
 * than as a sequence. A loop containing a paginate counts as two, because a
 * loop that turns once can turn twice, and so does a function that can call
 * itself.
 *
 * See docs/plans/active/workspace-sales-data-plan.md ("Two things that bit").
 */

const defaultRootDir = process.cwd();
const defaultScanDir = path.join(defaultRootDir, "convex");

/**
 * The directory being checked. Calls are only followed into modules inside it,
 * so the walk stays in the Convex backend and the tests can point it at a
 * fixture directory instead.
 */
let rootDir = defaultRootDir;
let scanDir = defaultScanDir;

/** Array methods that run their callback once per element, i.e. a loop. */
const ITERATING_METHODS = new Set([
  "map",
  "forEach",
  "filter",
  "flatMap",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "find",
  "findIndex",
  "findLast",
  "sort",
]);

/** A loop body that paginates once paginates at least twice. */
const LOOP_FACTOR = 2;

/**
 * How a node can leave: `fall` is the worst cost of running it and carrying on
 * to the next statement, `exit` the worst cost of leaving the function from
 * inside it. `null` means that route does not exist — a `return` never falls
 * through, a plain assignment never exits.
 */
const NEVER = null;

function listConvexFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_generated") continue;
      found.push(...listConvexFiles(full));
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".d.ts") || entry.name.includes(".test.")) continue;
    found.push(full);
  }
  return found;
}

const moduleCache = new Map();

/**
 * Reads one Convex module into the three things the walk needs: the functions
 * a call can land in, the Convex entry points to start walking from, and where
 * imported names come from.
 */
function loadModule(filePath) {
  const cached = moduleCache.get(filePath);
  if (cached) return cached;

  const text = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const helpers = new Map();
  const entries = [];
  const imports = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImports(statement, filePath, imports);
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      helpers.set(statement.name.text, statement);
      continue;
    }

    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const name = declaration.name.text;
      const initializer = declaration.initializer;

      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        helpers.set(name, initializer);
        continue;
      }

      const handler = findConvexHandler(initializer);
      if (handler) entries.push({ name, node: handler });
    }
  }

  const convexModule = { filePath, sourceFile, helpers, entries, imports };
  moduleCache.set(filePath, convexModule);
  return convexModule;
}

function collectImports(statement, filePath, imports) {
  const specifier = statement.moduleSpecifier;
  if (!ts.isStringLiteral(specifier)) return;
  if (!specifier.text.startsWith(".")) return;

  const resolved = resolveModulePath(path.dirname(filePath), specifier.text);
  if (!resolved) return;

  const bindings = statement.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return;

  for (const element of bindings.elements) {
    if (element.isTypeOnly) continue;
    imports.set(element.name.text, {
      filePath: resolved,
      exportedName: (element.propertyName ?? element.name).text,
    });
  }
}

function resolveModulePath(fromDir, specifier) {
  const base = path.resolve(fromDir, specifier);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Matches `wrapper({ ..., handler })` — the shape every Convex function takes,
 * whatever the wrapper is called. Reading the handler property rather than a
 * list of wrapper names means the project's own `tenantQuery`, `adminMutation`
 * and the rest are covered without naming them.
 */
function findConvexHandler(initializer) {
  if (!ts.isCallExpression(initializer)) return null;
  const [argument] = initializer.arguments;
  if (!argument || !ts.isObjectLiteralExpression(argument)) return null;

  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!ts.isIdentifier(property.name) || property.name.text !== "handler") continue;
    if (ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer)) {
      return property.initializer;
    }
  }
  return null;
}

function describe(convexModule, node) {
  const { line, character } = convexModule.sourceFile.getLineAndCharacterOfPosition(node.getStart(convexModule.sourceFile));
  const relative = path.relative(rootDir, convexModule.filePath);
  return `${relative}:${line + 1}:${character + 1}`;
}

function worst(left, right) {
  if (left === NEVER) return right;
  if (right === NEVER) return left;
  return Math.max(left, right);
}

/** The cost of a node however it leaves — for a caller, both routes are one. */
function totalOf(result) {
  return Math.max(result.fall ?? 0, result.exit ?? 0);
}

const functionCache = new Map();

/** Worst-case `.paginate()` calls on a single run through this function. */
function countFunction(node, convexModule, stack, sites) {
  const key = `${convexModule.filePath}#${node.getStart(convexModule.sourceFile)}`;

  if (stack.has(key)) {
    // Reached from inside itself. Cost nothing here — the calls are already
    // being counted by the outer visit — but remember the cycle, so a
    // recursive function that paginates is charged for turning twice.
    stack.recursive.add(key);
    return 0;
  }

  const cached = functionCache.get(key);
  if (cached) {
    sites.push(...cached.sites);
    return cached.count;
  }

  stack.add(key);
  const ownSites = [];
  const body = node.body;
  const result = body
    ? ts.isBlock(body)
      ? analyseSequence(body.statements, convexModule, stack, ownSites)
      : { fall: cost(body, convexModule, stack, ownSites), exit: NEVER }
    : { fall: 0, exit: NEVER };
  stack.delete(key);

  let count = totalOf(result);
  const wasRecursive = stack.recursive.has(key);
  if (wasRecursive && count > 0) count *= LOOP_FACTOR;

  // Only cache a settled answer. A result computed part-way through a cycle
  // can be an undercount, and caching it would spread that to every caller.
  if (!wasRecursive && stack.size === 0) {
    functionCache.set(key, { count, sites: ownSites });
  }

  sites.push(...ownSites);
  return count;
}

/**
 * Statements in order, where the cost of the whole is the costliest single
 * route through it. A statement that always returns or throws ends the run, so
 * nothing after it is charged to the same path.
 */
function analyseSequence(statements, convexModule, stack, sites) {
  let running = 0;
  let exit = NEVER;
  let fallsThrough = true;

  for (const statement of statements) {
    const result = analyseStatement(statement, convexModule, stack, sites);
    if (result.exit !== NEVER) exit = worst(exit, running + result.exit);
    if (result.fall === NEVER) {
      fallsThrough = false;
      break;
    }
    running += result.fall;
  }

  return { fall: fallsThrough ? running : NEVER, exit };
}

function analyseStatement(node, convexModule, stack, sites) {
  if (ts.isBlock(node)) return analyseSequence(node.statements, convexModule, stack, sites);

  if (ts.isReturnStatement(node)) {
    return { fall: NEVER, exit: node.expression ? cost(node.expression, convexModule, stack, sites) : 0 };
  }

  if (ts.isThrowStatement(node)) {
    return { fall: NEVER, exit: cost(node.expression, convexModule, stack, sites) };
  }

  // `break` and `continue` leave the enclosing block without leaving the
  // function, so nothing after them runs on this path.
  if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
    return { fall: NEVER, exit: NEVER };
  }

  if (ts.isLabeledStatement(node)) return analyseStatement(node.statement, convexModule, stack, sites);

  if (ts.isIfStatement(node)) {
    const condition = cost(node.expression, convexModule, stack, sites);
    const whenTrue = analyseStatement(node.thenStatement, convexModule, stack, sites);
    const whenFalse = node.elseStatement
      ? analyseStatement(node.elseStatement, convexModule, stack, sites)
      : { fall: 0, exit: NEVER };

    const fall = worst(whenTrue.fall, whenFalse.fall);
    const exit = worst(whenTrue.exit, whenFalse.exit);
    return {
      fall: fall === NEVER ? NEVER : condition + fall,
      exit: exit === NEVER ? NEVER : condition + exit,
    };
  }

  if (ts.isSwitchStatement(node)) {
    const subject = cost(node.expression, convexModule, stack, sites);
    let fall = NEVER;
    let exit = NEVER;
    for (const clause of node.caseBlock.clauses) {
      const result = analyseSequence(clause.statements, convexModule, stack, sites);
      fall = worst(fall, result.fall);
      exit = worst(exit, result.exit);
    }
    return {
      fall: subject + (fall ?? 0),
      exit: exit === NEVER ? NEVER : subject + exit,
    };
  }

  if (ts.isTryStatement(node)) {
    const tried = analyseSequence(node.tryBlock.statements, convexModule, stack, sites);
    const caught = node.catchClause
      ? analyseSequence(node.catchClause.block.statements, convexModule, stack, sites)
      : { fall: NEVER, exit: NEVER };
    const finally_ = node.finallyBlock
      ? analyseSequence(node.finallyBlock.statements, convexModule, stack, sites)
      : { fall: 0, exit: NEVER };

    const body = worst(tried.fall, caught.fall);
    return {
      fall: body === NEVER || finally_.fall === NEVER ? NEVER : body + finally_.fall,
      exit: worst(worst(tried.exit, caught.exit), finally_.exit),
    };
  }

  if (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  ) {
    const header = loopHeaderCost(node, convexModule, stack, sites);
    const body = analyseStatement(node.statement, convexModule, stack, sites);
    const turns = LOOP_FACTOR * totalOf(body);
    return { fall: header + turns, exit: body.exit === NEVER ? NEVER : header + turns };
  }

  // Everything else — expression statements, declarations — runs and carries
  // on. Its cost is whatever its expressions cost.
  return { fall: cost(node, convexModule, stack, sites), exit: NEVER };
}

function loopHeaderCost(node, convexModule, stack, sites) {
  let total = 0;
  for (const part of [node.initializer, node.condition, node.incrementor, node.expression]) {
    if (part) total += cost(part, convexModule, stack, sites);
  }
  return total;
}

/** The worst-case paginate count of evaluating an expression. */
function cost(node, convexModule, stack, sites) {
  if (!node) return 0;

  // A nested function is counted where it is called, not where it is written.
  if (ts.isFunctionLike(node)) return 0;

  if (ts.isConditionalExpression(node)) {
    return (
      cost(node.condition, convexModule, stack, sites) +
      Math.max(cost(node.whenTrue, convexModule, stack, sites), cost(node.whenFalse, convexModule, stack, sites))
    );
  }

  if (ts.isCallExpression(node)) return costOfCall(node, convexModule, stack, sites);

  let total = 0;
  ts.forEachChild(node, (child) => {
    total += cost(child, convexModule, stack, sites);
  });
  return total;
}

function costOfCall(node, convexModule, stack, sites) {
  const callee = node.expression;

  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "paginate") {
    sites.push(describe(convexModule, node));
    return 1 + cost(callee.expression, convexModule, stack, sites) + costOfArguments(node, convexModule, stack, sites);
  }

  // `rows.map(async (row) => ...)` runs its callback once per row.
  if (ts.isPropertyAccessExpression(callee) && ITERATING_METHODS.has(callee.name.text)) {
    let total = cost(callee.expression, convexModule, stack, sites);
    for (const argument of node.arguments) {
      total += ts.isFunctionLike(argument)
        ? LOOP_FACTOR * countFunction(argument, convexModule, stack, sites)
        : cost(argument, convexModule, stack, sites);
    }
    return total;
  }

  // `ctx.runQuery` / `ctx.runMutation` start a fresh function call, which gets
  // its own pagination budget, so only plain JavaScript calls are followed.
  const target = resolveCallTarget(callee, convexModule);
  const targetCost = target ? countFunction(target.node, target.convexModule, stack, sites) : 0;

  return targetCost + cost(callee, convexModule, stack, sites) + costOfArguments(node, convexModule, stack, sites);
}

function costOfArguments(node, convexModule, stack, sites) {
  let total = 0;
  for (const argument of node.arguments) {
    total += cost(argument, convexModule, stack, sites);
  }
  return total;
}

/** Follows a plain call to a helper, in this convexModule or imported from another. */
function resolveCallTarget(callee, convexModule) {
  if (!ts.isIdentifier(callee)) return null;
  const name = callee.text;

  const local = convexModule.helpers.get(name);
  if (local) return { node: local, convexModule };

  const imported = convexModule.imports.get(name);
  if (!imported) return null;
  if (!imported.filePath.startsWith(scanDir + path.sep)) return null;

  const target = loadModule(imported.filePath);
  const node = target.helpers.get(imported.exportedName);
  return node ? { node, convexModule: target } : null;
}

function newStack() {
  const stack = new Set();
  stack.recursive = new Set();
  return stack;
}

/**
 * Every Convex function that can run more than one paginated query, with the
 * `.paginate()` sites reachable from it.
 */
export function findPaginationViolations(options = {}) {
  scanDir = options.scanDir ? path.resolve(options.scanDir) : defaultScanDir;
  rootDir = options.rootDir ? path.resolve(options.rootDir) : defaultRootDir;
  moduleCache.clear();
  functionCache.clear();

  const files = listConvexFiles(scanDir).sort();
  const violations = [];

  for (const file of files) {
    const convexModule = loadModule(file);
    for (const entry of convexModule.entries) {
      const sites = [];
      const count = countFunction(entry.node, convexModule, newStack(), sites);
      if (count > 1) {
        violations.push({
          where: describe(convexModule, entry.node),
          function: entry.name,
          name: `${path.relative(rootDir, file)} → ${entry.name}`,
          sites: [...new Set(sites)],
        });
      }
    }
  }

  return { files, violations };
}

function main() {
  const { files, violations } = findPaginationViolations();

  if (violations.length === 0) {
    console.log(`Convex pagination: ${files.length} modules checked, one paginated query per function.`);
    return;
  }

  console.error("Convex allows one paginated query per function call. These run more than one:\n");
  for (const violation of violations) {
    console.error(`  ${violation.name}`);
    console.error(`    defined at ${violation.where}`);
    for (const site of violation.sites) {
      console.error(`    paginates at ${site}`);
    }
    console.error("");
  }
  console.error("Split the work so each function paginates once, and schedule the rest as its own call.");
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
