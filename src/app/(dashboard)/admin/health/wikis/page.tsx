"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { BookOpenCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { paginateItems } from "@/src/ui/components/screens/pagination";
import { CUT_COLUMN, RecordLinkCell } from "@/src/app/(dashboard)/app/sites/_components/SiteCells";
import { PLATFORM_WIKI_PARAM } from "./platformWiki";

type WikiState = "OK" | "FAILED" | "LATE" | "RUNNING" | "NOT_YET";

const WIKI_TONE: Record<WikiState, StatusTone> = {
  OK: "success",
  FAILED: "danger",
  LATE: "warning",
  RUNNING: "info",
  NOT_YET: "neutral",
};

/**
 * Health, Wiki check-ups: every wiki's last nightly check-up at a glance
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S8; Sonae's `admin/health/wikis`,
 * rebuilt in Hakken's look). One whose check-up failed or ran late comes
 * first, as `listCheckupHealth` sorts it, so it's never hidden behind one
 * that's fine. A row opens that wiki's Check-up, with "Check this wiki now".
 * The summary is written by code in English and shown as it is.
 */
export default function HealthWikisPage() {
  const t = useTranslations("admin.health.wikiCheckups");
  const appLocale = useLocale();
  // Day first for English, to the minute: "21 Nov, 03:12", never seconds.
  const locale = appLocale === "en" ? "en-GB" : appLocale;
  const router = useRouter();
  const wikis = useQuery(api.wikiCheckup.listCheckupHealth, {});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // The backend names the platform's wiki in English; the screen says it in the reader's words.
  const named = (wikis ?? []).map((row) => ({ ...row, name: row.companyId ? row.name : t("platformWiki") }));
  const needle = search.trim().toLowerCase();
  const matching = needle ? named.filter((row) => row.name.toLowerCase().includes(needle)) : named;
  const paged = paginateItems(matching, page);
  const hrefFor = (row: (typeof named)[number]) => `/admin/health/wikis/${row.companyId ?? PLATFORM_WIKI_PARAM}`;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        divider
        icon={<BookOpenCheck className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <DataTable
        rows={wikis === undefined ? undefined : paged.items}
        rowKey={(row) => row.companyId ?? PLATFORM_WIKI_PARAM}
        search={{
          value: search,
          onChange: (next) => {
            setSearch(next);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        onRowClick={(row) => router.push(hrefFor(row))}
        empty={{ icon: <BookOpenCheck className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: wikis === undefined,
          onPageChange: setPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "wiki",
            header: t("columnWiki"),
            className: `min-w-[160px] ${CUT_COLUMN.first}`,
            cell: (row) => (
              <RecordLinkCell href={hrefFor(row)} cut className="text-[13px] font-medium text-foreground">
                {row.name}
              </RecordLinkCell>
            ),
          },
          {
            key: "state",
            header: t("columnState"),
            className: "whitespace-nowrap",
            cell: (row) => <StatusLabel tone={WIKI_TONE[row.state]}>{t(`states.${row.state}`)}</StatusLabel>,
          },
          {
            key: "when",
            header: t("columnWhen"),
            className: "whitespace-nowrap",
            cell: (row) => (
              <span className="text-[13px] tabular-nums text-secondary">
                {row.lastFinishedAt ? formatDateTime(row.lastFinishedAt, { locale, options: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } }) : t("never")}
              </span>
            ),
          },
          {
            key: "result",
            header: t("columnResult"),
            className: CUT_COLUMN.second,
            cell: (row) => {
              const said = row.error ?? row.summary ?? "";
              return (
                <span className="block truncate text-[13px] text-secondary" title={said || undefined}>
                  {said}
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
