import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildTemplate, checkTree, loadKnownVerticals, stripFences } from "./strip-verticals.mjs";

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
  '  { key: "salesData", vertical: "salesData" },\n' +
  '  { key: "reports", vertical: "salesReports" },\n' +
  '];\n';

const write = (relative, body) => {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "strip-verticals-"));
  out = fs.mkdtempSync(path.join(os.tmpdir(), "strip-verticals-out-"));
  write("convex/utils/companyModules.ts", registry);
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
  it("come from the module registry, plus the moduleless demos, minus base", () => {
    const known = loadKnownVerticals(root);

    expect([...known].sort()).toEqual(["arcade", "movement", "salesData", "salesReports"]);
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
