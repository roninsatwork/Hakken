"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { CompanyCallsScreen } from "@/src/app/(dashboard)/admin/_features/work/CompanyCallsScreen";

/** This company's calls, visible to the admin at last (seven-gaps plan,
 * phase 1). */
export default function CompanyCallsPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  return <CompanyCallsScreen companyId={companyId} />;
}
