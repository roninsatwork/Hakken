"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPageDetailScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPageDetailScreen";

/** One page of this company's wiki, from the company detail screen. */
export default function CompanyWikiPageDetailPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  return (
    <WikiPageDetailScreen
      pageId={params.pageId as Id<"wikiPages">}
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/ai/pages`}
    />
  );
}
