"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { EditEvalScreen } from "@/src/app/(dashboard)/admin/_features/evals/EditEvalScreen";

/** Editing one of this company's checks. */
export default function EditCompanyEvalPage() {
  const params = useParams();
  return (
    <EditEvalScreen
      companyId={params.id as Id<"companies">}
      evalCaseId={params.evalCaseId as Id<"companyEvalCases">}
    />
  );
}
