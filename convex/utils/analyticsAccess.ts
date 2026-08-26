import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireAdmin } from "../authz";
import { appError } from "./appError";

/**
 * Who may read which analytics.
 *
 * A super admin sees everything; a company admin sees their own company and
 * the people in it. These four sat inside `analytics.ts` and were exported but
 * imported by nothing — access rules living in the middle of the maths that
 * uses them.
 */

export async function requireAnalyticsAdmin(ctx: QueryCtx) {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized", "Unauthorized");
    return admin;
}

export function assertAnalyticsUserAccess(admin: Doc<"users">, targetUser: Doc<"users">) {
    if (admin.role !== "SUPER_ADMIN") {
       if (admin.role !== "ADMIN" || admin.companyId !== targetUser.companyId || !admin.companyId) {
          throw appError("UNAUTHORIZED", "Unauthorized: Company Admin clearance required.");
       }
    }
}

export async function requireAnalyticsUserAccess(ctx: QueryCtx, targetUser: Doc<"users">) {
    const admin = await requireAnalyticsAdmin(ctx);
    assertAnalyticsUserAccess(admin, targetUser);
    return admin;
}

export async function requireAnalyticsCompanyAccess(ctx: QueryCtx, companyId: Id<"companies">) {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized", "Unauthorized");

    if (admin.role !== "SUPER_ADMIN") {
       if (admin.role !== "ADMIN" || admin.companyId !== companyId) {
          throw appError("UNAUTHORIZED", "Unauthorized");
       }
    }

    return admin;
}

