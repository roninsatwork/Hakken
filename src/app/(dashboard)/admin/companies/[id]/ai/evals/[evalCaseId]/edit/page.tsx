import type { Id } from "@/convex/_generated/dataModel";
import { EditEvalScreen } from "@/src/app/(dashboard)/admin/_features/evals/EditEvalScreen";

/** Editing one of this company's checks. */
export default async function EditCompanyEvalPage({
  params,
}: {
  params: Promise<{ id: Id<"companies">; evalCaseId: Id<"companyEvalCases"> }>;
}) {
  const { id, evalCaseId } = await params;

  return (
    <EditEvalScreen
      companyId={id}
      evalCaseId={evalCaseId}
    />
  );
}
