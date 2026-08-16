"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiDiaryScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen";

/** This company's brain's diary — what its wiki learned, newest first
 * (watch-it-think plan, phase 4). */
export default function CompanyDiaryPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  return (
    <WikiDiaryScreen
      companyId={companyId}
      pageBasePath={`/admin/companies/${companyId}/ai/pages`}
    />
  );
}
