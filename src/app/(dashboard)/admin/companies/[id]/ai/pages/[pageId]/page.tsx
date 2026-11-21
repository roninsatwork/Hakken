"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPageDetailScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPageDetailScreen";

/** One page of this company's wiki, from the company detail screen. Its open
 * questions are settled on the company's Waiting on you page (S6). */
export default function CompanyWikiPageDetailPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const basePath = `/admin/companies/${companyId}/ai/pages`;
  return (
    <WikiPageDetailScreen
      pageId={params.pageId as Id<"wikiPages">}
      companyId={companyId}
      basePath={basePath}
      waitingHref={`${basePath}/waiting`}
    />
  );
}
