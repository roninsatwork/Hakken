import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdminCanAccessCompany, canAccessCompany, getActiveCompanyId } from "./authz";

const companyA = "company_a" as Id<"companies">;
const companyB = "company_b" as Id<"companies">;

function user(overrides: Partial<Doc<"users">>): Doc<"users"> {
  return {
    _id: "user_1" as Id<"users">,
    _creationTime: Date.now(),
    email: "user@example.com",
    ...overrides,
  } as Doc<"users">;
}

describe("authz tenant helpers", () => {
  test("active company prefers impersonation over the assigned company", () => {
    const current = user({
      role: "SUPER_ADMIN",
      companyId: companyA,
      impersonatingCompanyId: companyB,
    });

    expect(getActiveCompanyId(current)).toBe(companyB);
  });

  test("admins can access only their active company", () => {
    const admin = user({ role: "ADMIN", companyId: companyA });

    expect(canAccessCompany(admin, companyA)).toBe(true);
    expect(canAccessCompany(admin, companyB)).toBe(false);
    expect(() => assertAdminCanAccessCompany(admin, companyB)).toThrow("Unauthorized");
  });

  test("super admins can access any company", () => {
    const superAdmin = user({ role: "SUPER_ADMIN" });

    expect(canAccessCompany(superAdmin, companyA)).toBe(true);
    expect(() => assertAdminCanAccessCompany(superAdmin, companyB)).not.toThrow();
  });
});
