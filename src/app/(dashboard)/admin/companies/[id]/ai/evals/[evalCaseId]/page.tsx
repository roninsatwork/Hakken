import type { Id } from "@/convex/_generated/dataModel";
import { EvalCaseDetailScreen } from "@/src/app/(dashboard)/admin/_features/evals/EvalCaseDetailScreen";

/** One of this company's checks. */
export default async function CompanyEvalCaseDetailPage({
  params,
}: {
  params: Promise<{
    id: Id<"companies">;
    evalCaseId: Id<"companyEvalCases">;
  }>;
}) {
  const { id, evalCaseId } = await params;
  return (
    <EvalCaseDetailScreen
      companyId={id}
      evalCaseId={evalCaseId}
    />
  );
}
