"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { EvalsScreen } from "@/src/app/(dashboard)/admin/_features/evals/EvalsScreen";

/** This company's checks. */
export default function CompanyAiEvalsPage() {
  const params = useParams();
  return <EvalsScreen companyId={params.id as Id<"companies">} />;
}
