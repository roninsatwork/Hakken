"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiPagesScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPagesScreen";

/** This company's wiki, from the company detail screen: one company only
 * (Anthony's ruling, 2026-08-14). Adding, what's waiting, Ask and the
 * check-up each have a page of their own in the company's AI menu
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S6). */
export default function CompanyWikiPagesPage() {
  const companyId = useParams().id as Id<"companies">;
  return <WikiPagesScreen companyId={companyId} basePath={`/admin/companies/${companyId}/ai/pages`} />;
}
