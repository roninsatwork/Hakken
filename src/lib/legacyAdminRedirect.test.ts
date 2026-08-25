import { describe, expect, it } from "vitest";
import { legacyAdminRedirect } from "./legacyAdminRedirect";

describe("legacyAdminRedirect", () => {
  it("redirects only the exact legacy agent skills route", () => {
    expect(legacyAdminRedirect("/admin/agents/skills")).toBe("/admin/ai/skills");
    expect(legacyAdminRedirect("/admin/agents/skills/extra")).toBeNull();
    expect(legacyAdminRedirect("/admin/agents/skill")).toBeNull();
    expect(legacyAdminRedirect("/admin/ai/skills")).toBeNull();
  });
});
