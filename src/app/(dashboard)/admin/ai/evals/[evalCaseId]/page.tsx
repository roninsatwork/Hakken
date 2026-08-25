import type { Id } from "@/convex/_generated/dataModel";
import { EvalCaseDetailScreen } from "@/src/app/(dashboard)/admin/_features/evals/EvalCaseDetailScreen";

/** One of the global AI's checks. */
export default async function GlobalEvalCaseDetailPage({
  params,
}: {
  params: Promise<{ evalCaseId: Id<"companyEvalCases"> }>;
}) {
  const { evalCaseId } = await params;
  return <EvalCaseDetailScreen evalCaseId={evalCaseId} />;
}
