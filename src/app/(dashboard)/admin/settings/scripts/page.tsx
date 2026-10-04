"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/src/lib/dates";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileWarning,
  SearchX,
  Wrench,
} from "lucide-react";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { toneForStatus } from "@/src/ui/components/screens/statusTone";
import { useLocale, useTranslations } from "next-intl";

type ScriptRunStatus = "RUNNING" | "SUCCESS" | "FAILED";

/** Returns `undefined` when nothing has run — the screen says "Never" in the reader's language. */
function formatRunDate(timestamp: number | undefined, locale: string) {
  if (!timestamp) return undefined;
  return formatDateTime(timestamp, {
    locale,
    options: { dateStyle: "medium", timeStyle: "short" },
  });
}

function ScriptRunLabel({ status }: { status?: ScriptRunStatus }) {
  const t = useTranslations("admin.settings.scripts");
  if (!status) {
    return <StatusLabel tone="neutral">{t("notRun")}</StatusLabel>;
  }

  return (
    <StatusLabel tone={toneForStatus(status)} icon={status === "RUNNING" ? "working" : undefined}>
      {status === "SUCCESS" ? t("statusSuccess") : status === "FAILED" ? t("statusFailed") : t("statusRunning")}
    </StatusLabel>
  );
}

/** Unknown risk levels take the most cautious tone rather than the least. */
function ScriptRiskLabel({ riskLevel }: { riskLevel: string }) {
  const t = useTranslations("admin.settings.scripts");
  const tone = riskLevel === "LOW" || riskLevel === "MEDIUM" ? toneForStatus(riskLevel) : "danger";
  return (
    <StatusLabel tone={tone}>
      {riskLevel === "LOW" ? t("riskLow") : riskLevel === "MEDIUM" ? t("riskMedium") : riskLevel === "HIGH" ? t("riskHigh") : riskLevel}
    </StatusLabel>
  );
}

export default function MaintenanceScriptsPage() {
  const t = useTranslations("admin.settings.scripts");
  const locale = useLocale();
  const router = useRouter();
  const scripts = useQuery(api.maintenanceScripts.list);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const filteredScripts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!scripts) return [];
    if (!term) return scripts;

    return scripts.filter((script) => {
      const searchable = [
        script.name,
        script.category,
        script.riskLevel,
        script.shortDescription,
      ].join(" ").toLowerCase();

      return searchable.includes(term);
    });
  }, [scripts, searchTerm]);

  const pageSize = TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredScripts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleScripts = filteredScripts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const isLoading = scripts === undefined;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Wrench className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex items-start gap-4 p-4 bg-foreground/[0.015] border border-border-dim/50 rounded-[12px] text-secondary">
        <FileWarning className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted" />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[13px] font-medium text-foreground tracking-wide">{t("allowlistedTitle")}</h2>
          <p className="text-[12.5px] leading-relaxed text-secondary opacity-80 tracking-wide">
            {t("allowlistedBody")}
          </p>
        </div>
      </div>

      <DataTable
        rows={isLoading ? undefined : visibleScripts}
        rowKey={(script) => script.id}
        onRowClick={(script) => router.push(`/admin/settings/scripts/${script.id}`)}
        search={{
          value: searchTerm,
          onChange: handleSearch,
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <SearchX className="w-8 h-8 text-muted/30" />,
          label: t("noMatch"),
        }}
        footer={{
          mode: "paged",
          page: safePage,
          totalPages,
          totalCount: filteredScripts.length,
          pageSize,
          isLoading,
          onPageChange: setPage,
          labels: {
            empty: t("footerEmpty"),
            showing: (start, end, total) => t("showing", { start, end, total }),
          },
        }}
        columns={[
          {
            key: "name",
            header: t("columnName"),
            cell: (script) => (
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-foreground">{script.name}</span>
                <span className="text-[12px] text-secondary max-w-[360px]">{script.shortDescription}</span>
              </div>
            ),
          },
          {
            key: "category",
            header: t("columnCategory"),
            cell: (script) => <span className="text-[13px] text-secondary">{script.category}</span>,
          },
          { key: "risk", header: t("columnRisk"), cell: (script) => <ScriptRiskLabel riskLevel={script.riskLevel} /> },
          { key: "status", header: t("columnStatus"), cell: (script) => <ScriptRunLabel status={script.lastRun?.status} /> },
          {
            key: "lastRun",
            header: t("columnLastRun"),
            cell: (script) => (
              <span className="text-[12px] text-secondary">
                {formatRunDate(script.lastRun?.completedAt ?? script.lastRun?.startedAt, locale) ?? t("never")}
              </span>
            ),
          },
          {
            key: "lastRunBy",
            header: t("columnLastRunBy"),
            cell: (script) => (
              <span className="text-[12px] text-secondary">{script.lastRun?.actorName ?? t("nobody")}</span>
            ),
          },
          {
            key: "open",
            header: t("columnOpen"),
            align: "right",
            cell: (script) => (
              <RowIconButton
                label={t("openAria", { name: script.name })}
                onClick={() => router.push(`/admin/settings/scripts/${script.id}`)}
              >
                <ArrowRight className="w-4 h-4" />
              </RowIconButton>
            ),
          },
        ]}
      />
    </div>
  );
}
