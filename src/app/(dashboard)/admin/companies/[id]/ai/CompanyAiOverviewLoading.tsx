"use client";

import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Area } from "./CompanyAiOverviewContent";

export default function CompanyAiOverviewLoading() {
  const t = useTranslations("admin.companyDetails.aiOverview");

  return (
    <>
      <PageHeader
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
      />
      <DataTable<Area>
        rows={undefined}
        rowKey={(area) => area.key}
        minWidthClassName="min-w-[720px]"
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: 1,
          totalPages: 1,
          totalCount: 0,
          pageSize: Math.max(0, 1),
          isLoading: true,
          onPageChange: () => {},
          labels: {
            empty: t("empty"),
            showing: (_start, _end, total) => t("showing", { count: total }),
          },
        }}
        columns={[
          { key: "area", header: t("columnArea"), className: "w-[24%]", cell: (area) => area.label },
          { key: "summary", header: t("columnSummary"), className: "w-[47%]", cell: (area) => area.summary },
          { key: "state", header: t("columnState"), className: "w-[29%]", cell: (area) => area.state },
        ]}
      />
    </>
  );
}
