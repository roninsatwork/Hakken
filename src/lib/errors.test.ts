import { describe, expect, test } from "vitest";
import { getErrorMessage } from "./errors";

describe("error helpers", () => {
  test("returns an error message when one exists", () => {
    expect(getErrorMessage(new Error("Permission denied"), "Fallback")).toBe("Permission denied");
  });

  test("falls back for empty or non-error values", () => {
    expect(getErrorMessage(new Error(""), "Fallback")).toBe("Fallback");
    expect(getErrorMessage("bad", "Fallback")).toBe("Fallback");
    expect(getErrorMessage(null, "Fallback")).toBe("Fallback");
  });
});
