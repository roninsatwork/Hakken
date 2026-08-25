import type { Id } from "@/convex/_generated/dataModel";
import { WikiMapScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiMapScreen";

/** This company's knowledge graph, from the company detail screen. */
export default async function CompanyWikiMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = id as Id<"companies">;
  return (
    <WikiMapScreen companyId={companyId} basePath={`/admin/companies/${companyId}/ai/pages`} />
  );
}
