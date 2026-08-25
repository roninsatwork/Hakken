import type { Id } from "@/convex/_generated/dataModel";
import { CompanyMailboxScreen } from "@/src/app/(dashboard)/admin/_features/work/CompanyMailboxScreen";

/** This company's handled mail, visible to the admin at last (seven-gaps
 * plan, phase 1). */
export default async function CompanyMailboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = id as Id<"companies">;
  return <CompanyMailboxScreen companyId={companyId} />;
}
