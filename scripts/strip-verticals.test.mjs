import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildTemplate, checkTree, loadKnownVerticals, stripFences, planTemplate, checkReferences, checkCombinations, sourceFiles, matchesPattern } from "./strip-verticals.mjs";

/**
 * The stripper is trusted to rewrite the schema and the sidebar, so the tests
 * that matter are the destructive ones: a fenced block for a stripped
 * vertical must go, a kept vertical's block must survive byte for byte, and a
 * broken fence must stop the build rather than half-apply. Everything runs
 * against a probe repo in a temp directory — the real tree is never written.
 *
 * The marker text is assembled from halves throughout, because this file is
 * itself scanned by the guard it tests: a raw marker in a string literal here
 * would read as a real, unclosed fence.
 */

const START = "// template:remove" + ":start";
const END = "// template:remove" + ":end";

let root;
let out;

const registry =
  'export const COMPANY_MODULES = [\n' +
  '  { key: "tasks", vertical: "base" },\n' +
  `${START} salesData\n` +
  '  { key: "salesData", vertical: "salesData" },\n' +
  `${END}\n` +
  `${START} salesReports\n` +
  '  { key: "reports", vertical: "salesReports" },\n' +
  `${END}\n` +
  '];\n';

const write = (relative, body) => {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "strip-verticals-"));
  out = root + "-out";
  write("convex/utils/companyModules.ts", registry);
  write("vertical/salesData.ts", "export const salesData = true;");
  write("vertical/salesReports.ts", "export const salesReports = true;");
  write("template.verticals.json", JSON.stringify({
    version: 1, alwaysKeep: ["base", "arcade"],
    verticals: Object.fromEntries(["salesData", "salesReports"].map(name => [name, {
      paths: [`vertical/${name}.ts`], dependencies: [], scripts: [], messages: [],
    }])),
  }));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

describe("the known verticals", () => {
  it("ignores generated Arcade bundles while still checking application source", () => {
    write(".next-arcade/dev/bundle.js", `${START} movement\ncompiled chunk`);
    expect(checkTree(root).errors).toEqual([]);
    write("src/broken.ts", `${START} movement\nreal source`);
    expect(checkTree(root).errors.length).toBeGreaterThan(0);
  });
  it("come from the module registry, plus the retained Arcade, minus base", () => {
    const known = loadKnownVerticals(root);

    expect([...known].sort()).toEqual(["arcade", "salesData", "salesReports"]);
  });
});

describe("fence validation (--check)", () => {
  it("passes balanced fences, nested ones included", () => {
    write(
      "src/probe.ts",
      `${START} salesData\n` +
        "const a = 1;\n" +
        `${START} salesReports\n` +
        "const b = 2;\n" +
        `${END}\n` +
        `${END}\n`
    );

    expect(checkTree(root).errors).toEqual([]);
  });

  it("fails a start with no end", () => {
    write("src/probe.ts", `${START} salesData\nconst a = 1;\n`);

    const { errors } = checkTree(root);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("never closed");
    expect(errors[0]).toContain("src/probe.ts:1");
  });

  it("fails an end with no start", () => {
    write("src/probe.ts", `const a = 1;\n${END}\n`);

    const { errors } = checkTree(root);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("no open start");
  });

  it("fails a fence naming a vertical nobody registered", () => {
    write("src/probe.ts", `${START} lemonade\nconst a = 1;\n${END}\n`);

    const { errors } = checkTree(root);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unknown vertical "lemonade"');
  });

  it("fails a start that names nothing", () => {
    write("src/probe.ts", `${START}\nconst a = 1;\n${END}\n`);

    expect(checkTree(root).errors[0]).toContain("names no vertical");
  });

  it("ignores fences mentioned in prose — docs are not code", () => {
    write("docs/plan.md", `wrap it in \`${START} salesData\` fences\n`);

    expect(checkTree(root).errors).toEqual([]);
  });
});

describe("stripping (--keep … --out …)", () => {
  const shared =
    "const base = 1;\n" +
    `${START} salesData\n` +
    "const salesData = 2;\n" +
    `${END}\n` +
    `${START} salesReports\n` +
    "const salesReports = 3;\n" +
    `${END}\n`;

  it("removes a stripped vertical's block, markers included", () => {
    write("src/shared.ts", shared);

    buildTemplate(root, ["salesReports"], out);
    const built = fs.readFileSync(path.join(out, "src/shared.ts"), "utf8");

    expect(built).not.toContain("salesData");
    expect(built).toContain("const base = 1;");
  });

  it("keeps a kept vertical's block, fences and all, so the output can be stripped again", () => {
    write("src/shared.ts", shared);

    buildTemplate(root, ["salesReports"], out);
    const built = fs.readFileSync(path.join(out, "src/shared.ts"), "utf8");

    expect(built).toContain("const salesReports = 3;");
    expect(built).toContain(`${START} salesReports`);
  });

  it("takes a stripped outer fence's nested blocks with it, whatever they name", () => {
    write(
      "src/nested.ts",
      `${START} salesData\n` +
        "const a = 1;\n" +
        `${START} salesReports\n` +
        "const b = 2;\n" +
        `${END}\n` +
        `${END}\n` +
        "const c = 3;\n"
    );

    buildTemplate(root, ["salesReports"], out);
    const built = fs.readFileSync(path.join(out, "src/nested.ts"), "utf8");

    expect(built).not.toContain("const a");
    expect(built).not.toContain("const b");
    expect(built).toContain("const c = 3;");
  });

  it("copies non-code files untouched", () => {
    write("docs/readme.md", `keep ${START} salesData as prose\n`);

    buildTemplate(root, [], out);

    expect(fs.readFileSync(path.join(out, "docs/readme.md"), "utf8")).toContain("as prose");
  });

  it("refuses to build from a broken fence instead of half-applying", () => {
    write("src/broken.ts", `${START} salesData\nconst a = 1;\n`);

    const result = buildTemplate(root, [], out);

    expect(result.errors).toHaveLength(1);
    expect(fs.existsSync(path.join(out, "src/broken.ts"))).toBe(false);
  });

  it("refuses an unknown vertical in --keep", () => {
    expect(() => buildTemplate(root, ["lemonade"], out)).toThrow(/unknown vertical "lemonade"/);
  });

  it("refuses an output directory inside the repo — the tree is never written", () => {
    expect(() => buildTemplate(root, [], path.join(root, "out"))).toThrow(/outside the repo/);
  });
});

describe("the real repo", () => {
  it("has only balanced fences naming registered verticals", () => {
    const { errors, fenced } = checkTree(process.cwd());

    expect(errors).toEqual([]);
    expect(fenced).toBeGreaterThan(0);
  });
});

describe("the line parser", () => {
  it("reads JSX comment markers the same as line comments", () => {
    const known = new Set(["salesData"]);
    const jsxStart = "{/* template:remove" + ":start salesData */}";
    const jsxEnd = "{/* template:remove" + ":end */}";
    const jsx = `${jsxStart}\n<SalesPanel />\n${jsxEnd}\n<BasePanel />`;

    const { errors, text } = stripFences(jsx, "probe.tsx", known, new Set(["salesData"]));

    expect(errors).toEqual([]);
    expect(text).not.toContain("SalesPanel");
    expect(text).toContain("<BasePanel />");
  });
});

describe("a safe, complete client copy", () => {
  it("keeps Arcade even when only base is requested, and removes whole optional paths", () => {
    write("src/arcade.ts", `${START} arcade\nexport const score = 7;\n${END}\n`);
    const result = buildTemplate(root, ["base"], out);
    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(path.join(out, "src/arcade.ts"), "utf8")).toContain("score = 7");
    expect(fs.existsSync(path.join(out, "vertical/salesData.ts"))).toBe(false);
    expect(checkCombinations(out).errors).toEqual([]);
    expect(execFileSync("git", ["branch", "--show-current"], { cwd: out, encoding: "utf8" }).trim()).toBe("dev");
    expect(execFileSync("git", ["remote"], { cwd: out, encoding: "utf8" }).trim()).toBe("");
  });

  it("never copies credentials, login state, exports or symlinks", () => {
    for (const file of [".env", ".env.local", ".env.production", ".npmrc", "e2e/.auth/admin.json", "dev-export/data.json", "dump.zip", "key.pem", "trace.jsonl"]) {
      write(file, "private");
    }
    write(".env.example", "NEW_BACKEND_URL=");
    write(".npmrc", "engine-strict=true\n//registry.npmjs.org/:_authToken=fixture-secret\nregistry=https://private.example.invalid\n");
    fs.symlinkSync(path.join(root, ".env.local"), path.join(root, "innocent.txt"));
    fs.symlinkSync(path.join(root, "e2e/.auth"), path.join(root, "linked-directory"));
    expect(sourceFiles(root)).not.toContain("innocent.txt");
    buildTemplate(root, ["base"], out);
    const copied = sourceFiles(out);
    expect(copied).toContain(".env.example");
    expect(copied.some(file => fs.readFileSync(path.join(out, file), "utf8") === "private")).toBe(false);
    expect(fs.existsSync(path.join(out, "e2e/.auth/admin.json"))).toBe(false);
    expect(fs.readFileSync(path.join(out, ".npmrc"), "utf8")).toBe("engine-strict=true\n");
  });

  it("refuses an existing output without overwriting its contents", () => {
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "user-work.txt"), "keep me");
    expect(() => buildTemplate(root, [], out)).toThrow(/new directory/);
    expect(fs.readFileSync(path.join(out, "user-work.txt"), "utf8")).toBe("keep me");
  });

  it("cannot reach the source through a symlinked output parent", () => {
    const alias = root + "-alias";
    fs.symlinkSync(root, alias);
    try {
      expect(() => buildTemplate(root, [], path.join(alias, "copy"))).toThrow(/outside the repo/);
    } finally { fs.unlinkSync(alias); }
    expect(fs.existsSync(path.join(root, "copy"))).toBe(false);
  });

  it("previews without writing, and leaves source bytes unchanged when copying", () => {
    const before = new Map(sourceFiles(root).map(file => [file, fs.readFileSync(path.join(root, file))]));
    const plan = planTemplate(root);
    expect(plan.removedFiles.has("vertical/salesData.ts")).toBe(true);
    expect(fs.existsSync(out)).toBe(false);
    buildTemplate(root, [], out);
    for (const [file, bytes] of before) expect(fs.readFileSync(path.join(root, file))).toEqual(bytes);
  });

  it("requires ownership for new modules and rejects overlapping ownership", () => {
    write("convex/utils/companyModules.ts", registry + '\nconst next = { vertical: "newModule" };');
    expect(checkTree(root).errors.join("\n")).toContain("newModule must declare owned paths");
    write("convex/utils/companyModules.ts", registry);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "template.verticals.json"), "utf8"));
    manifest.verticals.salesReports.paths.push("vertical/salesData.ts");
    write("template.verticals.json", JSON.stringify(manifest));
    expect(checkTree(root).errors.join("\n")).toContain("owned by salesData, salesReports");
  });

  it("refuses a declaration that attempts to remove Arcade", () => {
    write("convex/arcade.ts", "export const scores = true;");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "template.verticals.json"), "utf8"));
    manifest.verticals.salesData.paths.push("convex/arcade.ts");
    write("template.verticals.json", JSON.stringify(manifest));
    expect(buildTemplate(root, [], out).errors.join("\n")).toContain("Arcade paths cannot be owned");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("catches a kept module importing a removed file or an export removed from a shared file", () => {
    write("src/client.ts", 'import { salesData } from "../vertical/salesData";\nimport { optional } from "./shared";');
    write("src/shared.ts", `${START} salesData\nexport const optional = 1;\n${END}\nexport const core = 2;`);
    const errors = checkReferences(root, planTemplate(root));
    expect(errors.join("\n")).toContain("imports removed file vertical/salesData.ts");
    expect(errors.join("\n")).toContain("imports removed export optional");
    expect(buildTemplate(root, [], out).copied).toBe(0);
    expect(fs.existsSync(out)).toBe(false);
  });

  it("treats route brackets literally and nested glob prefixes consistently", () => {
    expect(matchesPattern("src/app/[workspace]/page.tsx", "src/app/[workspace]/**")).toBe(true);
    expect(matchesPattern("docs/a/movement-demo.md", "docs/**/movement-*.md")).toBe(true);
    expect(matchesPattern("docs/movement-demo.md", "docs/**/movement-*.md")).toBe(true);
    expect(matchesPattern("src/app/w/page.tsx", "src/app/[workspace]/**")).toBe(false);
  });

  it("retains shared code while either owner is kept", () => {
    write("src/shared.ts", `${START} salesData,salesReports\nexport const shared = true;\n${END}\n`);
    expect(planTemplate(root, ["salesReports"]).contents.get("src/shared.ts")).toContain("shared = true");
    expect(planTemplate(root, []).contents.get("src/shared.ts")).not.toContain("shared = true");
  });

  it("checks backend calls and table references, not just imports", () => {
    write("convex/schema.ts", `${START} salesData\n  customers: defineTable({}),\n${END}\n`);
    write("convex/customerRows.ts", `${START} salesData\nexport const list = query({});\n${END}\n`);
    write("src/client.ts", 'api.customerRows.list; ctx.db.query("customers");');
    const errors = checkReferences(root, planTemplate(root));
    expect(errors.join("\n")).toContain("calls removed function customerRows.list");
    expect(errors.join("\n")).toContain("references removed table customers");
  });

  it("prunes exclusive packages from both package files without changing source versions", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "template.verticals.json"), "utf8"));
    manifest.verticals.salesData.dependencies = ["fixture-motion"];
    write("template.verticals.json", JSON.stringify(manifest));
    const pkg = { name: "template-fixture", version: "1.0.0", private: true, dependencies: { "fixture-motion": "1.0.0" } };
    write("package.json", JSON.stringify(pkg));
    write("package-lock.json", JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3,
      packages: { "": pkg, "node_modules/fixture-motion": { version: "1.0.0", resolved: "https://example.invalid/motion.tgz" } } }));
    const result = buildTemplate(root, [], out);
    expect(result.errors).toEqual([]);
    const lock = JSON.parse(fs.readFileSync(path.join(out, "package-lock.json"), "utf8"));
    expect(lock.packages["node_modules/fixture-motion"]).toBeUndefined();
    expect(lock.packages[""].dependencies?.["fixture-motion"]).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))).toEqual(pkg);
  });
});
