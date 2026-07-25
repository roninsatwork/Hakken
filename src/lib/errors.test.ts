import { describe, expect, test } from "vitest";
import { getErrorMessage, toUserFacingMessage } from "./errors";

describe("error helpers", () => {
  test("returns an error message when one exists", () => {
    expect(getErrorMessage(new Error("Permission denied"), "Fallback")).toBe("Permission denied");
  });

  test("falls back for empty or non-error values", () => {
    expect(getErrorMessage(new Error(""), "Fallback")).toBe("Fallback");
    expect(getErrorMessage("bad", "Fallback")).toBe("Fallback");
    expect(getErrorMessage(null, "Fallback")).toBe("Fallback");
  });

  // The reason this helper was widened: every admin form using it was printing
  // the whole Convex envelope — request ID, placeholder, and stack — at the
  // user.
  test("unwraps a Convex envelope to the sentence the author wrote", () => {
    const convexFailure = new Error(
      [
        "[Request ID: 9f2c] Server Error",
        "Uncaught Error: Activation blocked: run an eval first.",
        "    at handler (../convex/agents.ts:214:11)",
      ].join("\n"),
    );

    expect(getErrorMessage(convexFailure, "Fallback")).toBe("Activation blocked: run an eval first.");
  });

  test("falls back when the envelope carries no sentence of its own", () => {
    const placeholderOnly = new Error("[Request ID: 9f2c] Server Error");

    expect(getErrorMessage(placeholderOnly, "The action could not be completed.")).toBe(
      "The action could not be completed.",
    );
  });

  test("skips stack frames and oversized payload lines", () => {
    const noisy = new Error(
      [
        "[Request ID: 9f2c] Server Error",
        `Uncaught Error: ${"x".repeat(250)}`,
        "    at handler (../convex/agents.ts:214:11)",
        "The company already has an active key.",
      ].join("\n"),
    );

    expect(toUserFacingMessage(noisy, "Fallback")).toBe("The company already has an active key.");
  });

  test("passes a plain sentence through untouched", () => {
    expect(toUserFacingMessage("A thrown string", "Fallback")).toBe("A thrown string");
  });
});
