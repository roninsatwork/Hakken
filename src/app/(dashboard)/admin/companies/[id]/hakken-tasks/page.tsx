"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { HakkenTasksScreen } from "@/src/app/(dashboard)/_features/hakken-tasks/HakkenTasksScreen";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

/**
 * Admin → Companies → a company → Hakken tasks (docs/plans/active/
 * hakken-tasks-plan.md, item 1.5; board CompanyJobs): everyone's in the
 * company, with who asked, for a super admin to pause, resume or delete. A
 * page inside the company's section: its own header, with no rule and, as
 * drawn, no icon — the section's tab already wears it.
 */
export default function CompanyHakkenTasksPage() {
  const t = useTranslations("hakkenTasks");
  const { platformName } = useSystemSettings();
  const companyId = useParams().id as Id<"companies">;
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const rows = useQuery(api.hakkenTasks.listForCompany, { companyId });
  const pause = useMutation(api.hakkenTasks.pauseForCompany);
  const resume = useMutation(api.hakkenTasks.resumeForCompany);
  const remove = useMutation(api.hakkenTasks.deleteForCompany);

  return (
    <HakkenTasksScreen
      description={t("company.description", { platformName, company: company?.name ?? "" })}
      rows={rows}
      scope="admin-company-hakken-tasks"
      forCompany
      pause={pause}
      resume={resume}
      remove={remove}
    />
  );
}
