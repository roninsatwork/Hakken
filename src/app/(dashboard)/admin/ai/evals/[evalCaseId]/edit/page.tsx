import type { Id } from "@/convex/_generated/dataModel";
import { EditEvalScreen } from "@/src/app/(dashboard)/admin/_features/evals/EditEvalScreen";

/** Editing one of the global AI's checks. */
export default async function EditGlobalEvalPage({
  params,
}: {
  params: Promise<{ evalCaseId: string }>;
}) {
  const { evalCaseId } = await params;
  return <EditEvalScreen evalCaseId={evalCaseId as Id<"companyEvalCases">} />;
}
