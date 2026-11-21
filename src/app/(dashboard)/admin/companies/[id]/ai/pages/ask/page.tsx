"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiAskScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiAskScreen";

/** Ask this company's wiki a question; the pages it stood on open inside the company (S6). */
export default function CompanyWikiAskPage() {
  const companyId = useParams().id as Id<"companies">;
  return <WikiAskScreen companyId={companyId} basePath={`/admin/companies/${companyId}/ai/pages`} />;
}
