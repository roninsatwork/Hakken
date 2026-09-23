"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { useEngineLabel } from "@/src/app/(dashboard)/admin/_components/EngineChoice";
import { ResultsSwitcher } from "../ResultsSwitcher";

/**
 * Where this website gets named inside AI answers.
 *
 * One row per answer: the question, the engine, the day, and whether this site
 * was named and how. Nobody else: this screen is about this website, and other
 * businesses have their own sections (Anthony, 2026-09-23).
 *
 * Its own page under the website rather than a third table on the site's
 * detail. The detail is settings — competitors, place, questions — and this is
 * results; putting results under a settings form pushes the form below the
 * fold the moment there are any.
 *
 * Read through the company's own hold on the website, never from the shared
 * citation table outward. That direction is what keeps one client's rivals
 * off another client's screen.
 */
export default function WebsiteCitationsPage() {
  const t = useTranslations("admin.websiteCitations");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const citations = useQuery(api.seoCitationReports.listCompanyWebsiteCitations, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  // The engine names live in one component; this screen reads them from it.
  const engineLabel = useEngineLabel();

  return (
    <div className="flex w-full flex-col gap-5">
      <ResultsSwitcher active="answers" />
      <PageHeader
        icon={<Sparkles className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <DataTable
        rows={citations === undefined ? undefined : citations.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[760px]"
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
          totalPages: citations?.totalPages ?? 1,
          totalCount: citations?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: citations === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "prompt",
            header: t("promptColumn"),
            cell: (row) => (
              <span className="text-[13px] text-foreground">{row.prompt}</span>
            ),
          },
          {
            key: "engine",
            header: t("engineColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{engineLabel(row.engine)}</span>
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
            key: "us",
            header: t("usColumn"),
            cell: (row) => (
              row.status === "FAILED" ? (
                // Not "waiting": nothing is coming. The reason sits on the
                // collection screen; here the client only needs to know the
                // engine could not be asked this time.
                <StatusPill tone="danger">{t("couldNotAsk")}</StatusPill>
              ) : row.status !== "READY" ? (
                <StatusPill tone="neutral">{t("waiting")}</StatusPill>
              ) : !row.named ? (
                <StatusPill tone="neutral">{t("notNamed")}</StatusPill>
              ) : (
                <div className="flex flex-col gap-1">
                  {/*
                    Being named is not the same as being recommended. An answer
                    that warns against a business still names it, and without
                    the stance that reads as a win.
                  */}
                  <StatusPill tone={row.ourStance === "WARNED_AGAINST" ? "danger" : "success"}>
                    {row.ourStance === "RECOMMENDED"
                      ? t("recommended")
                      : row.ourStance === "WARNED_AGAINST"
                        ? t("warnedAgainst")
                        : t("named")}
                  </StatusPill>
                  {/*
                    A citation under the wrong name is a different fact from
                    one under the right name, and the one a client can act on.
                  */}
                  {row.ourVariantKind === "MISSPELLING" ? (
                    <span className="text-[11px] text-warning">{t("misspelled")}</span>
                  ) : null}
                </div>
              )
            ),
          },
        ]}
      />
    </div>
  );
}
