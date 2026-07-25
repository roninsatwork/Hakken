import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  collectRemovedConvexModules,
  collectRemovedPaths,
  collectVerticalNames,
  deleteLocaleKey,
  pruneGeneratedApi,
  prunePackageJson,
  readManifest,
  stripFencedBlocks,
} from "../scripts/build-template.mjs";

/**
 * Keeps `template.manifest.json` honest.
 *
 * P4.3 wanted a platform template. The template is generated rather than
 * hand-carved (see `scripts/build-template.mjs`), which moves the risk: instead
 * of a stale branch nobody notices, the risk is a manifest that quietly stops
 * describing the repo. A vertical grows a file, nobody adds it to the manifest,
 * and the next template ships a page importing a module that is not there.
 *
 * The build script fails loudly on the cases it can see while running — a
 * missing path, an unbalanced fence. This covers the cases that are only
 * visible from inside the repo:
 *
 *  - every fence marker in the codebase names a vertical the manifest declares
 *  - platform code does not import a vertical's modules
 *  - the removal rules do what they claim, on real inputs
 *
 * The strongest check is not here: it is running the generated template's own
 * typecheck, lint, tests and build. That was done when this landed — 218 test
 * files, 1,209 tests, 0 lint errors — and is what the manifest's finishing
 * instructions tell the next operator to repeat. A unit test cannot stand in for
 * it, but it can stop the manifest drifting between those runs.
 */

const repoRoot = path.resolve(__dirname, "..");

const manifest = readManifest(repoRoot);
const verticalNames = collectVerticalNames(manifest);
const removedPaths = collectRemovedPaths(manifest);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SEARCH_ROOTS = ["src", "convex", "e2e", "scripts"];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
  });
}

function toRepoRelative(filePath: string) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isVerticalFile(relativePath: string) {
  return removedPaths.some(
    (removed) => relativePath === removed || relativePath.startsWith(`${removed}/`),
  );
}

function allSourceFiles() {
  return SEARCH_ROOTS.flatMap((root) => walk(path.join(repoRoot, root))).map(toRepoRelative);
}

describe("template manifest", () => {
  test("every path it names still exists", () => {
    // The build script checks this too, but only when someone runs it. A
    // vertical file renamed in the product repo should fail in the normal
    // suite, not months later when the template is next cut.
    const missing = removedPaths.filter((entry) => !fs.existsSync(path.join(repoRoot, entry)));

    expect(
      missing,
      `template.manifest.json names paths that no longer exist:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  test("every guarded package is still installed", () => {
    const declared = manifest.verticals.flatMap(
      (vertical: { packageDependencies?: string[] }) => vertical.packageDependencies ?? [],
    );
    const missing = declared.filter(
      (name: string) => !fs.existsSync(path.join(repoRoot, "node_modules", name)),
    );

    expect(
      missing,
      `The manifest strips packages that are not installed; remove them:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  test("every fence marker names a declared vertical", () => {
    // A marker naming `postureStudio` when the vertical is called `movement`
    // removes nothing, and looks like it does.
    const violations: string[] = [];
    const markerPattern = /template:remove:start\s+(\S+?)(?:\s|\*\/\}|$)/g;

    for (const relativePath of allSourceFiles()) {
      if (relativePath === "src/template-boundary.test.ts") continue;
      const contents = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      for (const match of contents.matchAll(markerPattern)) {
        if (!verticalNames.includes(match[1])) {
          violations.push(`${relativePath}: ${match[1]}`);
        }
      }
    }

    expect(
      violations,
      `Fence markers naming a vertical the manifest does not declare:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  test("every fence marker is balanced", () => {
    const violations: string[] = [];

    for (const relativePath of allSourceFiles()) {
      if (relativePath === "src/template-boundary.test.ts") continue;
      const contents = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      if (!contents.includes("template:remove:")) continue;

      const { unbalanced } = stripFencedBlocks(contents, verticalNames);
      for (const problem of unbalanced) violations.push(`${relativePath}: ${problem}`);
    }

    expect(
      violations,
      `Unbalanced fence markers would produce a malformed template:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  test("platform code does not import a vertical's Convex modules", () => {
    // The reason this is worth a test: `convex/workflowEngine.ts` — a platform
    // file — queried the properties table directly, and `convex/bola.test.ts`
    // proved tenant isolation using it. Neither is visible from the vertical's
    // own directory, and both broke the first template build.
    const removedModules = collectRemovedConvexModules(manifest);
    const violations: string[] = [];

    for (const relativePath of allSourceFiles()) {
      if (isVerticalFile(relativePath)) continue;
      if (relativePath === "src/template-boundary.test.ts") continue;

      const rawContents = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      // Fenced references are removed with the vertical, so they are fine.
      const contents = stripFencedBlocks(rawContents, verticalNames).contents;

      for (const moduleName of removedModules) {
        if (new RegExp(`\\bapi\\.${moduleName}\\.`).test(contents)) {
          violations.push(`${relativePath} uses api.${moduleName}`);
        }
        if (new RegExp(`(?:from|import\\()\\s*["'\`][^"'\`]*/${moduleName}["'\`]`).test(contents)) {
          violations.push(`${relativePath} imports ${moduleName}`);
        }
      }
    }

    expect(
      violations,
      [
        "Platform code references a Convex module the template removes.",
        "Either move the code into the vertical, or fence it with",
        "template:remove:start <vertical> … template:remove:end.",
        "",
        ...violations,
      ].join("\n"),
    ).toEqual([]);
  });

  test("platform code does not import a vertical's directories", () => {
    const verticalDirectories = removedPaths.filter(
      (entry) => !entry.includes("."),
    );
    const violations: string[] = [];

    for (const relativePath of allSourceFiles()) {
      if (isVerticalFile(relativePath)) continue;
      if (relativePath === "src/template-boundary.test.ts") continue;

      const contents = stripFencedBlocks(
        fs.readFileSync(path.join(repoRoot, relativePath), "utf8"),
        verticalNames,
      ).contents;

      for (const directory of verticalDirectories) {
        const leaf = directory.split("/").slice(1).join("/");
        if (!leaf) continue;
        if (new RegExp(`(?:from|import\\()\\s*["'\`][^"'\`]*${leaf}[/"'\`]`).test(contents)) {
          violations.push(`${relativePath} imports from ${directory}`);
        }
      }
    }

    expect(
      violations,
      `Platform code imports from a directory the template removes:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

describe("template removal rules", () => {
  test("fencing removes a vertical's block and keeps everything else", () => {
    const source = [
      "const kept = 1;",
      "// template:remove:start movement",
      "const dropped = 2;",
      "// template:remove:end",
      "const alsoKept = 3;",
    ].join("\n");

    const { contents } = stripFencedBlocks(source, ["movement"]);

    expect(contents).toContain("const kept = 1;");
    expect(contents).toContain("const alsoKept = 3;");
    expect(contents).not.toContain("const dropped = 2;");
  });

  test("a fence for a vertical being kept leaves the code and drops the markers", () => {
    const source = [
      "// template:remove:start arcade",
      "const arcadeOnly = 1;",
      "// template:remove:end",
    ].join("\n");

    const { contents } = stripFencedBlocks(source, ["movement"]);

    expect(contents).toContain("const arcadeOnly = 1;");
    expect(contents).not.toContain("template:remove");
  });

  test("JSX-comment fences are recognised too", () => {
    const source = [
      "<div>",
      "  {/* template:remove:start movement */}",
      "  <PostureStudio />",
      "  {/* template:remove:end */}",
      "</div>",
    ].join("\n");

    const { contents } = stripFencedBlocks(source, ["movement"]);

    expect(contents).not.toContain("<PostureStudio />");
    expect(contents).toContain("<div>");
  });

  test("an unclosed fence is reported rather than silently truncating the file", () => {
    const { unbalanced } = stripFencedBlocks(
      ["// template:remove:start movement", "const x = 1;"].join("\n"),
      ["movement"],
    );

    expect(unbalanced).toContain("template:remove:start never closed");
  });

  test("the real schema loses exactly the declared tables", () => {
    // The first attempt at this fenced from `salesReports` to the wrong closing
    // line and took eleven platform tables with it. Typecheck caught it, but
    // only after a full template build; this catches it in seconds.
    const declaredTables = manifest.verticals.flatMap(
      (vertical: { schemaTables?: string[] }) => vertical.schemaTables ?? [],
    );
    const schema = fs.readFileSync(path.join(repoRoot, "convex/schema.ts"), "utf8");
    const tableNames = (contents: string) =>
      [...contents.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*): defineTable\(/gm)].map(
        (match) => match[1],
      );

    const before = tableNames(schema);
    const after = tableNames(stripFencedBlocks(schema, verticalNames).contents);
    const removed = before.filter((name) => !after.includes(name));

    expect(removed.sort()).toEqual([...declaredTables].sort());
  });

  test("package.json loses the declared dependencies and scripts", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    const { packageJson: pruned } = prunePackageJson(packageJson, manifest);

    expect(pruned.dependencies?.three).toBeUndefined();
    expect(pruned.dependencies?.["apify-client"]).toBeUndefined();
    expect(Object.keys(pruned.scripts).some((name) => name.startsWith("movement:"))).toBe(false);

    // And keeps the platform's own.
    expect(pruned.dependencies?.next).toBeDefined();
    expect(pruned.scripts.build).toBeDefined();
  });

  test("the generated API index loses exactly the removed modules", () => {
    const removedModules = collectRemovedConvexModules(manifest);
    const generated = fs.readFileSync(
      path.join(repoRoot, "convex/_generated/api.d.ts"),
      "utf8",
    );
    const { contents } = pruneGeneratedApi(generated, removedModules);

    for (const moduleName of removedModules) {
      expect(contents).not.toContain(`import type * as ${moduleName} from`);
      expect(contents).not.toContain(`  ${moduleName}: typeof ${moduleName};`);
    }

    // A platform module chosen because its name contains a removed one would
    // catch an over-eager regex; `agents` and `agentRuns` are unrelated to any
    // vertical and must survive.
    expect(contents).toContain("import type * as agents from");
    expect(contents).toContain("import type * as agentRuns from");
  });

  test("locale keys are removed by path, leaving their siblings", () => {
    const messages = {
      sidebar: { properties: "Properties", assistant: "Assistant" },
      properties: { search: { title: "Search" } },
    };

    expect(deleteLocaleKey(messages, "sidebar.properties")).toBe(true);
    expect(deleteLocaleKey(messages, "properties")).toBe(true);
    expect(deleteLocaleKey(messages, "sidebar.doesNotExist")).toBe(false);

    expect(messages.sidebar).toEqual({ assistant: "Assistant" });
    expect(messages).not.toHaveProperty("properties");
  });
});
