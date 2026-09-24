"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Stethoscope } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { RecordTableTitle } from "../../../_components/SiteRecordParts";
import { formatDay } from "../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteId } from "../../../_components/useSite";
import { useSitePagedRows } from "../../../_components/useSitePagedTable";

const SEVERITY_TONES: Record<string, StatusTone> = { ERROR: "danger", WARNING: "warning", NOTICE: "neutral" };

/**
 * One Site audit problem's own screen (Site › Site audit › a problem): the
 * pages of the newest crawl with it, each opening its page's screen — and for
 * broken links, where each broken link points.
 *
 * This was the one modal in the Sites section. Anthony, 2026-09-24: "I don't
 * want any modals that are clickable from the tables or anywhere in this
 * section. These are all new screens with a back button." The crawl's page
 * detail is fetched free after each crawl; until the first, this says so.
 */
export default function SiteAuditProblemPage() {
  const t = useTranslations("sites.problemRecord");
  const ta = useTranslations("sites.audit");
  const router = useRouter();
  const siteId = useSiteId();
  const back = useRecordBack("problem");
  const recordHref = useSiteRecordHref(siteId);
  const check = useRecordKey("problem");
  const audit = useQuery(api.siteCrawl.siteAudit, check ? { siteId } : "skip");
  const pages = useQuery(api.siteCrawlDetail.crawlProblemPages, check ? { siteId, check } : "skip");
  const table = useSitePagedRows(pages ?? [], check);

  if (!check) {
    return <DetailHeader back={back} icon={<Stethoscope className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }

  const label = ta.has(`checks.${check}`) ? ta(`checks.${check}`) : check.replace(/_/g, " ");
  const issue = audit?.issues.find((entry) => entry.check === check) ?? null;
  const brokenLinks = check === "broken_links";

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<Stethoscope className="h-6 w-6 text-brand" />}
        title={label}
        description={t("description")}
        pills={issue ? (
          <>
            <StatusPill tone={SEVERITY_TONES[issue.severity] ?? "neutral"}>{ta(`severities.${issue.severity}`)}</StatusPill>
            {audit ? <span className="text-[12px] text-secondary">{ta("asOf", { day: formatDay(audit.day) })}</span> : null}
          </>
        ) : undefined}
      />

      <DataTable
        rows={pages === undefined ? undefined : table.pageRows}
        rowKey={(row) => row.url}
        cardHeader={pages && pages.length > 0 ? <RecordTableTitle title={ta("problemPages.count", { count: pages.length })} /> : undefined}
        onRowClick={(row) => router.push(recordHref({ kind: "page", page: row.page }))}
        empty={{ icon: <Stethoscope className="h-8 w-8 text-muted/30" />, label: ta("problemPages.none") }}
        footer={{
          mode: "paged",
          page: table.page,
          totalPages: table.totalPages,
          totalCount: table.loadedCount,
          pageSize: table.pageSize,
          isLoading: pages === undefined,
          onPageChange: table.goToPage,
        }}
        columns={[
          {
            key: "page",
            header: t("columns.page"),
            cell: (row) => <RecordLinkCell href={recordHref({ kind: "page", page: row.page })} className="break-all text-[12px] text-info">{row.page || "/"}</RecordLinkCell>,
          },
          { key: "answered", header: t("columns.answered"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.statusCode ?? "–"}</span> },
          ...(brokenLinks
            ? [{
              key: "broken",
              header: t("columns.brokenLinks"),
              cell: (row: NonNullable<typeof pages>[number]) => (
                <span className="flex flex-col gap-0.5">
                  {row.brokenLinks.map((link) => (
                    <span key={link.to} className="break-all text-[12px] text-muted">{ta("problemPages.brokenTo", { to: link.to, code: link.statusCode ?? "–" })}</span>
                  ))}
                </span>
              ),
            }]
            : []),
        ]}
      />
    </div>
  );
}
