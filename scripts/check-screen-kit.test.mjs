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

  // Left alone until 2026-08-22, when `Checkbox` gave the rule a correct fix
  // to point at. Before that a tick box was a build failure with no answer.
  it("catches a hand-written tick box", () => {
    write('export const Probe = () => <input type="checkbox" checked readOnly />;\n');

    expect(findHandWrittenParts().some((o) => o.rule === "checkboxes")).toBe(true);
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

    const found = findHandWrittenParts().filter((o) => o.file === probeRelative);
    expect(found.some((o) => o.rule === "checkboxes")).toBe(true);
    expect(found.some((o) => o.rule === "inputs")).toBe(false);
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
        'import { PageHeader } from "@/src/ui/components/screens/PageHeader";\n' +
        "export const Probe = () => (\n" +
        "  <div>\n" +
        '    <PageHeader title="Probe" description="Built from the kit." />\n' +
        "    <DataTable\n" +
        '      columns={[{ key: "name", header: "Name", cell: () => <Field label="Name" value="" onChange={() => {}} /> }]}\n' +
        "      rows={[]}\n" +
        "    />\n" +
        "  </div>\n" +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.file === probeRelative)).toBe(false);
  });

  /*
    The rule about a screen's shape rather than its parts. Every probe above
    asks "was this drawn by hand?", and the Features screen answered no to all
    of them while still being wrong: it took DataTable whole and put its title
    inside the table instead of above the search box.
  */
  it("catches a list screen with no header above its table", () => {
    write(
      'import { DataTable } from "@/src/ui/components/screens/DataTable";\n' +
        "export const Probe = () => (\n" +
        '  <DataTable columns={[]} rows={[]} cardHeader={<h2>Features</h2>} />\n' +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.rule === "anatomy")).toBe(true);
  });

  it("catches a header that sits below the table rather than above it", () => {
    write(
      'import { DataTable } from "@/src/ui/components/screens/DataTable";\n' +
        'import { PageHeader } from "@/src/ui/components/screens/PageHeader";\n' +
        "export const Probe = () => (\n" +
        "  <div>\n" +
        "    <DataTable columns={[]} rows={[]} />\n" +
        '    <PageHeader title="Probe" />\n' +
        "  </div>\n" +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.rule === "anatomy")).toBe(true);
  });

  it("accepts a record page whose header is DetailHeader", () => {
    write(
      'import { DataTable } from "@/src/ui/components/screens/DataTable";\n' +
        'import { DetailHeader } from "@/src/ui/components/screens/PageHeader";\n' +
        "export const Probe = () => (\n" +
        "  <div>\n" +
        '    <DetailHeader back={{ label: "Back", href: "/" }} title="Probe" />\n' +
        "    <DataTable columns={[]} rows={[]} />\n" +
        "  </div>\n" +
        ");\n"
    );

    expect(findHandWrittenParts().some((o) => o.rule === "anatomy")).toBe(false);
  });

  it("leaves a screen with no table alone", () => {
    write('export const Probe = () => <p>No table here.</p>;\n');

    expect(findHandWrittenParts().some((o) => o.rule === "anatomy")).toBe(false);
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

describe("the buttons rule", () => {
  const oneButton = 'export const Probe = () => <button type="button">probe</button>;\n';
  const twoButtons =
    "export const Probe = () => (\n" +
    "  <>\n" +
    '    <button type="button">one</button>\n' +
    '    <button type="button">two</button>\n' +
    "  </>\n" +
    ");\n";

  it("catches a raw button in a file with no frozen count", () => {
    write(oneButton);

    expect(findHandWrittenParts()).toContainEqual({
      rule: "buttons",
      file: probeRelative,
      count: 1,
      frozen: 0,
    });
  });

  it("lets a file keep exactly the raw buttons it had", () => {
    write(twoButtons);

    const offenders = findHandWrittenParts(
      loadFrozen({ tables: [], inputs: [], assembled: [], buttons: { [probeRelative]: 2 } })
    ).filter((offender) => offender.file === probeRelative);

    expect(offenders).toEqual([]);
  });

  it("fails the moment a file draws one more than it had", () => {
    write(twoButtons);

    expect(
      findHandWrittenParts(
        loadFrozen({ tables: [], inputs: [], assembled: [], buttons: { [probeRelative]: 1 } })
      )
    ).toContainEqual({ rule: "buttons", file: probeRelative, count: 2, frozen: 1 });
  });

  it("allows a shrink without complaint", () => {
    write(oneButton);

    const frozen = loadFrozen({
      tables: [],
      inputs: [],
      assembled: [],
      buttons: { [probeRelative]: 3 },
    });

    expect(findHandWrittenParts(frozen).some((o) => o.file === probeRelative)).toBe(false);
    expect(findStaleFreezes(frozen).some((s) => s.file === probeRelative)).toBe(false);
  });

  it("leaves the movement demos alone — frozen whole by owner decision", () => {
    const demoProbe = path.join(
      process.cwd(),
      "src",
      "app",
      "(dashboard)",
      "demos",
      "__screen_kit_probe__.tsx"
    );
    fs.writeFileSync(demoProbe, oneButton);

    try {
      const demoRelative = path.relative(process.cwd(), demoProbe);
      expect(findHandWrittenParts().some((o) => o.file === demoRelative)).toBe(false);
    } finally {
      fs.rmSync(demoProbe);
    }
  });

  it("does not count the kit's own <Button>", () => {
    write(
      'import { Button } from "@/src/ui/atoms/Button";\n' +
        'export const Probe = () => <Button variant="ghost">probe</Button>;\n'
    );

    expect(findHandWrittenParts().some((o) => o.file === probeRelative)).toBe(false);
  });

  it("reports a freeze whose file has lost its last raw button", () => {
    write("export const Probe = () => <div>no buttons here</div>;\n");

    const stale = findStaleFreezes(
      loadFrozen({ tables: [], inputs: [], assembled: [], buttons: { [probeRelative]: 2 } })
    );

    expect(stale).toEqual([
      { rule: "buttons", file: probeRelative, reason: "no longer hand-writes a raw <button>" },
    ]);
  });

  it("reports a freeze whose file has gone", () => {
    const gone = "src/app/(dashboard)/__deleted_screen__.tsx";
    const stale = findStaleFreezes(
      loadFrozen({ tables: [], inputs: [], assembled: [], buttons: { [gone]: 4 } })
    );

    expect(stale).toEqual([{ rule: "buttons", file: gone, reason: "no longer exists" }]);
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

/**
 * The two rules added on 2026-08-22, after the header work.
 *
 * They exist because of a specific failure: the AI section's established
 * anatomy is title, rule, tab strip, and three screens drifted off it while
 * the whole company section never had the rule at all. Nothing in the build
 * noticed, because a screen missing a line still looks like a screen. The
 * headings rule stops the next hand-drawn title; the header-rule rule stops
 * the next hand-drawn line.
 */
describe("the headings rule", () => {
  const oneHeading = 'export const Probe = () => <h1 className="text-2xl">Probe</h1>;\n';

  it("catches a screen that draws its own page heading", () => {
    write(oneHeading);

    expect(findHandWrittenParts()).toContainEqual({
      rule: "headings",
      file: probeRelative,
      count: 1,
      frozen: 0,
    });
  });

  it("lets a screen keep exactly the headings it had", () => {
    write(oneHeading);

    const offenders = findHandWrittenParts(
      loadFrozen({ tables: [], inputs: [], assembled: [], headings: { [probeRelative]: 1 } })
    ).filter((offender) => offender.rule === "headings" && offender.file === probeRelative);

    expect(offenders).toEqual([]);
  });

  it("leaves a screen that takes its heading from the kit alone", () => {
    write(
      'import { PageHeader } from "@/src/ui/components/screens/PageHeader";\n' +
        "export const Probe = () => <PageHeader icon={null} title=\"Probe\" divider />;\n"
    );

    expect(
      findHandWrittenParts().filter((offender) => offender.rule === "headings")
    ).toEqual([]);
  });

  it("reports a frozen screen that has since moved onto the kit", () => {
    write('export const Probe = () => <PageHeader icon={null} title="Probe" />;\n');

    const stale = findStaleFreezes(
      loadFrozen({ tables: [], inputs: [], headings: { [probeRelative]: 1 } })
    );

    expect(stale).toContainEqual({
      rule: "headings",
      file: probeRelative,
      reason: "no longer draws a heading by hand",
    });
  });
});

describe("the header rule rule", () => {
  it("catches a screen drawing the header's underline by hand", () => {
    write(
      'export const Probe = () => <div className="border-b border-border-dim pb-6" />;\n'
    );

    expect(
      findHandWrittenParts().filter((offender) => offender.rule === "headerRule")
    ).toContainEqual({ rule: "headerRule", file: probeRelative, line: 1 });
  });

  it("leaves an ordinary bottom border alone — a card is not a header", () => {
    write('export const Probe = () => <div className="border-b border-border-dim/50 p-4" />;\n');

    expect(
      findHandWrittenParts().filter((offender) => offender.rule === "headerRule")
    ).toEqual([]);
  });
});
