"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { PositionCell, RecordLinkCell } from "../../../../_components/SiteCells";
import { formatNumber } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { useSiteId } from "../../../../_components/useSite";
import { useSitePagedTable } from "../../../../_components/useSitePagedTable";

/** The features a site can be found in, beside its ordinary ranking. */
const FEATURES = ["ai_overview_reference", "featured_snippet", "local_pack"] as const;
type Feature = (typeof FEATURES)[number];

/**
 * The searches behind one of Search features' figures (Google results ›
 * Search features › a feature): every search in the site's keyword list where
 * Google shows it in the AI Overview, the answer box or the map of local
 * businesses, with where it ranks in the ordinary results below.
 *
 * A figure used to be a dead end (docs/plans/active/sites-ux-updates-plan.md
 * §2, finding 6: the rows were kept and nothing listed them). Each search
 * opens its own screen.
 */
export default function SiteFeatureKeywordsPage() {
  const t = useTranslations("sites.featureRecord");
  const router = useRouter();
  const siteId = useSiteId();
  const back = useRecordBack("feature");
  const recordHref = useSiteRecordHref(siteId);
  const asked = useRecordKey("feature");
  const feature = (FEATURES as readonly string[]).includes(asked) ? (asked as Feature) : null;
  const table = useSitePagedTable(api.siteRecords.featureKeywords, feature ? { siteId, feature } : "skip");

  if (!feature) {
    return <DetailHeader back={back} icon={<Sparkles className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader back={back} icon={<Sparkles className="h-6 w-6 text-brand" />} title={t(`titles.${feature}`)} description={t("description")} />

      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: table.page,
          totalPages: table.totalPages,
          totalCount: table.loadedCount,
          pageSize: table.pageSize,
          isLoading: table.isBusy,
          onPageChange: table.goToPage,
        }}
        columns={[
          {
            key: "keyword",
            header: t("columns.keyword"),
            cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell>,
          },
          { key: "position", header: t("columns.position"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.position ?? "–"}</span> },
          { key: "organic", header: t("columns.organic"), align: "right", cell: (row) => <PositionCell position={row.organicPosition} /> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
          {
            key: "page",
            header: t("columns.page"),
            cell: (row) => row.page
              ? <RecordLinkCell href={recordHref({ kind: "page", page: row.page })} className="break-all text-[12px] text-info">{row.page}</RecordLinkCell>
              : <span className="text-muted">–</span>,
          },
        ]}
      />
    </div>
  );
}
