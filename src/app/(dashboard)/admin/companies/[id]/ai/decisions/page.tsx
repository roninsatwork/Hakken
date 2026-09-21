import type { Id } from "@/convex/_generated/dataModel";
import { DecisionsScreen } from "@/src/app/(dashboard)/admin/_features/decisions/DecisionsScreen";

/** This company's Decisions: the platform's mode beside its own. */
export default async function CompanyDecisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DecisionsScreen companyId={id as Id<"companies">} />;
}
