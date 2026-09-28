import { redirect } from "next/navigation";

/**
 * The company's old Schedule and limits address. It became two screens on
 * 2026-09-28, Schedules and Limits (docs/plans/active/platform-limits-plan.md;
 * Anthony: "This should be two screens / Schedules / Limits"); a link to the
 * old one opens Schedules.
 */
export default async function OldCompanySchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/companies/${id}/websites/schedules`);
}
