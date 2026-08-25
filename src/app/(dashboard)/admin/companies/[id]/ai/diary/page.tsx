import type { Id } from "@/convex/_generated/dataModel";
import { WikiDiaryScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen";

/** This company's brain's diary — what its wiki learned, newest first
 * (watch-it-think plan, phase 4). */
export default async function CompanyDiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = id as Id<"companies">;
  return (
    <WikiDiaryScreen
      companyId={companyId}
      pageBasePath={`/admin/companies/${companyId}/ai/pages`}
    />
  );
}
