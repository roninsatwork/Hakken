"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";

/**
 * What the company's AI questions, Google searches and AI searches share
 * (docs/plans/active/fan-out-angles-plan.md, FA9): the company, and its own
 * websites with each one's everyday check limit and prompts against their
 * limit, for the add boxes. Each is a page of the Websites section's menu
 * (websites-section-menu-plan.md).
 */

export function useAiLists() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const counts = useQuery(api.companyAiLists.companyAiListCounts, { companyId });
  return { companyId, counts, base: `/admin/companies/${companyId}/websites/ai-searches` };
}

/** Which of the company's own websites an added question or search is for. */
export function WebsitePicker({
  id,
  value,
  onChange,
  websites,
}: {
  id: string;
  value: string;
  onChange: (companyWebsiteId: string) => void;
  websites: ReadonlyArray<{ companyWebsiteId: string; host: string }>;
}) {
  const t = useTranslations("admin.companyAiLists");
  return (
    <div className="flex min-w-[12rem] flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{t("websiteLabel")}</FieldLabel>
      <Select id={id} value={value} onChange={onChange}>
        {websites.map((site) => (
          <option key={site.companyWebsiteId} value={site.companyWebsiteId}>{site.host}</option>
        ))}
      </Select>
    </div>
  );
}

/** The website an add box is for: the one chosen, else the company's first. */
export function chosenWebsite<Site extends { companyWebsiteId: Id<"companyWebsites"> }>(
  chosen: string,
  websites: ReadonlyArray<Site> | undefined,
): Site | null {
  return websites?.find((site) => site.companyWebsiteId === chosen) ?? websites?.[0] ?? null;
}
