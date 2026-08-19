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

  // Structured errors from convex/utils/appError.ts: the payload's message IS
  // the sentence the author wrote, so it is returned verbatim, ahead of any
  // envelope-scraping.
  describe("structured ConvexError payloads", () => {
    test("reads the payload from an error's data property", () => {
      const convexError = Object.assign(new Error('{"code":"UNAUTHORIZED","message":"Unauthorized"}'), {
        data: { code: "UNAUTHORIZED", message: "Unauthorized" },
      });

      expect(toUserFacingMessage(convexError, "Fallback")).toBe("Unauthorized");
      expect(getErrorMessage(convexError, "Fallback")).toBe("Unauthorized");
    });

    test("parses the payload out of a production envelope message", () => {
      // In production Convex serialises the payload into the message text; the
      // data property may not survive re-wrapping, but the JSON does.
      const productionShape = new Error(
        [
          "[Request ID: 9f2c] Server Error",
          'Uncaught ConvexError: {"code":"MODULE_DISABLED","message":"This section is switched off for your workspace"}',
          "    at handler (../convex/tenantFunctions.ts:294:11)",
        ].join("\n"),
      );

      expect(toUserFacingMessage(productionShape, "Fallback")).toBe(
        "This section is switched off for your workspace",
      );
    });

    test("parses the payload when only the message string survived", () => {
      expect(
        toUserFacingMessage('Uncaught ConvexError: {"code":"NOT_FOUND","message":"Company not found"}', "Fallback"),
      ).toBe("Company not found");
    });

    test("ignores data of the wrong shape and falls back to scraping", () => {
      const wrongShape = Object.assign(new Error("Activation blocked: run an eval first."), {
        data: { status: 500 },
      });

      expect(toUserFacingMessage(wrongShape, "Fallback")).toBe("Activation blocked: run an eval first.");
    });

    test("legacy plain errors still unwrap through the string scrape", () => {
      const legacy = new Error(
        ["[Request ID: 9f2c] Server Error", "Uncaught Error: Company not found", "    at handler (x.ts:1:1)"].join(
          "\n",
        ),
      );

      expect(toUserFacingMessage(legacy, "Fallback")).toBe("Company not found");
    });
  });
});
