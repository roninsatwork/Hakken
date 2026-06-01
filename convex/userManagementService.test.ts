import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  assertCanCreateManagedUser,
  assertCanDeleteManagedUser,
  assertCanUpdateManagedUser,
} from "./userManagementService";

const companyA = "company-a" as Id<"companies">;
const companyB = "company-b" as Id<"companies">;

const caller = (role: "USER" | "ADMIN" | "SUPER_ADMIN", companyId?: Id<"companies">, impersonatingCompanyId?: Id<"companies">) => ({
  role,
  companyId,
  impersonatingCompanyId,
});

const target = (role: "USER" | "ADMIN" | "SUPER_ADMIN", companyId?: Id<"companies">) => ({
  role,
  companyId,
});

describe("user management service policy", () => {
  test("allows unimpersonated super admins to create, update, and delete across tenants", () => {
    const superAdmin = caller("SUPER_ADMIN");

    expect(() =>
      assertCanCreateManagedUser({
        caller: superAdmin,
        activeCompanyId: undefined,
        newRole: "SUPER_ADMIN",
        newCompanyId: companyB,
      })
    ).not.toThrow();

    expect(() =>
      assertCanUpdateManagedUser({
        caller: superAdmin,
        activeCompanyId: undefined,
        targetUser: target("SUPER_ADMIN", companyB),
        nextCompanyId: companyA,
      })
    ).not.toThrow();

    expect(() =>
      assertCanDeleteManagedUser({
        caller: superAdmin,
        activeCompanyId: undefined,
        targetUser: target("SUPER_ADMIN", companyB),
      })
    ).not.toThrow();
  });

  test("allows admins to manage non-super-admin users inside their active company", () => {
    const admin = caller("ADMIN", companyA);

    expect(() =>
      assertCanCreateManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        newRole: "USER",
        newCompanyId: companyA,
      })
    ).not.toThrow();

    expect(() =>
      assertCanUpdateManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        targetUser: target("USER", companyA),
        nextRole: "ADMIN",
        nextCompanyId: companyA,
      })
    ).not.toThrow();

    expect(() =>
      assertCanDeleteManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        targetUser: target("USER", companyA),
      })
    ).not.toThrow();
  });

  test("blocks admin privilege escalation and cross-tenant changes", () => {
    const admin = caller("ADMIN", companyA);

    expect(() =>
      assertCanCreateManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        newRole: "SUPER_ADMIN",
        newCompanyId: companyA,
      })
    ).toThrow("Unauthorized: Insufficient privileges");

    expect(() =>
      assertCanUpdateManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        targetUser: target("USER", companyA),
        nextRole: "SUPER_ADMIN",
      })
    ).toThrow("Unauthorized: Insufficient privileges");

    expect(() =>
      assertCanUpdateManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        targetUser: target("USER", companyA),
        nextCompanyId: companyB,
      })
    ).toThrow("Unauthorized: Insufficient privileges");
  });

  test("blocks admins from managing foreign tenants or super admins", () => {
    const admin = caller("ADMIN", companyA);

    expect(() =>
      assertCanUpdateManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        targetUser: target("USER", companyB),
      })
    ).toThrow("Unauthorized");

    expect(() =>
      assertCanUpdateManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        targetUser: target("SUPER_ADMIN", companyA),
      })
    ).toThrow("Unauthorized: Cannot modify a Super Administrator");

    expect(() =>
      assertCanDeleteManagedUser({
        caller: admin,
        activeCompanyId: companyA,
        targetUser: target("SUPER_ADMIN", companyA),
      })
    ).toThrow("Unauthorized: Cannot delete a Super Administrator");
  });

  test("treats impersonating super admins as scoped tenant admins", () => {
    const impersonatingSuperAdmin = caller("SUPER_ADMIN", undefined, companyA);

    expect(() =>
      assertCanCreateManagedUser({
        caller: impersonatingSuperAdmin,
        activeCompanyId: companyA,
        newRole: "USER",
        newCompanyId: companyA,
      })
    ).not.toThrow();

    expect(() =>
      assertCanCreateManagedUser({
        caller: impersonatingSuperAdmin,
        activeCompanyId: companyA,
        newRole: "USER",
        newCompanyId: companyB,
      })
    ).toThrow("Unauthorized");
  });
});
