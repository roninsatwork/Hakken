"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiMapScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiMapScreen";

/** This company's knowledge graph, from the company detail screen. */
export default function CompanyWikiMapPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  return (
    <WikiMapScreen companyId={companyId} basePath={`/admin/companies/${companyId}/ai/pages`} />
  );
}
