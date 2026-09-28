import { redirect } from "next/navigation";

/**
 * A website's old Schedule and limits address. It became two screens on
 * 2026-09-28, Schedules and Limits (docs/plans/active/platform-limits-plan.md);
 * a link to the old one opens Schedules.
 */
export default async function OldSiteSchedulePage({ params }: { params: Promise<{ id: string; companyWebsiteId: string }> }) {
  const { id, companyWebsiteId } = await params;
  redirect(`/admin/companies/${id}/websites/site/${companyWebsiteId}/schedules`);
}
