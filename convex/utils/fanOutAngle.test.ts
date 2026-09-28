import { describe, expect, test } from "vitest";
import { angleOf } from "./fanOutAngle";

/** The wordings of one angle (docs/plans/active/fan-out-angles-plan.md, FA5), from Korda's real fan-out searches. */
describe("one angle, several wordings", () => {
  test("the same words in another order are one angle", () => {
    expect(angleOf("budget carp fishing terminal tackle")).toBe(angleOf("carp fishing terminal tackle budget"));
    expect(angleOf("breaking strain carp fishing line")).toBe(angleOf("carp fishing line breaking strain"));
  });

  test("small words make no difference", () => {
    expect(angleOf("best carp fishing bait")).toBe(angleOf("best bait for carp fishing"));
    expect(angleOf("monofilament vs fluorocarbon vs braid carp fishing")).toBe(angleOf("monofilament vs fluorocarbon vs braid for carp fishing"));
    expect(angleOf("types of lead systems carp fishing")).toBe(angleOf("types of carp fishing lead systems"));
  });

  test("a plural is the same word as its singular", () => {
    expect(angleOf("best lead systems for carp fishing")).toBe(angleOf("best lead system for carp fishing"));
    expect(angleOf("types of carp fishing hooks")).toBe(angleOf("carp fishing hook types"));
    expect(angleOf("carp fishing lead systems")).toBe(angleOf("lead system carp fishing"));
  });

  test("hyphens and apostrophes join, capitals and spacing do not count", () => {
    expect(angleOf("top rated carp fishing luggage")).toBe(angleOf("top-rated carp fishing luggage"));
    expect(angleOf("an angler's guide")).toBe(angleOf("Anglers  guide"));
  });

  test("any other word keeps two wordings apart", () => {
    expect(angleOf("circle hooks carp")).not.toBe(angleOf("circle hooks for carp fishing"));
    expect(angleOf("best carp fishing luggage")).not.toBe(angleOf("best carp fishing luggage 2023"));
    expect(angleOf("carp fishing luggage reviews")).not.toBe(angleOf("best carp fishing luggage 2023 reviews"));
    expect(angleOf("monofilament vs fluorocarbon vs braid carp fishing")).not.toBe(angleOf("monofilament vs fluorocarbon vs braided line for carp fishing"));
  });

  test("short words and double s are never cut", () => {
    expect(angleOf("glass bus")).toBe("bus glass");
    expect(angleOf("is this carp")).toBe("carp is thi");
  });

  test("a wording of small words only is its own angle", () => {
    expect(angleOf("to be or not to be")).toBe("be be not");
    expect(angleOf("of the")).toBe("of the");
  });
});
