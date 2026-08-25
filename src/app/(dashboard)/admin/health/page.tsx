"use client";

import { lazy, Suspense, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { HeartPulse } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";
import type {
  ConnectionHealth,
  HealthRunTableProps,
  JobHealth,
  RunObservatory,
  SystemHealth,
} from "./HealthResults";

const loadHealthResults = () => import("./HealthResults");
const HealthAttention = lazy(() =>
  loadHealthResults().then((module) => ({ default: module.HealthAttention })),
);
const RunObservatoryResults = lazy(() =>
  loadHealthResults().then((module) => ({ default: module.RunObservatoryResults })),
);

export default function HealthPage() {
  const t = useTranslations("admin.health");
  const health = useQuery(api.systemHealth.getSystemHealthForAdmin, { daysBack: 7 }) as SystemHealth | undefined;
  const runs = useQuery(api.agentRuns.getRunObservatory, { lookbackDays: 7 }) as RunObservatory | undefined;
  const connections = useQuery(api.connectionProbes.listConnections, {}) as ConnectionHealth[] | undefined;
  const jobs = useQuery(api.jobLedger.listJobRuns, {}) as JobHealth[] | undefined;
  const [runSearch, setRunSearch] = useState("");
  const [runPage, setRunPage] = useState(1);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        divider
        icon={<HeartPulse className="h-6 w-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
      />

      {health ? (
        <Suspense fallback={null}>
          <HealthAttention health={health} connections={connections} jobs={jobs} />
        </Suspense>
      ) : null}

      <Suspense
        fallback={(
          <RunObservatoryLoading
            search={runSearch}
            onSearchChange={setRunSearch}
            page={runPage}
            onPageChange={setRunPage}
          />
        )}
      >
        {runs === undefined ? (
          <RunObservatoryLoading
            search={runSearch}
            onSearchChange={setRunSearch}
            page={runPage}
            onPageChange={setRunPage}
          />
        ) : (
          <RunObservatoryResults
            runs={runs}
            search={runSearch}
            onSearchChange={setRunSearch}
            page={runPage}
            onPageChange={setRunPage}
            TableComponent={HealthRunTable}
          />
        )}
      </Suspense>
    </div>
  );
}

function RunObservatoryLoading({
  search,
  onSearchChange,
  page,
  onPageChange,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("admin.health");
  const emptyPage = paginateItems<RunObservatory["recentRuns"][number]>([], page, TABLE_PAGE_SIZE);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{t("lastDaysTitle")}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-secondary">{t("countingRuns")}</p>
      </div>

      <HealthRunTable
        rows={undefined}
        search={search}
        onSearchChange={onSearchChange}
        page={page}
        totalPages={emptyPage.totalPages}
        totalCount={emptyPage.totalItems}
        pageSize={emptyPage.pageSize}
        isLoading={true}
        onPageChange={onPageChange}
        columns={[
          { key: "what", header: t("columnWhat"), cell: () => null },
          { key: "agent", header: t("columnAgent"), cell: () => null },
          { key: "result", header: t("columnResult"), cell: () => null },
          { key: "took", header: t("columnTook"), cell: () => null },
          { key: "cost", header: t("columnCost"), cell: () => null },
          { key: "when", header: t("columnWhen"), cell: () => null },
        ]}
      />
    </section>
  );
}

function HealthRunTable({
  rows,
  columns,
  search,
  onSearchChange,
  page,
  totalPages,
  totalCount,
  pageSize,
  isLoading,
  onPageChange,
}: HealthRunTableProps) {
  const t = useTranslations("admin.health");

  return (
    <DataTable
      rows={rows}
      rowKey={(run) => run.runId}
      minWidthClassName="min-w-[820px]"
      search={{ value: search, onChange: onSearchChange, placeholder: t("searchPlaceholder") }}
      footer={{
        mode: "paged",
        page,
        totalPages,
        totalCount,
        pageSize,
        isLoading,
        onPageChange,
        labels: { empty: t("emptyRuns") },
      }}
      empty={{ icon: <HeartPulse className="h-8 w-8 text-muted/30" />, label: t("emptyRuns") }}
      columns={columns}
    />
  );
}
