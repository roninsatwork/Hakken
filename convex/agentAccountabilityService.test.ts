import { describe, expect, test } from "vitest";
import {
  assertPurposeAndOwner,
  describePurposeAndOwnerProblems,
  normalisePurpose,
} from "./agentAccountabilityService";

const owner = "user_1";

describe("nothing is created without a purpose and a person", () => {
  test("names every problem at once", () => {
    // Telling someone about one missing field, then the next one after they fix
    // it, is the slowest way to fill in a form.
    expect(describePurposeAndOwnerProblems({ purpose: "", ownerId: undefined })).toEqual([
      "Say what this is for, in a sentence.",
      "Choose the person accountable for this.",
    ]);
  });

  test("a described and owned assistant has no problems", () => {
    expect(
      describePurposeAndOwnerProblems({
        purpose: "Checks invoices against purchase orders.",
        ownerId: owner,
      })
    ).toEqual([]);
  });

  test("a single word is not a purpose", () => {
    // It passes "not empty" and tells a reader nothing.
    expect(describePurposeAndOwnerProblems({ purpose: "Invoices", ownerId: owner })).toEqual([
      "The purpose is too short to tell anyone what this does.",
    ]);
  });

  test("whitespace is not a purpose either", () => {
    expect(describePurposeAndOwnerProblems({ purpose: "        ", ownerId: owner })).toEqual([
      "Say what this is for, in a sentence.",
    ]);
  });

  test("a purpose without an owner is still incomplete", () => {
    expect(
      describePurposeAndOwnerProblems({ purpose: "Summarises support threads.", ownerId: undefined })
    ).toEqual(["Choose the person accountable for this."]);
  });

  test("the thrown message says everything wrong, in plain sentences", () => {
    expect(() => assertPurposeAndOwner({ purpose: undefined, ownerId: undefined })).toThrow(
      "Say what this is for, in a sentence. Choose the person accountable for this."
    );
  });

  test("a complete record throws nothing", () => {
    expect(() =>
      assertPurposeAndOwner({ purpose: "Finds new parent groups to sell to.", ownerId: owner })
    ).not.toThrow();
  });

  test("purpose is stored trimmed, so a padded string is not a description", () => {
    expect(normalisePurpose("  Checks invoices.  ")).toBe("Checks invoices.");
    expect(normalisePurpose(undefined)).toBe("");
  });
});
