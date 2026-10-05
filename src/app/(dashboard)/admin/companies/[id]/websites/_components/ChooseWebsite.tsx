"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { SiteMark } from "@/src/app/(dashboard)/app/sites/_components/SiteMark";
import { SECTION_ICONS, pageApplies, sectionHref, type SectionPageId } from "./websitesSection";

/** The pages kept for one website at a time, which ask for one when All websites is chosen. */
export type OneWebsitePage = Extract<SectionPageId, "competitors" | "names" | "market" | "classification" | "todo" | "rankings" | "answers">;

/** One website on the list, as the section's chooser offers it. */
export type WebsiteChoice = FunctionReturnType<typeof api.websites.listWebsiteChoices>[number];

/**
 * A page kept for each website, opened with All websites chosen
 * (docs/plans/active/websites-section-menu-plan.md): it says so, and lists the
 * websites that have it — a company's own sites for competitors, its to-do
 * list and AI answers; every website for names and rankings — each opening
 * the page for it, as choosing it at the top of the menu does.
 *
 * `columns` adds columns after Website and Type, for a page whose All-websites
 * view says what each website has set on it — Market, each one's countries and
 * place (search-console-plan.md §16) — with `loading` while what they read is
 * on its way.
 */
export function ChooseWebsite({ page, columns = [], loading = false }: {
  page: OneWebsitePage;
  columns?: DataTableColumn<WebsiteChoice>[];
  loading?: boolean;
}) {
  const t = useTranslations("admin.websitesSection");
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;
  const choices = useQuery(api.websites.listWebsiteChoices, { companyId });
  const [pageNumber, setPageNumber] = useState(1);

  const websites = choices?.filter((choice) => pageApplies(page, choice.relationship));
  const totalPages = Math.max(1, Math.ceil((websites?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = websites?.slice((pageNumber - 1) * TABLE_PAGE_SIZE, pageNumber * TABLE_PAGE_SIZE);
  const Icon = SECTION_ICONS[page];

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Icon className="h-6 w-6 text-brand" />}
        title={t(`pages.${page}`)}
        description={t(`choose.${page}`)}
      />
      <DataTable
        rows={loading ? undefined : shown}
        rowKey={(row) => row.companyWebsiteId}
        onRowClick={(row) => router.push(sectionHref(companyId, page, { siteId: row.companyWebsiteId, relationship: row.relationship }))}
        empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: t("choose.empty") }}
        footer={{
          mode: "paged",
          page: pageNumber,
          totalPages,
          totalCount: websites?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: choices === undefined || loading,
          onPageChange: setPageNumber,
          labels: { empty: t("choose.empty") },
        }}
        columns={[
          {
            key: "website",
            header: t("choose.columns.website"),
            cell: (row) => (
              <span className="flex min-w-0 items-center gap-3">
                <SiteMark host={row.host} iconUrl={row.iconUrl} owned={row.relationship === "OWNED"} />
                <span className="truncate text-[13px] font-medium text-foreground">{row.host}</span>
              </span>
            ),
          },
          {
            key: "type",
            header: t("choose.columns.type"),
            cell: (row) => row.relationship === "OWNED"
              ? <TagLabel>{t("choose.owned")}</TagLabel>
              : (
                <div className="flex items-center gap-2">
                  <TagLabel>{t("choose.competitor")}</TagLabel>
                  <span className="text-[12px] text-muted">
                    {row.againstHost ? t("choose.of", { host: row.againstHost }) : t("choose.onItsOwn")}
                  </span>
                </div>
              ),
          },
          ...columns,
        ]}
      />
    </div>
  );
}
