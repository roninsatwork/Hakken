"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { EditEvalScreen } from "@/src/app/(dashboard)/admin/_features/evals/EditEvalScreen";

/** Editing one of the global AI's checks. */
export default function EditGlobalEvalPage() {
  const params = useParams();
  return <EditEvalScreen evalCaseId={params.evalCaseId as Id<"companyEvalCases">} />;
}
