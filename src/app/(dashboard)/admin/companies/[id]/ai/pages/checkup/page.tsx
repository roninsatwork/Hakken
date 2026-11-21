"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiCheckupPage } from "@/src/app/(dashboard)/admin/_features/wiki/WikiCheckupPage";

/** This company's wiki's nightly check-up and its week (S6, S8). */
export default function CompanyWikiCheckupPage() {
  const companyId = useParams().id as Id<"companies">;
  return <WikiCheckupPage companyId={companyId} waitingHref={`/admin/companies/${companyId}/ai/pages/waiting`} />;
}
