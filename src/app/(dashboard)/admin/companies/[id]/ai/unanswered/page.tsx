import type { Id } from "@/convex/_generated/dataModel";
import { UnansweredScreen } from "@/src/app/(dashboard)/admin/_features/wiki/UnansweredScreen";

/** This company's own gaps (Anthony's ruling, 2026-08-17: the screen is
 * on every company and also the global AI). */
export default async function CompanyUnansweredPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = id as Id<"companies">;
  return (
    <UnansweredScreen
      companyId={companyId}
      feedWikiHref={`/admin/companies/${companyId}/ai/pages`}
    />
  );
}
