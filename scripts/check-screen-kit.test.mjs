import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findHandWrittenParts, findStaleFreezes, loadFrozen } from "./check-screen-kit.mjs";

/**
 * The guard is only worth having if it bites on the thing that actually
 * happened: a screen drawing a table by hand twelve inches from a shared one.
 * So the tests that matter are the two probes — a hand-written table and a
 * hand-written field — and the two it must leave alone, a tick box and a screen
 * that uses the kit properly.
 *
 * The parser gets its own test because it is the part most likely to rot
 * quietly. An input whose type sits after an event handler is the common shape
 * in this codebase, and reading the handler's arrow as the end of the tag would
 * make every tick box look like a text field.
 */

const probe = path.join(process.cwd(), "src", "app", "(dashboard)", "__screen_kit_probe__.tsx");
const probeRelative = path.relative(process.cwd(), probe);

const write = (body) => fs.writeFileSync(probe, body);

afterEach(() => {
  if (fs.existsSync(probe)) fs.rmSync(probe);
});

describe("the screen kit guard", () => {
  it("passes on the codebase as it stands", () => {
    expect(findHandWrittenParts()).toEqual([]);
    expect(findStaleFreezes()).toEqual([]);
  });

  it("catches a new screen that draws a table by hand", () => {
    write(
      "export const Probe = () => (\n" +
        '  <table className="w-full">\n' +
        "    <tbody><tr><td>probe</td></tr></tbody>\n" +
        "  </table>\n" +
        ");\n"
    );

    const offenders = findHandWrittenParts();

    expect(offenders).toContainEqual({ rule: "tables", file: probeRelative, line: 2 });
  });

  it("catches a new screen that draws a text field by hand", () => {
    write(
      "export const Probe = () => (\n" +
        '  <label>Name<input type="text" value="" onChange={() => {}} /></label>\n' +
        ");\n"
    );

    const offenders = findHandWrittenParts();

    expect(offenders).toContainEqual({ rule: "inputs", file: probeRelative, line: 2 });
  });

  it("catches an input with no type at all", () => {
    write('export const Probe = () => <input value="" onChange={() => {}} />;\n');

    expect(findHandWrittenParts().some((o) => o.rule === "inputs")).toBe(true);
  });

  it("treats a type decided at runtime as a text field", () => {
    write(
      "export const Probe = ({ kind }: { kind: string }) => (\n" +
        '  <input type={kind} value="" onChange={() => {}} />\n' +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.rule === "inputs")).toBe(true);
  });

  it("leaves a tick box alone — the kit has no part for one", () => {
    write('export const Probe = () => <input type="checkbox" checked readOnly />;\n');

    expect(findHandWrittenParts().some((o) => o.file === probeRelative)).toBe(false);
  });

  it("reads the type past an event handler", () => {
    // The shape the brace-aware parser exists for: stopping at the arrow in
    // `onChange` would lose the type and report this tick box as a text field.
    write(
      "export const Probe = () => (\n" +
        "  <input\n" +
        "    checked={false}\n" +
        "    onChange={(event) => console.log(event.target.checked)}\n" +
        '    type="checkbox"\n' +
        "  />\n" +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.file === probeRelative)).toBe(false);
  });

  it("leaves a file picker, a colour swatch and a slider alone", () => {
    write(
      "export const Probe = () => (\n" +
        "  <>\n" +
        '    <input type="file" />\n' +
        '    <input type="color" />\n' +
        '    <input type="range" />\n' +
        "  </>\n" +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.file === probeRelative)).toBe(false);
  });

  it("accepts a screen built from the kit", () => {
    write(
      'import { DataTable } from "@/src/ui/components/screens/DataTable";\n' +
        'import { Field } from "@/src/ui/components/screens/Field";\n' +
        "export const Probe = () => (\n" +
        "  <DataTable\n" +
        '    columns={[{ key: "name", header: "Name", cell: () => <Field label="Name" value="" onChange={() => {}} /> }]}\n' +
        "    rows={[]}\n" +
        "  />\n" +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.file === probeRelative)).toBe(false);
  });

  /*
    The rule the other two kept missing. This probe passes both of them — it
    writes no `<table>` and no `<input>`, and every part it uses is the shared
    one — and it is still a screen assembling its own table, which is where
    every drift found on 2026-08-16 and 17 actually lived.
  */
  it("catches a screen that assembles a table from the kit's loose parts", () => {
    write(
      'import { TableShell, TableHeaderRow, TableHeaderCell } from "@/src/ui/components/screens/Table";\n' +
        "export const Probe = () => (\n" +
        "  <TableShell>\n" +
        "    <thead><TableHeaderRow><TableHeaderCell>Name</TableHeaderCell></TableHeaderRow></thead>\n" +
        "    <tbody><tr><td>probe</td></tr></tbody>\n" +
        "  </TableShell>\n" +
        ");\n"
    );

    expect(findHandWrittenParts()).toContainEqual({
      rule: "assembled",
      file: probeRelative,
      line: 1,
    });
  });

  it("leaves a screen with no table alone", () => {
    write(
      'import { Field } from "@/src/ui/components/screens/Field";\n' +
        "export const Probe = () => <Field label=\"Name\" value=\"\" onChange={() => {}} />;\n"
    );

    expect(findHandWrittenParts().some((o) => o.file === probeRelative)).toBe(false);
  });

  it("freezes a screen per rule, so an old table buys no exemption from the other", () => {
    write(
      "export const Probe = () => (\n" +
        "  <table>\n" +
        '    <tbody><tr><td><input type="text" value="" onChange={() => {}} /></td></tr></tbody>\n' +
        "  </table>\n" +
        ");\n"
    );

    const offenders = findHandWrittenParts(
      loadFrozen({ tables: [probeRelative], inputs: [] })
    ).filter((offender) => offender.file === probeRelative);

    expect(offenders.map((offender) => offender.rule)).toEqual(["inputs"]);
  });
});

describe("the frozen lists", () => {
  it("names only files that exist", () => {
    const frozen = loadFrozen();
    const missing = [...frozen.tables, ...frozen.inputs].filter(
      (relative) => !fs.existsSync(path.join(process.cwd(), relative))
    );

    expect(missing).toEqual([]);
  });

  it("reports a freeze whose screen has moved onto the kit", () => {
    write(
      'import { TableShell } from "@/src/ui/components/screens/Table";\n' +
        "export const Probe = () => <TableShell><tbody /></TableShell>;\n"
    );

    const stale = findStaleFreezes(loadFrozen({ tables: [probeRelative], inputs: [] }));

    expect(stale).toEqual([
      { rule: "tables", file: probeRelative, reason: "no longer hand-writes a table" },
    ]);
  });

  it("reports a freeze whose screen has gone", () => {
    const stale = findStaleFreezes(
      loadFrozen({ tables: [], inputs: ["src/app/(dashboard)/__deleted_screen__.tsx"] })
    );

    expect(stale).toEqual([
      { rule: "inputs", file: "src/app/(dashboard)/__deleted_screen__.tsx", reason: "no longer exists" },
    ]);
  });
});
