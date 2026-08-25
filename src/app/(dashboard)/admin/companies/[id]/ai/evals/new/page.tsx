import type { Id } from "@/convex/_generated/dataModel";
import { NewEvalScreen } from "@/src/app/(dashboard)/admin/_features/evals/NewEvalScreen";

/** Writing a new check for this company. */
export default async function NewCompanyEvalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NewEvalScreen companyId={id as Id<"companies">} />;
}
