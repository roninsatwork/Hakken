import { describe, expect, it } from "vitest";
import { sanitizeAuthRedirect } from "./authRedirect";

describe("sanitizeAuthRedirect", () => {
  it("preserves internal protected routes and their query strings", () => {
    expect(sanitizeAuthRedirect(
      "/demos/movement-capture?commissioning=1&deepCapture=1",
    )).toBe("/demos/movement-capture?commissioning=1&deepCapture=1");
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
