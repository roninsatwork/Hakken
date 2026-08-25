"use client";

import { lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const CompanyFeaturesContent = lazy(() =>
  import("./CompanyFeaturesContent").then((module) => ({
    default: module.CompanyFeaturesContent,
  }))
);

/**
 * What this workspace can reach.
 *
 * Lived as a card at the bottom of the company's Overview screen until
 * 2026-08-18, where Anthony found it: *"this needs to be on its own screen in
 * the company"*. It had outgrown the spot. When it was written it offered one
 * bespoke module and read as a footnote to the profile; it now decides whether
 * a workspace has Tasks, Calls, Reception, a Wiki and the rest, which is not
 * a footnote to anything.
 *
 * Saves on its own, as it always did. Editing the company's details and
 * granting it a section are different kinds of change, and coupling them would
 * mean a half-finished profile edit blocks switching a feature on.
 *
 * Super admin only, matching the plan override: a workspace admin choosing
 * which features their own workspace holds would defeat the point of the flag.
 *
 * A standard table since 2026-08-22. It was a column of bordered tick-box rows,
 * which was a shape no other screen used — Anthony, with the screen open:
 * *"this is not our standard table... with the pagination footer and search."*
 * The list is short enough that neither the search nor the footer earns its
 * place on its own; they are here because every list screen in the admin has
 * them, and a screen that drops them because its list is short is how the
 * section stops matching itself.
 */
export default function CompanyFeaturesPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const currentUser = useQuery(api.users.getMe);
  const planGrants = useQuery(api.companies.getPlanGrantsForCompany, { id: companyId });

  // Nothing at all until the answer arrives, rather than a screen that says
  // "not allowed" for a moment to the person who is allowed.
  if (currentUser === undefined || company === undefined) return null;

  if (currentUser?.role !== "SUPER_ADMIN") {
    return (
      <p className="text-[13px] text-secondary">
        Only a platform administrator can change which features a workspace has.
      </p>
    );
  }

  return (
    <Suspense fallback={null}>
      <CompanyFeaturesContent
        companyId={companyId}
        enabledModules={company?.enabledModules}
        planGrants={planGrants}
      />
    </Suspense>
  );
}
