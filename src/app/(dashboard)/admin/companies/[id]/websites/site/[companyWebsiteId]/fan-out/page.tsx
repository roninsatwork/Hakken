"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";

/**
 * What the AI engines search for when asked this website's questions.
 *
 * An engine does not answer the question it is given. It expands it into
 * related searches and writes from what those return, so the fan-out is the
 * surface a site has to be visible on rather than the one question we asked.
 * The engines have been sending it in every answer we buy since the citations
 * pipeline shipped; it was being discarded with the rest of the payload.
 *
 * Most persistent first, because a search an engine keeps returning to is the
 * one worth having a page for. The intent beside it is the same judgment and
 * the same store the rankings screen uses, so a phrase met on both screens is
 * judged once and paid for once.
 */
export default function WebsiteFanOutPage() {
  const t = useTranslations("admin.websiteFanOut");
  const params = useParams();
  const companyId = params.id as string;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const website = useQuery(api.websites.getCompanyWebsiteById, { id: companyWebsiteId });
  const queries = useQuery(api.seoFanOutReports.listWebsiteFanOutQueries, {
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

  if (website === null) {
    return <p className="py-12 text-center text-[13px] text-muted">{t("notFound")}</p>;
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{
          label: t("back"),
          href: `/admin/companies/${companyId}/websites/site/${companyWebsiteId}`,
        }}
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={website?.displayHost ?? ""}
        description={t("subtitle")}
      />

      <DataTable
        rows={queries === undefined ? undefined : queries.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[820px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Sparkles className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: queries?.totalPages ?? 1,
          totalCount: queries?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: queries === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "query",
            header: t("queryColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.queryText}</span>
                {/* The question that produced it, so the row is readable on its own. */}
                <span className="text-[11px] text-muted">{row.prompt}</span>
              </div>
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
            key: "engines",
            header: t("enginesColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{row.engines.join(", ")}</span>
            ),
          },
          {
            key: "times",
            header: t("timesColumn"),
            align: "right",
            cell: (row) => (
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono text-[13px] text-foreground">{row.timesSeen}</span>
                <span className="text-[11px] text-muted">{row.lastSeenDay}</span>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
