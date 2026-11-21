"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiWaitingScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiWaitingScreen";

/** What this company's wiki is waiting on you for: imports to review and open questions (S6). */
export default function CompanyWikiWaitingPage() {
  const companyId = useParams().id as Id<"companies">;
  return <WikiWaitingScreen companyId={companyId} basePath={`/admin/companies/${companyId}/ai/pages`} />;
}
