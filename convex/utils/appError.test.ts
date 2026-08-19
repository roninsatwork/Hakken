import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { APP_ERROR_CODES, appError } from "./appError";

describe("appError", () => {
  test("returns a ConvexError carrying the code and message as data", () => {
    const error = appError("UNAUTHORIZED", "Unauthorized");

    expect(error).toBeInstanceOf(ConvexError);
    expect(error.data).toEqual({ code: "UNAUTHORIZED", message: "Unauthorized" });
  });

  // Hundreds of tests assert `rejects.toThrow("Unauthorized")`, which matches a
  // substring of `error.message`. ConvexError serialises its data into the
  // message, so the original sentence must remain findable there — this is the
  // property the whole conversion leans on.
  test("keeps the human sentence as a substring of error.message", () => {
    const error = appError("NO_ACTIVE_COMPANY", "No active company");

    expect(error.message).toContain("No active company");
    expect(error.message).toContain("NO_ACTIVE_COMPANY");
  });

  test("is throwable and matched by toThrow on the original sentence", () => {
    expect(() => {
      throw appError("MODULE_DISABLED", "This section is switched off for your workspace");
    }).toThrow("This section is switched off for your workspace");
  });

  test("every declared code round-trips through the helper", () => {
    for (const code of Object.values(APP_ERROR_CODES)) {
      expect(appError(code, "x").data.code).toBe(code);
    }
  });
});
