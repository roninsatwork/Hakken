import { describe, expect, it } from "vitest";
import { boxOpacity } from "./SiteTreemap";

/** The box under the mouse lights up and the rest step back (Anthony, 2026-11-04: "rollover states"). */
describe("a box's strength on a rollover", () => {
  it("is its own shade with nothing under the mouse; stronger under it; weaker while another is", () => {
    const own = boxOpacity(0.5, null, "a");
    expect(boxOpacity(0.5, "a", "a")).toBeGreaterThan(own);
    expect(boxOpacity(0.5, "b", "a")).toBeLessThan(own);
  });

  it("never passes full strength, however strong the box", () => {
    expect(boxOpacity(1, "a", "a")).toBeLessThanOrEqual(1);
  });
});
