"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { Button } from "@/src/ui/components/screens/Button";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Database, Play, Settings2, Square, ToggleLeft, ToggleRight } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import {
  purgePipelineKeys,
  type PurgeConfigMap,
  type PurgePipelineConfig,
  type PurgePipelineKey,
} from "./types";

const loadRetentionRuleDialogs = () => import("./RetentionRuleDialogs");
const RetentionRuleDialogs = dynamic(() =>
  loadRetentionRuleDialogs().then((module) => module.RetentionRuleDialogs)
);

function getPurgeCutoffDate(retentionDays: number): string {
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toLocaleDateString();
}

export function RetentionRulesSection() {
  const t = useTranslations('admin.settings');
  const locale = useLocale();
  const action = useAdminAction({ scope: "admin-retention-rules" });

  const getOrdinalSuffix = (day: number) => {
    if (locale === "it") return `${day}°`;
    const j = day % 10, k = day % 100;
    if (j === 1 && k !== 11) return `${day}st`;
    if (j === 2 && k !== 12) return `${day}nd`;
    if (j === 3 && k !== 13) return `${day}rd`;
    return `${day}th`;
  };

  // READ_ONLY oversight roles can see everything here but run nothing; the
  // mutations would refuse them anyway, so the buttons must not pretend.
  const canWrite = useCanWriteHere();
  const purgeConfigs = useQuery(api.purges.getPipelineConfig);
  const previewCounts = useQuery(api.purges.getPurgePreviewCounts);
  const updatePurgeConfigs = useMutation(api.purges.updatePipelineConfig);
  const manualPurgeMutation = useMutation(api.purges.runManualPurge);
  const cancelPurgeMutation = useMutation(api.purges.cancelPurge);
  const runningPurges = useQuery(api.purges.getRunningPurges);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);

  const filteredKeys = purgePipelineKeys.filter((key) => {
    const configs = (purgeConfigs || {}) as Partial<PurgeConfigMap>;
    const enabled = Boolean(configs[key]?.enabled);
    if (statusFilter === "enabled" && !enabled) return false;
    if (statusFilter === "disabled" && enabled) return false;
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return true;
    const haystack = `${t(`purges.categories.${key}.title`)} ${t(`purges.categories.${key}.description`)}`.toLowerCase();
    return haystack.includes(needle);
  });

  const pageStart = (page - 1) * TABLE_PAGE_SIZE;
  const pageKeys = filteredKeys.slice(pageStart, pageStart + TABLE_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / TABLE_PAGE_SIZE));

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [dialogsRequested, setDialogsRequested] = useState(false);
  const [configModalPipeline, setConfigModalPipeline] = useState<PurgePipelineKey | null>(null);
  const [configModalData, setConfigModalData] = useState<PurgePipelineConfig>({});

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalPipeline, setConfirmModalPipeline] = useState<PurgePipelineKey | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelModalHistoryId, setCancelModalHistoryId] = useState<Id<"purgeHistory"> | null>(null);
  const [cancelModalPipeline, setCancelModalPipeline] = useState<PurgePipelineKey | null>(null);
  const [isCancelRunning, setIsCancelRunning] = useState(false);

  const [isManualRunning, setIsManualRunning] = useState(false);

  const configs = (purgeConfigs || {}) as Partial<PurgeConfigMap>;

  const prepareRetentionRuleDialogs = () => {
    setDialogsRequested(true);
    void loadRetentionRuleDialogs();
  };

  const columns: DataTableColumn<PurgePipelineKey>[] = [
    {
      key: "category",
      header: t('purges.table.category'),
      cell: (key) => (
        <span className="text-[13px] font-medium text-foreground">{t(`purges.categories.${key}.title`)}</span>
      ),
    },
    {
      key: "description",
      header: t('purges.table.description'),
      className: "max-w-md",
      cell: (key) => (
        <span className="text-[12px] text-secondary leading-snug inline-block">{t(`purges.categories.${key}.description`)}</span>
      ),
    },
    {
      key: "retention",
      header: t('purges.table.retention'),
      className: "w-[190px]",
      cell: (key) => {
        const conf = configs[key] || {};
        return (
          <>
            <span className="text-[13px] font-mono font-medium text-foreground">{t('purges.modals.config.days', { days: conf.retentionDays || 0 })}</span>
            {previewCounts?.[key] && (
              <span className="block text-[11px] text-muted mt-0.5">
                {previewCounts[key].count === 0
                  ? t('purges.table.previewNone')
                  : previewCounts[key].capped
                    ? t('purges.table.previewCapped', { count: previewCounts[key].count.toLocaleString() })
                    : t('purges.table.previewNow', { count: previewCounts[key].count.toLocaleString() })}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: "interval",
      header: t('purges.table.interval'),
      className: "w-[190px]",
      cell: (key) => {
        const conf = configs[key] || {};
        return (
          <>
            <span className="text-[13px] font-mono font-medium text-foreground">
              {conf.interval === "Weekly" ? (
                `${t('purges.intervals.Weekly')} (${t(`purges.daysOfWeek.${conf.dayOfWeek !== undefined ? conf.dayOfWeek : 0}`)})`
              ) : conf.interval === "Monthly" ? (
                `${t('purges.intervals.Monthly')} (${getOrdinalSuffix(conf.dayOfMonth || 1)})`
              ) : (
                t(`purges.intervals.${conf.interval || "Daily"}`)
              )}
            </span>
            {conf.interval !== "Hourly" && (
              <span className="text-[11px] text-muted ml-2">@{String(conf.hourUtc || 0).padStart(2, '0')}:00 UTC</span>
            )}
          </>
        );
      },
    },
    {
      key: "status",
      header: t('purges.table.status'),
      className: "w-[120px]",
      cell: (key) => {
        const isEnabled = configs[key]?.enabled;
        return (
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium tracking-wide uppercase ${isEnabled ? 'bg-brand/10 text-brand' : 'bg-foreground/5 text-muted'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-brand' : 'bg-muted'}`} />
            {isEnabled ? t('purges.modals.config.enabled') : t('purges.modals.config.disabled')}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: t('purges.table.actions'),
      className: "w-[110px]",
      align: "right",
      cell: (key) => {
        const conf = configs[key] || {};
        const runningLog = runningPurges?.find((log) => log.pipelineKey === key);
        return canWrite ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="icon"
              onClick={() => {
                prepareRetentionRuleDialogs();
                setConfigModalPipeline(key);
                setConfigModalData({ ...conf });
                setIsConfigModalOpen(true);
              }}
              className="rounded-[6px] p-1.5"
              title={t('purges.table.configure')}
            >
              <Settings2 className="w-4 h-4" />
            </Button>
            {runningLog ? (
              <Button
                variant="icon"
                onClick={() => {
                  prepareRetentionRuleDialogs();
                  setCancelModalHistoryId(runningLog._id);
                  setCancelModalPipeline(key);
                  setIsCancelModalOpen(true);
                }}
                className="rounded-[6px] p-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 animate-pulse"
                title={t('purges.table.stop')}
              >
                <Square className="w-4 h-4 fill-destructive" />
              </Button>
            ) : (
              <Button
                variant="icon"
                onClick={() => {
                  prepareRetentionRuleDialogs();
                  setConfirmModalPipeline(key);
                  setIsConfirmModalOpen(true);
                }}
                disabled={isManualRunning}
                className="rounded-[6px] p-1.5 hover:text-brand hover:bg-brand/5 disabled:opacity-50"
                title={t('purges.table.runNow')}
              >
                <Play className="w-4 h-4" />
              </Button>
            )}
          </div>
        ) : null;
      },
    },
  ];

  return (
    <>
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 ml-2">
              <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase flex items-center gap-2">
                <Database className="w-3.5 h-3.5" /> {t('purges.title')}
              </h3>
              <p className="text-[13px] text-secondary mt-1 max-w-2xl">{t('purges.subtitle')}</p>
            </div>

            <DataTable
              rows={purgeConfigs === undefined ? undefined : pageKeys}
              columns={columns}
              rowKey={(key) => key}
              empty={{
                icon: <Database className="h-8 w-8 text-muted/30" />,
                label: t('purges.table.noMatches'),
              }}
              search={{
                value: searchTerm,
                onChange: (value) => {
                  setSearchTerm(value);
                  setPage(1);
                },
                placeholder: t('purges.table.searchPlaceholder'),
              }}
              filters={
                <div className="flex items-center gap-1 rounded-[10px] border border-border-dim bg-sidebar/30 p-1">
                  {([
                    { id: 'all', label: t('purges.table.filterAll') },
                    { id: 'enabled', label: t('purges.modals.config.enabled') },
                    { id: 'disabled', label: t('purges.modals.config.disabled') },
                  ] as const).map((tab) => (
                    // Stays raw: a segmented-filter tab whose fill swaps with selection — matches no variant.
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(tab.id);
                        setPage(1);
                      }}
                      className={`rounded-[7px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        statusFilter === tab.id
                          ? 'bg-foreground/10 text-foreground'
                          : 'text-secondary hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              }
              footer={{
                mode: "paged",
                page,
                totalPages,
                totalCount: filteredKeys.length,
                pageSize: TABLE_PAGE_SIZE,
                isLoading: purgeConfigs === undefined,
                onPageChange: setPage,
              }}
              minWidthClassName="min-w-[900px]"
            />

          </section>

      {dialogsRequested ? (
        <RetentionRuleDialogs
          purgeConfigs={configs}
          configModalOpen={isConfigModalOpen}
          configModalPipeline={configModalPipeline}
          configModalData={configModalData}
          setConfigModalData={setConfigModalData}
          renderConfigToggle={() => (
            // Stays raw: a bare toggle glyph whose colour is the state — matches no variant.
            <button
              onClick={() => setConfigModalData({ ...configModalData, enabled: !configModalData.enabled })}
              className={`transition-colors flex-shrink-0 ${configModalData.enabled ? "text-brand" : "text-muted"}`}
            >
              {configModalData.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
            </button>
          )}
          closeConfigModal={() => setIsConfigModalOpen(false)}
          saveConfig={async () => {
            if (!configModalPipeline) return;
            // Write exactly what the select displays. The old fallback pair
            // disagreed (display ?? 90, save || 30), so a modal opened before
            // the server sent a value showed "90 Days" and silently saved 30.
            const retentionDays = Math.max(30, configModalData.retentionDays ?? 90);
            const updated = {
              ...configs,
              [configModalPipeline]: {
                enabled: configModalData.enabled,
                retentionDays,
                interval: configModalData.interval,
                hourUtc: configModalData.hourUtc,
                dayOfWeek: configModalData.dayOfWeek !== undefined ? configModalData.dayOfWeek : 0,
                dayOfMonth: configModalData.dayOfMonth !== undefined ? configModalData.dayOfMonth : 1,
              },
            };
            const outcome = await action.run(
              () => updatePurgeConfigs({ configStr: JSON.stringify(updated) }),
              { fallbackMessage: t('purges.saveFailed') }
            );
            if (outcome.ok) setIsConfigModalOpen(false);
          }}
          confirmModalOpen={isConfirmModalOpen}
          confirmModalPipeline={confirmModalPipeline}
          getConfirmCutoffDate={() =>
            getPurgeCutoffDate(
              confirmModalPipeline ? configs[confirmModalPipeline]?.retentionDays || 90 : 90
            )
          }
          closeConfirmModal={() => setIsConfirmModalOpen(false)}
          confirmManualPurge={async () => {
            if (!confirmModalPipeline) return;
            setIsManualRunning(true);
            const outcome = await action.run(
              () => manualPurgeMutation({ pipelineKey: confirmModalPipeline }),
              { fallbackMessage: t('purges.runFailed') }
            );
            if (outcome.ok) setIsConfirmModalOpen(false);
            setIsManualRunning(false);
          }}
          isManualRunning={isManualRunning}
          cancelModalOpen={isCancelModalOpen}
          cancelModalPipeline={cancelModalPipeline}
          closeCancelModal={() => setIsCancelModalOpen(false)}
          confirmCancelPurge={async () => {
            if (!cancelModalHistoryId) return;
            setIsCancelRunning(true);
            const outcome = await action.run(
              () => cancelPurgeMutation({ historyId: cancelModalHistoryId }),
              { fallbackMessage: t('purges.cancelFailed') }
            );
            setIsCancelRunning(false);
            if (outcome.ok) setIsCancelModalOpen(false);
          }}
          isCancelRunning={isCancelRunning}
        />
      ) : null}
    </>
  );
}
