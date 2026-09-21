import { describe, expect, it } from "vitest";
import { sanitizeAuthRedirect } from "./authRedirect";

describe("sanitizeAuthRedirect", () => {
  it("preserves internal protected routes and their query strings", () => {
    expect(sanitizeAuthRedirect(
      "/app/tasks?commissioning=1&deepCapture=1",
    )).toBe("/app/tasks?commissioning=1&deepCapture=1");
    expect(sanitizeAuthRedirect("/app/tasks/deep")).toBe(
      "/app/tasks/deep",
    );
    expect(sanitizeAuthRedirect("/admin/companies?view=active")).toBe(
      "/admin/companies?view=active",
    );
  });

  it("rejects external, malformed and unprotected destinations", () => {
    expect(sanitizeAuthRedirect("https://example.com/steal")).toBe("/app");
    expect(sanitizeAuthRedirect("//example.com/steal")).toBe("/app");
    expect(sanitizeAuthRedirect("/\\example.com/steal")).toBe("/app");
    expect(sanitizeAuthRedirect("/login")).toBe("/app");
    expect(sanitizeAuthRedirect(null)).toBe("/app");
  });
});
