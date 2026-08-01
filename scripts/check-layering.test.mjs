import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findHardcodedLayers, findStaleFreezes } from "./check-layering.mjs";
import { LAYER, LAYER_ORDER, layerValue } from "../src/ui/lib/layers.ts";

/**
 * The scale is only worth having if the order holds and the guard bites. The
 * ordering test is the one that matters: page chrome sitting below the header
 * is the invariant whose absence put the account menu behind a filter bar.
 */

const scratch = path.join(process.cwd(), "src", "ui", "__layering_probe__.tsx");

afterEach(() => {
  if (fs.existsSync(scratch)) fs.rmSync(scratch);
});

describe("the layering scale", () => {
  it("orders every role from lowest to highest with no ties", () => {
    const values = LAYER_ORDER.map(layerValue);
    const ascending = values.every((value, index) => index === 0 || value > values[index - 1]);

    expect(ascending).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps page chrome below the header", () => {
    // The whole bug in one assertion: a filter bar must never reach the layer
    // the account menu opens on.
    expect(layerValue("PAGE_CHROME")).toBeLessThan(layerValue("HEADER"));
  });

  it("keeps overlays above the header and the sidebar", () => {
    expect(layerValue("OVERLAY")).toBeGreaterThan(layerValue("HEADER"));
    expect(layerValue("OVERLAY")).toBeGreaterThan(layerValue("SIDEBAR"));
    expect(layerValue("NOTIFICATION")).toBeGreaterThan(layerValue("OVERLAY"));
  });

  it("names a role for every value it exposes", () => {
    expect(Object.keys(LAYER).sort()).toEqual([...LAYER_ORDER].sort());
  });
});

describe("the layering guard", () => {
  it("passes on the codebase as it stands", () => {
    expect(findHardcodedLayers()).toEqual([]);
    expect(findStaleFreezes()).toEqual([]);
  });

  it("catches a new file that picks its own z-index", () => {
    fs.writeFileSync(
      scratch,
      'export const Probe = () => <div className="fixed z-30">probe</div>;\n'
    );

    const offenders = findHardcodedLayers();

    expect(offenders.map((offender) => offender.file)).toContain(
      path.relative(process.cwd(), scratch)
    );
    expect(offenders.find((o) => o.file.includes("__layering_probe__"))?.classes).toEqual(["z-30"]);
  });

  it("catches an arbitrary-value escalation too", () => {
    fs.writeFileSync(
      scratch,
      'export const Probe = () => <div className="fixed z-[9999]">probe</div>;\n'
    );

    expect(findHardcodedLayers().some((o) => o.classes.includes("z-[9999]"))).toBe(true);
  });

  it("accepts a file that takes its layer from the scale", () => {
    fs.writeFileSync(
      scratch,
      'import { LAYER } from "@/src/ui/lib/layers";\n' +
        "export const Probe = () => <div className={`fixed ${LAYER.PAGE_CHROME}`}>probe</div>;\n"
    );

    expect(findHardcodedLayers().some((o) => o.file.includes("__layering_probe__"))).toBe(false);
  });
});
