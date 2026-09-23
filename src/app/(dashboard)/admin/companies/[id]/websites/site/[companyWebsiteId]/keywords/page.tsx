"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { ResultsSwitcher } from "../ResultsSwitcher";

/**
 * What this website ranks for.
 *
 * The pipeline has collected this since it shipped and it has never been on a
 * screen. Best position first, because what a site ranks well for is what
 * somebody opens this page to see.
 *
 * The intent beside each search is judged once per phrase and shared by every
 * client in the same trade, so the answer is bought once however many people
 * rank for it. Unjudged says so rather than guessing, which is what it shows
 * while the Decision is switched off.
 */
export default function WebsiteKeywordsPage() {
  const t = useTranslations("admin.websiteKeywords");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  // Shared with the layout's own subscription; it says whether this is one of
  // the company's own sites, which have two other results views beside this.
  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const keywords = useQuery(api.seoKeywordReports.listWebsiteKeywords, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const intentLabel = (intent: string) => {
    if (intent === "BUYING") return t("intents.BUYING");
    if (intent === "RESEARCHING") return t("intents.RESEARCHING");
    if (intent === "BRANDED") return t("intents.BRANDED");
    if (intent === "IRRELEVANT") return t("intents.IRRELEVANT");
    return t("intents.OTHER");
  };

  return (
    <div className="flex w-full flex-col gap-5">
      {header?.relationship === "OWNED" ? <ResultsSwitcher active="rankings" /> : null}
      <PageHeader
        icon={<Search className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={header ? t("subtitlePlace", { place: header.placeLabel }) : t("subtitle")}
      />

      <DataTable
        rows={keywords === undefined ? undefined : keywords.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[860px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Search className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: keywords?.totalPages ?? 1,
          totalCount: keywords?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: keywords === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "keyword",
            header: t("keywordColumn"),
            cell: (row) => (
              <span className="text-[13px] text-foreground">{row.keyword}</span>
            ),
          },
          {
            key: "intent",
            header: t("intentColumn"),
            cell: (row) => (
              row.intent === null ? (
                <span className="text-[12px] text-muted">{t("unjudged")}</span>
              ) : (
                <StatusPill tone={row.intent === "BUYING" ? "success" : "neutral"}>
                  {intentLabel(row.intent)}
                </StatusPill>
              )
            ),
          },
          {
            key: "position",
            header: t("positionColumn"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[13px] text-foreground">
                {/*
                  Not ranking is a different fact from ranking last, so it is
                  shown as nothing rather than as a large number.
                */}
                {row.position === null ? "—" : row.position}
              </span>
            ),
          },
          {
            // When it was last checked, in its own column on every results
            // table, so no number is read without its age (Anthony, 2026-09-23).
            key: "lastChecked",
            header: t("lastCheckedColumn"),
            cell: (row) => <span className="text-[12px] text-secondary">{row.day}</span>,
          },
          {
            key: "volume",
            header: t("volumeColumn"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[12px] text-secondary">
                {row.searchVolume === null ? "—" : row.searchVolume.toLocaleString()}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
