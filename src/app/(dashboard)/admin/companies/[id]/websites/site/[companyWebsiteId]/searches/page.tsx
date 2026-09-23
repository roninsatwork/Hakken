"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowRight, ArrowUp, Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { ResultsSwitcher } from "../ResultsSwitcher";
import { SEARCH_TONE } from "../siteView";

/**
 * How this site is doing on the Google searches chosen for it.
 *
 * Read only. The searches are the website's own list, shared by every company
 * watching it, so they are added and removed on the website record; this is
 * where one company sees how its site does on them, from its own place. The
 * rows arrive judged and sorted by what needs attention, dropping first.
 */
export default function CompanySiteSearchesPage() {
  const t = useTranslations("admin.siteView.searches");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const rows = useQuery(api.websiteClientView.listTrackedSearches, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const isLoading = rows === undefined;
  const empty = searchTerm ? t("noMatch") : t("empty");

  return (
    <div className="flex w-full flex-col gap-5">
      <ResultsSwitcher active="searches" />
      <PageHeader
        icon={<Search className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={header ? t("subtitle", { place: header.placeLabel }) : undefined}
      />

      <DataTable
        rows={isLoading ? undefined : rows.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[640px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Search className="h-8 w-8 text-muted/30" />, label: empty }}
        footer={{
          mode: "paged",
          page,
          totalPages: rows?.totalPages ?? 1,
          totalCount: rows?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty },
        }}
        columns={[
          {
            key: "search",
            header: t("searchColumn"),
            cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span>,
          },
          {
            key: "position",
            header: t("positionColumn"),
            cell: (row) => {
              if (row.lastCheckedDay === null) return <span className="text-[12px] text-muted">{t("notCheckedYet")}</span>;
              if (row.lastPosition === null) return <span className="text-[12px] text-muted">{t("notOnPage")}</span>;
              const change = row.previousPosition === null ? 0 : row.previousPosition - row.lastPosition;
              return (
                <span className="flex items-center gap-1.5 font-mono text-[13px] text-foreground">
                  {row.lastPosition}
                  {change > 0 ? (
                    <span className="flex items-center text-[11px] text-success">
                      <ArrowUp className="h-3 w-3" aria-label={t("up")} />{change}
                    </span>
                  ) : change < 0 ? (
                    <span className="flex items-center text-[11px] text-destructive">
                      <ArrowDown className="h-3 w-3" aria-label={t("down")} />{-change}
                    </span>
                  ) : null}
                </span>
              );
            },
          },
          {
            key: "verdict",
            header: t("verdictColumn"),
            cell: (row) => (
              row.isActive
                ? <StatusPill tone={SEARCH_TONE[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusPill>
                : <StatusPill tone="neutral">{t("paused")}</StatusPill>
            ),
          },
        ]}
      />

      {header ? (
        <Link
          href={`/admin/websites/${header.websiteId}/keywords`}
          className="flex w-fit items-center gap-1.5 text-[13px] text-secondary hover:text-brand"
        >
          {t("edit")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
