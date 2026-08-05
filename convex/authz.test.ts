import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ADMIN_READ_ROLES,
  ADMIN_WRITE_ROLES,
  GOVERNANCE_READ_ROLES,
  OVERSIGHT_ROLES,
  SUPER_ADMIN_READ_ROLES,
  assertAdminCanAccessCompany,
  canAccessCompany,
  getActiveCompanyId,
  isOversightRole,
} from "./authz";

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

/**
 * The oversight roles exist so a compliance officer can read the governance
 * surfaces without being able to change the platform they are overseeing.
 * These tests are the guarantee behind that sentence.
 */
describe("oversight roles", () => {
  test("read-only can read admin surfaces but never write", () => {
    expect(ADMIN_READ_ROLES).toContain("READ_ONLY");
    expect(ADMIN_WRITE_ROLES).not.toContain("READ_ONLY");
  });

  test("auditor reads only the governance surfaces", () => {
    expect(GOVERNANCE_READ_ROLES).toContain("AUDITOR");
    // Deliberately narrower than an administrator's reach: an auditor sees the
    // register and the evidence, not every admin screen on the platform.
    expect(ADMIN_READ_ROLES).not.toContain("AUDITOR");
    expect(ADMIN_WRITE_ROLES).not.toContain("AUDITOR");
  });

  test("no oversight role can write anywhere", () => {
    for (const role of OVERSIGHT_ROLES) {
      expect(ADMIN_WRITE_ROLES).not.toContain(role);
      expect(isOversightRole(role)).toBe(true);
    }
  });

  test("the roles that could already write still can, so nothing loosened", () => {
    expect(ADMIN_WRITE_ROLES).toEqual(["ADMIN", "SUPER_ADMIN"]);
  });

  test("read-only reaches platform-wide reads, because the admin section is the platform console", () => {
    // Without this a read-only account would open the admin section and find
    // around sixty of its screens refusing to load.
    expect(SUPER_ADMIN_READ_ROLES).toContain("READ_ONLY");
    expect(SUPER_ADMIN_READ_ROLES).toContain("SUPER_ADMIN");
  });

  test("no read list admits a role that could not already read there", () => {
    // Every widening in this change is additive and limited to the oversight
    // roles. An ordinary user gains nothing, and neither does anonymous access.
    for (const roles of [ADMIN_READ_ROLES, GOVERNANCE_READ_ROLES, SUPER_ADMIN_READ_ROLES]) {
      for (const role of roles) {
        expect(["ADMIN", "SUPER_ADMIN", "READ_ONLY", "AUDITOR"]).toContain(role);
      }
    }
  });

  test("an auditor cannot reach platform-wide reads", () => {
    expect(SUPER_ADMIN_READ_ROLES).not.toContain("AUDITOR");
  });

  test("an ordinary user is not admitted by any of the new lists", () => {
    for (const roles of [ADMIN_READ_ROLES, ADMIN_WRITE_ROLES, GOVERNANCE_READ_ROLES]) {
      expect(roles).not.toContain("USER");
    }
  });

  test("oversight accounts are company-scoped exactly as admins are", () => {
    for (const role of OVERSIGHT_ROLES) {
      const scoped = user({ role, companyId: companyA });

      expect(() => assertAdminCanAccessCompany(scoped, companyA)).not.toThrow();
      expect(() => assertAdminCanAccessCompany(scoped, companyB)).toThrow("Unauthorized");
      // A scoped account with no company reaches nothing, rather than reaching
      // every record whose company is also unset.
      expect(() => assertAdminCanAccessCompany(scoped, undefined)).toThrow("Unauthorized");
    }
  });

  test("an ordinary user still reaches no company through the admin path", () => {
    const ordinary = user({ role: "USER", companyId: companyA });

    expect(() => assertAdminCanAccessCompany(ordinary, companyA)).toThrow("Unauthorized");
  });
});
