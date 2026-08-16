"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { EvalCaseDetailScreen } from "@/src/app/(dashboard)/admin/_features/evals/EvalCaseDetailScreen";

/** One of the global AI's checks. */
export default function GlobalEvalCaseDetailPage() {
  const params = useParams();
  return <EvalCaseDetailScreen evalCaseId={params.evalCaseId as Id<"companyEvalCases">} />;
}
