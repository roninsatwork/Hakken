"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiNewGoalScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiNewGoalScreen";

/** A new goal in this company's wiki, on a page of its own rather than a pop-up (S6). */
export default function CompanyWikiNewGoalPage() {
  const companyId = useParams().id as Id<"companies">;
  return <WikiNewGoalScreen companyId={companyId} basePath={`/admin/companies/${companyId}/ai/pages`} />;
}
