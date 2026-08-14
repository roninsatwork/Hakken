"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPagesListScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPagesListScreen";

/** This company's wiki, from the company detail screen — one company only
 * (Anthony's ruling, 2026-08-14). */
export default function CompanyWikiPagesPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  return (
    <WikiPagesListScreen
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/ai/pages`}
    />
  );
}
