import type { Id } from "@/convex/_generated/dataModel";
import { CompanyCallsScreen } from "@/src/app/(dashboard)/admin/_features/work/CompanyCallsScreen";

/** This company's calls, visible to the admin at last (seven-gaps plan,
 * phase 1). */
export default async function CompanyCallsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompanyCallsScreen companyId={id as Id<"companies">} />;
}
