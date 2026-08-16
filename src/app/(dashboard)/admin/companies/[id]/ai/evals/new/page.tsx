"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { NewEvalScreen } from "@/src/app/(dashboard)/admin/_features/evals/NewEvalScreen";

/** Writing a new check for this company. */
export default function NewCompanyEvalPage() {
  const params = useParams();
  return <NewEvalScreen companyId={params.id as Id<"companies">} />;
}
