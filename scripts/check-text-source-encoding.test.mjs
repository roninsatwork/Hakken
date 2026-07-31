import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { findBinaryTextFiles } from "./check-text-source-encoding.mjs";

/**
 * The point of the guard is that a NUL byte is invisible everywhere else, so
 * the test writes real bytes to disk and checks git agrees with the verdict.
 */

let workspace;

function write(name, contents) {
  const full = path.join(workspace, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return name;
}

function makeWorkspace() {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "text-encoding-"));
}

afterEach(() => {
  if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe("findBinaryTextFiles", () => {
  it("passes ordinary source files", () => {
    makeWorkspace();
    const files = [
      write("Component.tsx", "export const Component = () => <p>Hello</p>;\n"),
      write("notes.md", "# Notes\n\nNothing unusual here.\n"),
    ];

    expect(findBinaryTextFiles(files, workspace)).toEqual([]);
  });

  it("catches a NUL byte hidden in a .tsx file", () => {
    makeWorkspace();
    const files = [write("Broken.tsx", "export const value = 1;\n\0export const other = 2;\n")];

    const offenders = findBinaryTextFiles(files, workspace);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].file).toBe("Broken.tsx");
    expect(offenders[0].offset).toBe(24);
  });

  it("agrees with git about which file is binary", () => {
    makeWorkspace();
    write("clean.ts", "export const clean = true;\n");
    write("dirty.ts", "export const dirty = true;\n\0");

    const run = (...args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8" });
    run("init", "--quiet");
    run("config", "user.email", "guard@example.com");
    run("config", "user.name", "Guard");
    run("add", ".");
    run("commit", "--quiet", "-m", "fixture");

    // Rewrite both files, then ask git to describe the change.
    fs.writeFileSync(path.join(workspace, "clean.ts"), "export const clean = false;\n");
    fs.writeFileSync(path.join(workspace, "dirty.ts"), "export const dirty = false;\n\0");
    const stat = run("diff", "--stat");

    expect(stat).toContain("Bin");
    const offenders = findBinaryTextFiles(["clean.ts", "dirty.ts"], workspace);
    expect(offenders.map((offender) => offender.file)).toEqual(["dirty.ts"]);
  });

  it("leaves genuinely binary files alone", () => {
    makeWorkspace();
    const files = [
      write("model.glb", Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x00, 0x00, 0x00, 0x02])),
      write("image.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d])),
    ];

    expect(findBinaryTextFiles(files, workspace)).toEqual([]);
  });
});
