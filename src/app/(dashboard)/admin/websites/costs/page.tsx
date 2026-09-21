"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";

/**
 * What every client costs to serve, most expensive first.
 *
 * Company-led and rolled up, which is the order the question is actually asked
 * in. "Am I charging enough" is really "who are my most expensive clients, and
 * what do they pay me", so the list is companies and the platform total sits
 * above it rather than the other way round.
 *
 * **Sorted by standalone, not by paid.** One host is fetched once for everyone
 * watching it, so a client whose rival happens to trigger the pulls costs
 * almost nothing right up until that rival leaves. Standalone is what they
 * would cost alone, and it is the figure a price has to clear.
 *
 * Read from the day rollups, never from the pull table.
 */
export default function SeoCostsPage() {
  const t = useTranslations("admin.seoCosts");
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const costs = useQuery(api.seoCollectionReports.listCompanyCosts, {});

  const matching = (costs?.companies ?? []).filter((row) =>
    row.companyName.toLowerCase().includes(debouncedSearch.trim().toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(matching.length / TABLE_PAGE_SIZE));
  const visible = matching.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        divider
        icon={<Coins className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("companiesTitle")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">
          {costs
            ? t("platformTotal", {
              paid: costs.paidUsd.toFixed(2),
              saved: costs.reusedValueUsd.toFixed(2),
            })
            : t("loading")}
        </p>
      </div>

      <DataTable
        rows={costs === undefined ? undefined : visible}
        rowKey={(row) => row.companyId}
        minWidthClassName="min-w-[760px]"
        onRowClick={(row) =>
          router.push(`/admin/companies/${row.companyId}/websites/data`)}
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Coins className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching.length,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: costs === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "company",
            header: t("companyColumn"),
            cell: (row) => (
              <span className="text-[13px] font-medium text-foreground">{row.companyName}</span>
            ),
          },
          {
            key: "standalone",
            header: t("standaloneColumn"),
            align: "right",
            cell: (row) => (
              // The figure a price has to clear, so it reads first and loudest.
              <span className="font-mono text-[13px] text-foreground">
                ${row.standaloneUsd.toFixed(2)}
              </span>
            ),
          },
          {
            key: "paid",
            header: t("paidColumn"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[12px] text-secondary">
                ${row.paidUsd.toFixed(2)}
              </span>
            ),
          },
          {
            key: "saving",
            header: t("savingColumn"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[12px] text-success">
                ${row.reusedValueUsd.toFixed(2)}
              </span>
            ),
          },
          {
            key: "pulls",
            header: t("pullsColumn"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[12px] text-muted">{row.pulls}</span>
            ),
          },
        ]}
      />
    </div>
  );
}
