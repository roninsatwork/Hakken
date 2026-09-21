import type { Id } from "@/convex/_generated/dataModel";
import { DecisionDetailScreen } from "@/src/app/(dashboard)/admin/_features/decisions/DecisionDetailScreen";

/** One Decision as it ran for this company. */
export default async function CompanyDecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string; key: string }>;
}) {
  const { id, key } = await params;
  return <DecisionDetailScreen companyId={id as Id<"companies">} decisionKey={decodeURIComponent(key)} />;
}
